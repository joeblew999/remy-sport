/**
 * The endpoints that exist only where the policy table allows them.
 *
 * One file rather than four Hono routers, and one gate rather than a
 * `permits()` line remembered per route — `dev(capability)` in ./base.ts does
 * it, and the authz walk prints every one of them. Which capability gates
 * which endpoint is unchanged from the routers these replace.
 *
 * Their URLs are unchanged too, so `bun run ops`, the Playwright suites and
 * anything else calling them by path keep working; what changes is that they
 * are now in the published document and the typed client.
 */

import { like, sql } from "drizzle-orm"
import { z } from "zod"
import { SEED_STATEMENTS } from "../db/seed"
import * as schema from "../db/schema"
import { recent } from "../analytics"
import { clearOutbox, readOutbox } from "../mail/mailer"
import { LOCALES, type ReleasedLocale } from "../domain/vocabularies"
import { PREVIEWS, TEMPLATES } from "../mail/templates"
import { dev } from "./base"

/**
 * Seed the database with the Product Owner's model.
 *
 * Executes the statements src/db/seed.ts derives from the model, in one batch
 * so D1 wraps it in a transaction and a foreign key unsatisfied mid-file
 * cannot leave the database half-seeded. `INSERT OR IGNORE` throughout, so
 * re-seeding neither duplicates rows nor clobbers edited ones.
 *
 * No admin session is required: seeding the first admin cannot itself need an
 * admin. What keeps it safe is that it does not exist on production —
 * `bun run db seed-remote` applies the same statements through wrangler, so no
 * HTTP surface is needed there. Until 2026-08-28 it was open on a public
 * domain, where anyone could spend 330 D1 statements per call.
 */
export const seed = dev("seedRoute")
  .route({ method: "POST", path: "/seed", summary: "Seed the database from the model" })
  .output(z.object({ statements: z.number(), written: z.number() }))
  .handler(async ({ context }) => {
    const results = await context.env.DB.batch(
      SEED_STATEMENTS.map((statement) => context.env.DB.prepare(statement)),
    )
    return {
      statements: SEED_STATEMENTS.length,
      written: results.reduce((n: number, r: D1Result) => n + (r.meta?.changes ?? 0), 0),
    }
  })

/**
 * Prune accumulated sessions (ADR 014).
 *
 * Every sign-in creates a session row and nothing removed them, so a local
 * database reached 990 — 314 for one seeded actor. Not merely untidy:
 * `list-sessions` returns a bounded set, so past roughly a hundred rows the
 * *newest* session stops being returned and the devices page can no longer
 * identify which one you are using.
 *
 * Production must not have it — a bulk session delete is a denial-of-service
 * primitive, and real sessions expire on their own.
 */
export const pruneSessions = dev("devSessionRoutes")
  .route({ method: "POST", path: "/dev/prune-sessions", summary: "Prune old sessions" })
  .output(z.object({ before: z.number(), after: z.number() }))
  .handler(async ({ context }) => {
    const count = async () =>
      (await context.db.select({ n: sql<number>`count(*)` }).from(schema.session).get())?.n ?? 0
    const before = await count()

    // Keep the five most recent per user rather than wiping everything: the
    // devices page is only worth testing when there is more than one session,
    // and a suite that always starts from exactly one would not exercise
    // revoke.
    await context.db.run(sql`
      DELETE FROM session
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
          FROM session
        ) WHERE rn <= 5
      )
    `)

    return { before, after: await count() }
  })

/**
 * The telemetry ring, when there is no dataset to send it to.
 *
 * Gated on the same capability that decides whether the ring is *filled*
 * (`hasLocalEventStore`), so the endpoint cannot exist without data behind it
 * or vice versa. An earlier version guarded on the Analytics Engine binding
 * being absent, which sounded self-enforcing and was wrong: `wrangler dev`
 * binds it and quietly discards the writes, so the ring stayed empty and this
 * always 404'd.
 */
export const analyticsEvents = dev("hasLocalEventStore")
  .route({ method: "GET", path: "/dev/events", summary: "Recent telemetry, held locally" })
  .output(
    z.object({
      // When this isolate started collecting. Reported alongside the events
      // because an empty ring is ambiguous: "nothing has failed" and "the
      // worker reloaded and threw the evidence away" need opposite responses.
      since: z.string(),
      events: z.array(
        z.object({
          event: z.string(),
          country: z.string(),
          at: z.string(),
          fields: z.record(z.string(), z.union([z.string(), z.number()])),
        }),
      ),
    }),
  )
  // Spread because the ring is exposed `readonly` — deliberately, so nothing
  // can mutate the record in place — and the serialised output is a plain list.
  .handler(async () => {
    const { since, events } = recent()
    return { since, events: [...events] }
  })

