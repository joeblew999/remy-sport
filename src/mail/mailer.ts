import type { Bindings } from "../types"
import { permits } from "../environment"

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
  /**
   * Which sending identity this is, and it is not decoration.
   *
   * Sign-in is email OTP, so authentication *is* email. Bulk notification mail
   * sharing one From address with it means a spam complaint about scores takes
   * sign-in down with it — nobody can log in to turn the notifications off,
   * which is the worst possible order for those two things to fail in.
   *
   * DKIM and reputation attach at the domain level, so the split is a
   * subdomain rather than a different local part: `noreply@remy.…` for
   * transactional, `notifications@notify.remy.…` for bulk. See
   * docs/dev/email-deliverability.md for what that needs in DNS.
   *
   * Transactional is the default because it is the one that must never be
   * skipped: a new caller that forgets to say gets the *safer* identity, and
   * the mistake is a notification sent from the sign-in domain rather than a
   * sign-in code sent from a bulk one.
   */
  kind?: "transactional" | "bulk"
  /**
   * Headers this message must carry. Bulk mail carries List-Unsubscribe;
   * transactional mail must not — see src/api/unsubscribe.ts.
   */
  headers?: Record<string, string>
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/** Default sender. Must belong to a domain onboarded to Email Service. */
export const DEFAULT_FROM = "noreply@remy.ubuntusoftware.net"

/**
 * Bulk sender, on its own subdomain so its reputation is its own.
 *
 * Overridable by `NOTIFY_EMAIL_FROM` the same way `EMAIL_FROM` overrides the
 * transactional one — the pattern was already there, this follows it.
 */
// Exported so `cf:env:plan` names the same domains the mailer will actually
// send from, rather than only the ones a [vars] block happens to override.
export const DEFAULT_BULK_FROM = "notifications@notify.remy.ubuntusoftware.net"

/** The From address for one message, by kind. */
export function senderFor(env: Bindings, kind: Mail["kind"]): string {
  return kind === "bulk"
    ? (env.NOTIFY_EMAIL_FROM ?? DEFAULT_BULK_FROM)
    : (env.EMAIL_FROM ?? DEFAULT_FROM)
}

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
        from: senderFor(env, mail.kind),
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
        ...(mail.headers ? { headers: mail.headers } : {}),
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
  /**
   * Recorded so the outbox can prove what a deployment would actually send.
   *
   * Without these the outbox flatters the sender: List-Unsubscribe either
   * present or missing looks identical in a capture that drops headers, and
   * "transactional mail must carry no unsubscribe header" is exactly the kind
   * of assertion that has to be made against what goes on the wire.
   */
  from: string
  headers: Record<string, string>
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

function outboxMailer(env: Bindings): Mailer {
  return {
    async send(mail) {
      outbox().push({
        id: crypto.randomUUID(),
        to: mail.to,
        subject: mail.subject,
        body: mail.text,
        createdAt: new Date().toISOString(),
        // The same values `cloudflareMailer` would put on the wire, so an
        // assertion against the outbox is an assertion about what ships.
        from: senderFor(env, mail.kind),
        headers: mail.headers ?? {},
      })
    },
  }
}

/**
 * Is mail captured rather than sent?
 *
 * This is all it means now. It used to stand in for eight unrelated things —
 * whether four dev routes existed, whether telemetry was real, whether the demo
 * picker offered the admin — which held only while there were two environments.
 * Staging needs real mail *and* the seed route, and a boolean about the mail
 * transport cannot say that. See src/environment.ts.
 */
export function usesOutbox(env: Bindings): boolean {
  return permits(env, "capturesMail")
}

export function mailerFor(env: Bindings): Mailer {
  return usesOutbox(env) ? outboxMailer(env) : cloudflareMailer(env)
}
