/**
 * Web Push, proved rather than assumed.
 *
 * The test that would have been easy here is "assert `fetch` was called". It
 * would pass against a sender that posts garbage: every part of Web Push that
 * can be silently wrong is *inside* the body — an ECDH agreement against the
 * wrong key, an HKDF with the wrong info string, a nonce derived from the wrong
 * salt. All of those produce a well-formed POST that no browser can read, and a
 * push service accepts them without complaint because it cannot decrypt them
 * either. The failure surfaces as "notifications just don't arrive".
 *
 * So this decrypts. `receive()` below is the browser's half of RFC 8291,
 * written against the spec rather than against our sender, and every assertion
 * about what a reader sees goes through it. If the encryption is wrong these
 * tests throw; they cannot pass with an unreadable payload.
 *
 * The audience rules are asserted the same way — by reading the text that came
 * out the far end, per device, in that device's language.
 */

import { env } from "cloudflare:test"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import * as schema from "../../src/db/schema"
import { notify } from "../../src/api/push"
import { actorFor, api, signIn } from "./helpers"

const b64url = {
  encode: (bytes: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  decode: (s: string) => {
    const padded = s.padEnd(s.length + ((4 - (s.length % 4)) % 4), "=")
    const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
    return Uint8Array.from(raw, (c) => c.charCodeAt(0))
  },
}

const utf8 = (s: string) => new TextEncoder().encode(s)

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** One HKDF expansion to `length` bytes, which is all RFC 8291 ever needs. */
async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"])
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
  )
}

/** A browser subscribing: an ECDH keypair and 16 random bytes of auth secret. */
async function subscriber(endpoint: string) {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))
  const authSecret = crypto.getRandomValues(new Uint8Array(16))

  return {
    endpoint,
    privateKey: pair.privateKey,
    publicBytes,
    authSecret,
    subscription: {
      endpoint,
      expirationTime: null,
      keys: { p256dh: b64url.encode(publicBytes), auth: b64url.encode(authSecret) },
    },
  }
}

type Subscriber = Awaited<ReturnType<typeof subscriber>>

/**
 * The receiving half of RFC 8291 + RFC 8188 — what the browser does before it
 * hands a payload to the service worker.
 *
 * Body layout is `salt(16) || rs(4) || idlen(1) || serverPublicKey(65) || ct`.
 */
async function receive(sub: Subscriber, body: ArrayBuffer): Promise<unknown> {
  const bytes = new Uint8Array(body)
  const salt = bytes.subarray(0, 16)
  const idLength = bytes[20]!
  const serverPublicBytes = bytes.subarray(21, 21 + idLength)
  const ciphertext = bytes.subarray(21 + idLength)

  const serverKey = await crypto.subtle.importKey(
    "raw",
    serverPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, sub.privateKey, 256),
  )

  // The key-derivation info that binds the secret to *both* public keys. Get
  // the order of the two keys wrong here and everything still runs, producing
  // a plausible key that decrypts nothing.
  const ikm = await hkdf(
    shared,
    sub.authSecret,
    concat(utf8("WebPush: info\0"), sub.publicBytes, serverPublicBytes),
    32,
  )
  const cek = await hkdf(ikm, salt, utf8("Content-Encoding: aes128gcm\0"), 16)
  const nonce = await hkdf(ikm, salt, utf8("Content-Encoding: nonce\0"), 12)

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"])
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext),
  )

  // Records are padded and end with a delimiter byte — 2 for the last record.
  let end = plain.length
  while (end > 0 && plain[end - 1] === 0) end -= 1
  return JSON.parse(new TextDecoder().decode(plain.subarray(0, end - 1)))
}

/** Every push the sender attempted, with its endpoint and raw body. */
type Captured = { endpoint: string; headers: Headers; body: ArrayBuffer }

const realFetch = globalThis.fetch
let captured: Captured[] = []
/** Endpoints that should answer 410, as a dead subscription would. */
let goneEndpoints = new Set<string>()

