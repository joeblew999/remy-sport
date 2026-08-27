import { Hono } from "hono"
import type { AppEnv } from "../types"
import { readOutbox, clearOutbox, usesOutbox } from "../mail/mailer"
import { SEED_ENTITIES } from "../db/seed-data"
import { STORED_ROLE } from "../domain/vocabularies"

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

/**
 * The seeded demo accounts, one per role.
 *
 * The login screens used to build `${role}@remy.dev` and hope the seed route
 * had created it. The accounts are the Product Owner's people now, with their
 * own addresses at their own schools, so the screens ask rather than guess —
 * and a role that stops being seeded stops appearing, instead of rendering a
 * button that signs nobody in.
 *
 * Guarded by the same transport check as the outbox: these are only useful
 * where the fixed sign-in code applies, which is exactly where mail is
 * captured rather than sent.
 */
devMail.get("/api/dev/accounts", (c) => {
  if (!usesOutbox(c.env)) return c.json({ error: "Not found" }, 404)
  const byRole = SEED_ENTITIES.users.filter(
    (u, i, all) => all.findIndex((o) => o.roleCode === u.roleCode) === i,
  )
  return c.json({
    accounts: byRole.map((u) => ({
      role: STORED_ROLE[u.roleCode],
      email: u.email,
      name: u.names.en,
    })),
  })
})
