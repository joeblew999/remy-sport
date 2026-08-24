import type { Bindings } from "../types"

/**
 * Outbound email, with a transport that can be swapped for tests.
 *
 * Cloudflare's `send_email` binding is the real transport (ADR 010). Two
 * account-level facts shape everything here:
 *
 *   - Sending to *arbitrary* recipients needs the Workers **Paid** plan and a
 *     sending domain onboarded to Email Service. Until the domain is onboarded,
 *     the binding may only send to verified destination addresses in the
 *     account. Invitations by definition go to people who are not in the
 *     account yet, so both prerequisites are load-bearing.
 *   - `wrangler dev` simulates the binding locally: nothing leaves the machine
 *     and the message *body* is written to a temp file. Safe, but awkward to
 *     assert on — the recipient and subject appear only in wrangler's stdout,
 *     which Playwright's webServer owns, and the files are UUID-named with
 *     nothing tying one to the test that caused it.
 *
 * Hence two transports. `cloudflare` is production. `outbox` captures the
 * message so a test can read it back through `/api/dev/outbox` and assert on
 * the recipient, the subject and the invitation link. That is the difference
 * between "the endpoint returned 200" and "an invitation addressed to this
 * person, carrying this token, actually left the building".
 */

export interface Mail {
  to: string
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/** Default sender. Must belong to a domain onboarded to Email Service. */
const DEFAULT_FROM = "noreply@remy.ubuntusoftware.net"

function cloudflareMailer(env: Bindings): Mailer {
  return {
    async send(mail) {
      if (!env.EMAIL) {
        // Deploying with MAIL_TRANSPORT=cloudflare and no [[send_email]]
        // binding is a config error. Fail loudly rather than silently dropping
        // an invitation the user is waiting for.
        throw new Error(
          "mailer: MAIL_TRANSPORT=cloudflare but no EMAIL binding is configured",
        )
      }
      await env.EMAIL.send({
        from: env.EMAIL_FROM ?? DEFAULT_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
      })
    },
  }
}

/**
 * Captured mail, held in the isolate rather than in D1.
 *
 * This started as a `mail_outbox` table, which meant shipping a permanently
 * empty table to production to satisfy local assertions — test infrastructure
 * in the production schema. In-memory is strictly better here, and not only
 * for tidiness: captured mail is ephemeral test state, so a store that empties
 * when the dev server restarts has the right lifetime. The D1 version
 * accumulated across runs and needed a DELETE endpoint to clear it.
 *
 * Safe because it is only ever the *local dev* transport. Production runs many
 * isolates and this would be wrong there; `usesOutbox` is false there, so it
 * never runs. Under `wrangler dev` the Worker is a single long-lived isolate,
 * which the parallel Playwright suite relies on and which is verified in
 * ADR 010 by running the mail specs repeatedly.
 */
const OUTBOX_KEY = "__remy_dev_outbox__"

/**
 * `body`, not `text`, is the wire name — it is what /api/dev/outbox has always
 * returned and what the specs assert on. Spreading a `Mail` straight through
 * would silently drop it to `text` and leave every body assertion reading
 * undefined.
 */
interface CapturedMail {
  id: string
  to: string
  subject: string
  body: string
  createdAt: string
}

function outbox(): CapturedMail[] {
  const g = globalThis as typeof globalThis & { [OUTBOX_KEY]?: CapturedMail[] }
  if (!g[OUTBOX_KEY]) g[OUTBOX_KEY] = []
  return g[OUTBOX_KEY]
}

export function readOutbox(to?: string): CapturedMail[] {
  const all = outbox()
  return (to ? all.filter((m) => m.to === to) : all).slice().reverse()
}

export function clearOutbox(): void {
  outbox().length = 0
}

function outboxMailer(): Mailer {
  return {
    async send(mail) {
      outbox().push({
        id: crypto.randomUUID(),
        to: mail.to,
        subject: mail.subject,
        body: mail.text,
        createdAt: new Date().toISOString(),
      })
    },
  }
}

/**
 * `outbox` unless explicitly told otherwise.
 *
 * Defaulting the other way would mean a missing var turns a test run into an
 * attempt at real delivery. The var is set to "cloudflare" in wrangler.toml's
 * [vars], so production opts in by configuration rather than by omission.
 */
export function usesOutbox(env: Bindings): boolean {
  return (env.MAIL_TRANSPORT ?? "outbox") !== "cloudflare"
}

export function mailerFor(env: Bindings): Mailer {
  return usesOutbox(env) ? outboxMailer() : cloudflareMailer(env)
}
