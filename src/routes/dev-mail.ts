import { Hono } from "hono"
import type { AppEnv } from "../types"
import { readOutbox, clearOutbox, usesOutbox } from "../mail/mailer"

/**
 * Read back mail captured by the `outbox` transport (ADR 010).
 *
 * Exists so tests can assert what an invitation email said, not merely that the
 * invite endpoint returned 200. wrangler dev does simulate Cloudflare's binding
 * and writes bodies to temp files, but the recipient and subject appear only in
 * its stdout, and the files are UUID-named with nothing linking one to the test
 * that produced it — unworkable for a `fullyParallel` suite.
 *
 * **404s whenever the real transport is selected.** In production
 * MAIL_TRANSPORT=cloudflare, so this route does not exist there. That matters:
 * mail bodies carry invitation links and password-reset tokens, and an open
 * endpoint listing them would be a way into any account. The guard is on the
 * transport rather than a NODE_ENV-style flag, because the transport is what
 * actually determines whether anything was captured.
 */

const devMail = new Hono<AppEnv>()

devMail.get("/api/dev/outbox", (c) => {
  if (!usesOutbox(c.env)) return c.notFound()
  return c.json({ messages: readOutbox(c.req.query("to")) })
})

devMail.delete("/api/dev/outbox", (c) => {
  if (!usesOutbox(c.env)) return c.notFound()
  clearOutbox()
  return c.json({ cleared: true })
})

export default devMail