beforeEach(() => {
  captured = []
  goneEndpoints = new Set()
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith("https://push.test/")) {
      captured.push({
        endpoint: url,
        headers: new Headers(init?.headers as HeadersInit),
        // Copied here, not kept by reference: the runtime may take ownership of
        // a body ArrayBuffer once the request is dispatched, and reading it
        // afterwards then yields zeroes — which surfaces as "invalid point
        // encoding" from the key import, several layers away from the cause.
        body: (init?.body as ArrayBuffer).slice(0),
      })
      return new Response(null, { status: goneEndpoints.has(url) ? 410 : 201 })
    }
    return realFetch(input as RequestInfo, init)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const db = () => drizzle(env.DB, { schema })

/** A user row, made directly — this file is about delivery, not about sign-in. */
async function makeUser(id: string) {
  await db()
    .insert(schema.user)
    .values({
      id,
      name: id,
      email: `${id}@remy.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
  return id
}

async function follows(userId: string, objectTypeCode: "TEAM" | "EVENT" | "GAME", objectId: string) {
  await db()
    .insert(schema.subscription)
    .values({ userId, objectTypeCode, objectId, subscribedAt: new Date().toISOString() })
    .onConflictDoNothing()
}

async function registerDevice(userId: string, sub: Subscriber, locale: string) {
  await db()
    .insert(schema.userNotificationChannel)
    .values({
      userId,
      channelCode: "PUSH",
      // Three columns now, not one JSON blob: the endpoint is the row's
      // identity and has to be queryable.
      address: sub.endpoint,
      secret: JSON.stringify(sub.subscription.keys),
      localeCode: locale,
      addressLabel: `${userId}-${locale}`,
      isEnabled: true,
      verifiedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
}

const send = (targets: Parameters<typeof notify>[2]["targets"], extra = {}) =>
  notify(db(), env as unknown as Parameters<typeof notify>[1], {
    typeCode: "SCORE_UPDATE",
    targets,
    tag: "score:g1",
    render: (locale) => ({
      title: `T-${locale}`,
      body: `B-${locale}`,
      url: "#/games/g1",
    }),
    ...extra,
  })

describe("Web Push delivery", () => {
  it("encrypts a payload the subscribing browser can actually read", async () => {
    const user = await makeUser("push-reader")
    const device = await subscriber("https://push.test/reader")
    await registerDevice(user, device, "en")
    await follows(user, "TEAM", "team-1")

    const result = await send([{ objectTypeCode: "TEAM", objectId: "team-1" }])

    expect(result.sent).toBe(1)
    expect(captured).toHaveLength(1)

    // The proof: the browser's own key opens it. A sender that agreed on the
    // wrong secret, or derived the nonce from the wrong salt, throws here.
    const payload = await receive(device, captured[0]!.body)
    expect(payload).toEqual({
      title: "T-en",
      body: "B-en",
      url: "#/games/g1",
      tag: "score:g1",
    })
  })

  it("signs with VAPID and declares the encoding the browser expects", async () => {
    const user = await makeUser("push-headers")
    const device = await subscriber("https://push.test/headers")
    await registerDevice(user, device, "en")
    await follows(user, "GAME", "game-1")

    await send([{ objectTypeCode: "GAME", objectId: "game-1" }])

    const { headers } = captured[0]!
    // `vapid t=<jwt>, k=<public key>` — without the scheme the push service
    // returns 401 and nothing is delivered.
    expect(headers.get("authorization")).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/)
    expect(headers.get("content-encoding")).toBe("aes128gcm")
    // The collapse key, so a later score replaces this card rather than
    // stacking a second one beside it.
    expect(headers.get("topic")).toBe("score:g1")
  })

  it("sends each device in the language that device subscribed in", async () => {
    const user = await makeUser("push-bilingual")
    const phone = await subscriber("https://push.test/phone-th")
    const laptop = await subscriber("https://push.test/laptop-en")
    await registerDevice(user, phone, "th")
    await registerDevice(user, laptop, "en")
    await follows(user, "TEAM", "team-2")

    await send([{ objectTypeCode: "TEAM", objectId: "team-2" }])

    expect(captured).toHaveLength(2)
    const byEndpoint = new Map(captured.map((c) => [c.endpoint, c]))
    const thai = await receive(phone, byEndpoint.get(phone.endpoint)!.body)
    const english = await receive(laptop, byEndpoint.get(laptop.endpoint)!.body)

    // One person, two devices, two languages — which is why the locale is
    // stored per device and not on the user.
    expect((thai as { title: string }).title).toBe("T-th")
    expect((english as { title: string }).title).toBe("T-en")
  })

  it("notifies someone following the event, not only the game", async () => {
    const user = await makeUser("push-event-follower")
    const device = await subscriber("https://push.test/event")
    await registerDevice(user, device, "en")
    await follows(user, "EVENT", "event-1")

    const result = await send([
      { objectTypeCode: "GAME", objectId: "game-x" },
      { objectTypeCode: "EVENT", objectId: "event-1" },
    ])
    expect(result.sent).toBe(1)
  })

  it("wakes a reader once when they follow both the team and the event", async () => {
    const user = await makeUser("push-double")
    const device = await subscriber("https://push.test/double")
    await registerDevice(user, device, "en")
    await follows(user, "TEAM", "team-3")
    await follows(user, "EVENT", "event-3")

    await send([
      { objectTypeCode: "TEAM", objectId: "team-3" },
      { objectTypeCode: "EVENT", objectId: "event-3" },
    ])

    // Two matching rows, one phone in a pocket.
    expect(captured).toHaveLength(1)
  })

  it("says nothing to the person who entered the score", async () => {
    const actor = await makeUser("push-actor")
    const device = await subscriber("https://push.test/actor")
    await registerDevice(actor, device, "en")
    await follows(actor, "TEAM", "team-4")

    const result = await send([{ objectTypeCode: "TEAM", objectId: "team-4" }], { exclude: actor })
    expect(result.sent).toBe(0)
    expect(captured).toHaveLength(0)
  })

  it("respects a mute for that type, and only that type", async () => {
    const user = await makeUser("push-muted")
    const device = await subscriber("https://push.test/muted")
    await registerDevice(user, device, "en")
    await follows(user, "TEAM", "team-5")
    await db().insert(schema.userNotificationPreference).values({
      userId: user,
      notificationTypeCode: "SCORE_UPDATE",
      channelCode: "PUSH",
      isEnabled: false,
    })

    const muted = await send([{ objectTypeCode: "TEAM", objectId: "team-5" }])
    expect(muted.sent).toBe(0)

    // The final whistle is a different type and still gets through — a mute is
    // per type, not a blanket off switch.
    const other = await notify(db(), env as never, {
      typeCode: "MATCH_END",
      targets: [{ objectTypeCode: "TEAM", objectId: "team-5" }],
      tag: "status:g5",
      render: () => ({ title: "final", body: "", url: "#/" }),
    })
    expect(other.sent).toBe(1)
  })

  it("sends nothing to someone who follows nothing", async () => {
    const user = await makeUser("push-unfollowed")
    const device = await subscriber("https://push.test/unfollowed")
    await registerDevice(user, device, "en")

    const result = await send([{ objectTypeCode: "TEAM", objectId: "team-6" }])
    expect(result.sent).toBe(0)
  })

  it("forgets a device the push service reports as gone", async () => {
    const user = await makeUser("push-gone")
    const device = await subscriber("https://push.test/gone")
    await registerDevice(user, device, "en")
    await follows(user, "TEAM", "team-7")
    goneEndpoints.add(device.endpoint)

    const result = await send([{ objectTypeCode: "TEAM", objectId: "team-7" }])
    expect(result.gone).toBe(1)

    // 410 means the subscription is permanently dead. Left in place it would be
    // retried on every score for the life of the row.
    const left = await db()
      .select()
      .from(schema.userNotificationChannel)
      .where(eq(schema.userNotificationChannel.userId, user))
    expect(left).toHaveLength(0)
  })

  /**
   * The whole path, over HTTP: a referee enters a score and a spectator's phone
   * lights up with the right words in the right language.
   *
   * Everything above tests `notify` directly. This is the only test that proves
   * the trigger is *wired* — that `enterScore` calls it, with this game's teams
   * and event as targets, and that the copy is the model's rather than a
   * hardcoded string. Wiring is exactly what silently goes missing.
   */
  it("reaches a follower when a referee enters a live score", async () => {
    const cookie = await signIn(actorFor("ORGANIZER"))

    // A game in an event this organiser actually runs. `canSetStatus` is the
    // server's own answer, so picking on it cannot drift from the model — the
    // first attempt took games[0] and got a 403 the moment the fixtures grew
    // past one event.
    const games = await api("/api/games", { cookie })
    const { games: all } = (await games.json()) as {
      games: { id: string; homeTeamId: string; canSetStatus: boolean }[]
    }
    const game = all.find((g) => g.canSetStatus)!
    expect(game, "no game this organiser may set the status of").toBeTruthy()

    const fan = await makeUser("push-e2e-fan")
    const device = await subscriber("https://push.test/e2e")
    await registerDevice(fan, device, "en")
    await follows(fan, "TEAM", game.homeTeamId)

    // Live first: a score entered on a game that is not being played is a
    // records correction, and deliberately silent.
    await api(`/api/games/${game.id}/status`, {
      method: "PUT",
      body: JSON.stringify({ id: game.id, statusCode: "LIVE" }),
      cookie,
    })
    captured = []

    const res = await api(`/api/games/${game.id}/score`, {
      method: "PUT",
      body: JSON.stringify({ id: game.id, homeScore: 61, awayScore: 58 }),
      cookie,
    })
    expect(res.status).toBe(200)

    expect(captured, "entering a live score notified nobody").toHaveLength(1)
    const payload = (await receive(device, captured[0]!.body)) as {
      title: string
      url: string
      tag: string
    }
    // The score is in the title, so it is readable on a lock screen without
    // opening anything.
    expect(payload.title).toContain("61")
    expect(payload.title).toContain("58")
    expect(payload.url).toBe(`#/games/${game.id}`)
    expect(payload.tag).toBe(`score:${game.id}`)
  })

  it("stays quiet when a score is corrected after the game is over", async () => {
    const cookie = await signIn(actorFor("ORGANIZER"))
    const games = await api("/api/games", { cookie })
    const { games: all } = (await games.json()) as {
      games: { id: string; homeTeamId: string; canSetStatus: boolean }[]
    }
    const theirs = all.filter((g) => g.canSetStatus)
    const game = theirs[1] ?? theirs[0]!

    const fan = await makeUser("push-e2e-quiet")
    const device = await subscriber("https://push.test/e2e-quiet")
    await registerDevice(fan, device, "en")
    await follows(fan, "TEAM", game.homeTeamId)

    await api(`/api/games/${game.id}/status`, {
      method: "PUT",
      body: JSON.stringify({ id: game.id, statusCode: "FINISHED" }),
      cookie,
    })
    captured = []

    await api(`/api/games/${game.id}/score`, {
      method: "PUT",
      body: JSON.stringify({ id: game.id, homeScore: 70, awayScore: 70 }),
      cookie,
    })

    // Fixing a typo in last week's result must not wake anyone at midnight.
    expect(captured).toHaveLength(0)
  })

  it("sends a test notification to my devices whether or not I follow anything", async () => {
    const cookie = await signIn(actorFor("SPECTATOR"))
    const device = await subscriber("https://push.test/self-test")

    // Registered through the API so this exercises the same path a phone does.
    await api("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ subscription: device.subscription, label: "Test device" }),
      cookie,
    })
    captured = []

    const res = await api("/api/push/test", {
      method: "POST",
      body: JSON.stringify({ locale: "en" }),
      cookie,
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { sent: number }).sent).toBe(1)

    // Following nothing and muting nothing: the button answers "can this device
    // be reached", so it must not go through the filters that might be the
    // reason a reader is pressing it.
    const payload = (await receive(device, captured[0]!.body)) as { title: string; tag: string }
    expect(payload.title).toBeTruthy()
    expect(payload.tag).toBe("test")
  })

  it("keeps a device when the push service merely fails", async () => {
    const user = await makeUser("push-flaky")
    const device = await subscriber("https://push.test/flaky")
    await registerDevice(user, device, "en")
    await follows(user, "TEAM", "team-8")

    // A 500 is the push service having a bad day, not the reader uninstalling.
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch
    const result = await send([{ objectTypeCode: "TEAM", objectId: "team-8" }])

    expect(result.sent).toBe(0)
    expect(result.gone).toBe(0)
    const left = await db()
      .select()
      .from(schema.userNotificationChannel)
      .where(eq(schema.userNotificationChannel.userId, user))
    expect(left).toHaveLength(1)
  })
})