/**
 * Mail captured by the `outbox` transport (ADR 010).
 *
 * So a test can assert what an invitation email *said*, not merely that the
 * invite endpoint returned 200. `wrangler dev` does write bodies to temp
 * files, but recipient and subject appear only in its stdout and the files are
 * UUID-named with nothing linking one to the test that produced it —
 * unworkable for a `fullyParallel` suite.
 *
 * Headers are carried because without them the outbox flatters the sender:
 * List-Unsubscribe present or missing looks identical in a capture that drops
 * them.
 */
const capturedMail = z.object({
  id: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  createdAt: z.string(),
  from: z.string(),
  headers: z.record(z.string(), z.string()),
  html: z.string().optional(),
})

export const outboxList = dev("devMailRoutes")
  .route({ method: "GET", path: "/dev/outbox", summary: "Mail captured by the outbox transport" })
  .input(z.object({ to: z.string().optional() }))
  .output(z.object({ messages: z.array(capturedMail) }))
  .handler(async ({ input }) => ({ messages: readOutbox(input.to) }))

export const outboxClear = dev("devMailRoutes")
  .route({ method: "DELETE", path: "/dev/outbox", summary: "Discard captured mail" })
  .output(z.object({ cleared: z.literal(true) }))
  .handler(async () => {
    clearOutbox()
    return { cleared: true as const }
  })

/**
 * Clear a pending sign-in code so a test can request a fresh one.
 *
 * Matches on the suffix, not the bare email: Better Auth prefixes the purpose
 * (`sign-in-otp-<email>`), and other purposes — verification, change-email —
 * each have their own row. Matching the bare email deleted nothing at all,
 * which is as useless as not having this and looked like it worked.
 */
export const otpClear = dev("devMailRoutes")
  // `inputStructure: "detailed"` because the recipient is a query parameter and
  // oRPC reads a DELETE's input from the body by default. Callers pass
  // `?to=...` — scripts, the Playwright suites — so the wire shape is kept and
  // the handler reaches into `query` rather than every caller changing.
  .route({
    method: "DELETE",
    path: "/dev/otp",
    summary: "Clear a pending sign-in code",
    inputStructure: "detailed",
  })
  .input(z.object({ query: z.object({ to: z.string().min(1, "to is required") }) }))
  .output(z.object({ cleared: z.array(z.string()) }))
  .handler(async ({ input, context }) => {
    const removed = await context.db
      .delete(schema.verification)
      .where(like(schema.verification.identifier, `%${input.query.to}`))
      .returning({ identifier: schema.verification.identifier })
    return { cleared: removed.map((r) => r.identifier) }
  })

/**
 * Every email the app sends, rendered from its template with the fixtures'
 * names: `/api/dev/email/<name>?locale=th`, `&part=text` for the text part.
 *
 * A *preview* — it reads no database and no outbox, and the code it shows is
 * the literal 424242, never anyone's issued one. So it lives beside the
 * templates it renders rather than beside the outbox, whatever the URL's shape
 * suggests: nothing here was ever sent.
 *
 * `name` is an enum of the templates that exist, so an unknown one is a 400
 * naming the valid choices rather than a 404 that reads like a routing fault.
 *
 * Returned as a `File`, which the OpenAPI handler serves as a raw body with
 * its own Content-Type — the Product Owner opens this in a browser to read
 * the copy, and JSON-wrapped HTML would be unreadable. It shows in /api/doc as
 * a binary response, which is what it is.
 *
 * Behind `devMailRoutes` like the outbox: a preview is harmless, but it is the
 * same capability family and the route it replaces sat there.
 */
export const mailPreview = dev("devMailRoutes")
  .route({
    method: "GET",
    path: "/dev/email/{name}",
    summary: "Render a mail template with the fixtures' names",
  })
  .input(
    z.object({
      name: z.enum(TEMPLATES),
      locale: z.enum(LOCALES).default("en"),
      part: z.enum(["html", "text"]).default("html"),
    }),
  )
  .output(z.instanceof(File))
  .handler(async ({ input, context }) => {
    const origin = (context.env.BETTER_AUTH_URL ?? new URL(context.request.url).origin).replace(/\/+$/, "")
    const mail = PREVIEWS[input.name]({ locale: input.locale as ReleasedLocale, origin })
    return input.part === "text"
      ? new File([mail.text], `${input.name}.txt`, { type: "text/plain; charset=utf-8" })
      : new File([mail.html], `${input.name}.html`, { type: "text/html; charset=utf-8" })
  })
