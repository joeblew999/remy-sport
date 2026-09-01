/**
 * One-click unsubscribe, per RFC 8058.
 *
 * Every bulk notification email carries `List-Unsubscribe` and
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Gmail and Yahoo require
 * it of bulk senders, and the reader who wants out is the one most likely to
 * press "spam" instead if they cannot find the door.
 *
 * **Transactional mail carries neither header.** Offering to unsubscribe from
 * your own sign-in code is nonsense, and the header would be a lie: there is no
 * preference to turn off, so the endpoint could not honour it. Both directions
 * are asserted in tests, because the failure is silent in each — a missing
 * header on bulk mail is a spam complaint, and a present one on an OTP is a
 * promise that cannot be kept.
 *
 * ## GET renders, POST acts
 *
 * This is the part that is easy to get backwards and expensive when you do.
 *
 * Mail scanners, link previewers and corporate security gateways **follow GET
 * links** in mail they are inspecting. So a GET that unsubscribes silently
 * removes people whose employer scans their inbox — they never clicked
 * anything, and the first they know is that the notifications stopped.
 *
 * So `GET` renders a confirmation page with a button and changes nothing, and
 * `POST` performs the unsubscribe with no confirmation, which is what RFC 8058
 * requires of a one-click header. There is a test for the GET-does-not-act
 * case specifically.
 *
 * ## The token
 *
 * Unauthenticated by necessity: somebody who has stopped opening the app is
 * exactly who this is for, and requiring a sign-in to stop email is how you get
 * marked as spam instead.
 *
 * So the URL carries a token signed with `BETTER_AUTH_SECRET`, scoped to
 * exactly one (userId, notificationTypeCode, EMAIL) triple. It authorises that
 * one preference going to off and nothing else — it cannot read anything,
 * cannot enumerate, and cannot change any other setting. **The address is never
 * in the URL**: a link in an email ends up in browser history, referrer headers
 * and proxy logs, and the userId is opaque where an address is not.
 */

import { Hono } from "hono"
import * as schema from "../db/schema"
import { database } from "./base"
import { track } from "../analytics"
import type { AppEnv, Bindings } from "../types"

/** What the token authorises. Deliberately the whole of it. */
export type UnsubscribeClaim = {
  userId: string
  typeCode: string
}

const enc = new TextEncoder()

/** base64url, because a token travels in a URL. */
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)))
}

/**
 * A token for one preference.
 *
 * The channel is fixed at EMAIL rather than carried, so a token cannot be bent
 * into turning push off — the only thing a link in an email should be able to
 * stop is that email.
 */
export async function unsubscribeToken(
  env: Bindings,
  claim: UnsubscribeClaim,
): Promise<string> {
  const body = b64url(enc.encode(`${claim.userId}:${claim.typeCode}`))
  return `${body}.${await hmac(env.BETTER_AUTH_SECRET, body)}`
}

/**
 * The claim a token carries, or null.
 *
 * Compared with `timingSafeEqual`-shaped care: the signature is recomputed and
 * compared in constant time, because a token is a credential and a comparison
 * that returns early leaks it one byte at a time.
 */
export async function verifyToken(
  env: Bindings,
  token: string,
): Promise<UnsubscribeClaim | null> {
  const [body, sig] = token.split(".")
  if (!body || !sig) return null
  const expected = await hmac(env.BETTER_AUTH_SECRET, body)
  if (sig.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return null

  try {
    const decoded = atob(body.replace(/-/g, "+").replace(/_/g, "/"))
    const at = decoded.indexOf(":")
    if (at < 1) return null
    return { userId: decoded.slice(0, at), typeCode: decoded.slice(at + 1) }
  } catch {
    return null
  }
}

/** The link that goes in the header and in the body. */
export async function unsubscribeUrl(
  env: Bindings,
  claim: UnsubscribeClaim,
): Promise<string> {
  const origin = (env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "")
  return `${origin}/api/unsubscribe?t=${await unsubscribeToken(env, claim)}`
}

/**
 * The two headers a bulk message carries, and only a bulk one.
 *
 * `List-Unsubscribe-Post` is what makes the header *one-click*: without it a
 * mail client shows the link and the reader still has to visit a page.
 */
export async function unsubscribeHeaders(
  env: Bindings,
  claim: UnsubscribeClaim,
): Promise<Record<string, string>> {
  return {
    "List-Unsubscribe": `<${await unsubscribeUrl(env, claim)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

const unsubscribe = new Hono<AppEnv>()

/**
 * Render, and change nothing.
 *
 * A scanner following this link must leave the reader's preferences exactly as
 * it found them. The page is plain HTML with a form: no app, no session, no
 * JavaScript, because somebody who has stopped using the app should not have to
 * load it to stop the email.
 */
unsubscribe.get("/api/unsubscribe", async (c) => {
  const claim = await verifyToken(c.env, c.req.query("t") ?? "")
  if (!claim) return c.text("This unsubscribe link is not valid.", 400)

  // Deliberately no database read either. Rendering must not confirm that a
  // user exists — a valid-looking token that says "already unsubscribed" for
  // one id and "confirm?" for another is an enumeration oracle.
  return c.html(
    `<!doctype html><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Unsubscribe</title>` +
      `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem}` +
      `button{font:inherit;padding:.6rem 1.2rem;border-radius:6px;border:1px solid #333;background:#111;color:#fff;cursor:pointer}</style>` +
      `<h1>Stop these emails?</h1>` +
      `<p>You will stop receiving this kind of email. Push notifications and ` +
      `sign-in emails are not affected.</p>` +
      `<form method="post" action="/api/unsubscribe?t=${escapeAttr(c.req.query("t") ?? "")}">` +
      `<button type="submit">Unsubscribe</button></form>`,
  )
})

/**
 * Act, with no confirmation. This is the RFC 8058 path.
 *
 * A mail client posts here on the reader's behalf when they press the client's
 * own unsubscribe button, and the confirmation page above is what the same link
 * shows a human who follows it. One URL, two methods, two very different
 * meanings.
 */
unsubscribe.post("/api/unsubscribe", async (c) => {
  const claim = await verifyToken(c.env, c.req.query("t") ?? "")
  if (!claim) return c.text("This unsubscribe link is not valid.", 400)

  const db = database(c.env)
  /**
   * Exactly one row, and only ever to `false`.
   *
   * An upsert rather than an update: the preference may not exist yet, because
   * absence means "not stated" and EMAIL treats that as off — but a reader who
   * has pressed unsubscribe has stated it, and the difference matters if the
   * default ever changes.
   */
  await db
    .insert(schema.userNotificationPreference)
    .values({
      userId: claim.userId,
      notificationTypeCode: claim.typeCode,
      channelCode: "EMAIL",
      isEnabled: false,
    })
    .onConflictDoUpdate({
      target: [
        schema.userNotificationPreference.userId,
        schema.userNotificationPreference.notificationTypeCode,
        schema.userNotificationPreference.channelCode,
      ],
      set: { isEnabled: false },
    })

  track(c.env, "notify.unsubscribed", { typeCode: claim.typeCode, channel: "EMAIL" })
  return c.html(
    `<!doctype html><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Unsubscribed</title>` +
      `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem}</style>` +
      `<h1>Unsubscribed</h1><p>You will not get this kind of email again.</p>`,
  )
})

/** The token is echoed into an attribute, so it is escaped as one. */
const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")

export default unsubscribe
