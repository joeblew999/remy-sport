import { Hono } from "hono"
import type { AppEnv } from "../types"
import { readOutbox, clearOutbox, usesOutbox } from "../mail/mailer"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/domain/model/entities"
import { RELATION, STORED_ROLE } from "../domain/vocabularies"
import { isRefusedStatus } from "../auth.config"

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

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

/**
 * What this user actually holds, derived from the model — not a written list.
 *
 * Every table-shaped relation says which fixture table links a user to an
 * object and under what filter, so "who is this person, in terms the access
 * matrix uses" is a walk over `RELATION` and the seed. Nothing here names a
 * relation, so one added upstream shows up the same day.
 *
 * This is what makes the seeded accounts useful for checking the GUI against
 * the matrix. Two coaches are not interchangeable — `usr_coach_001` runs
 * org_001 and `usr_coach_003` does not — and two referees differ by which game
 * they are on. A picker that offered one account per role could not show any of
 * that, which is what it did before.
 *
 * Parent relations are skipped: they have no tuple of their own by design, and
 * listing "GAME_EVENT_OWNER gam_002" beside "OWNER evt_002" would say the same
 * fact twice.
 */
function holdsFor(userId: string): string[] {
  const out: string[] = []
  const seed = { ...SEED_ENTITIES, ...SEED_RELATIONSHIPS } as Record<
    string,
    readonly Record<string, unknown>[] | undefined
  >

  for (const r of RELATION) {
    if (r.via !== "table") continue
    const rows = seed[camel(r.sourceTable!)]
    if (!rows) continue

    for (const row of rows) {
      if (r.filterColumn && row[camel(r.filterColumn)] !== r.filterValue) continue
      // A spell that has ended does not still grant the relation.
      if (r.activeToColumn && row[camel(r.activeToColumn)]) continue

      let holder: unknown
      if (r.throughTable) {
        // The link row names an entity, and only that entity knows the user —
        // `player_teams` holds a player, and a minor may have no account.
        const via = seed[camel(r.throughTable)]
        holder = via?.find((p) => p.id === row[camel(r.throughColumn!)])?.[camel(r.userColumn!)]
      } else {
        holder = row[camel(r.userColumn!)]
      }
      if (holder === userId) out.push(`${r.code} ${String(row[camel(r.objectColumn!)])}`)
    }
  }
  return summarise(out)
}

/**
 * Collapse a relation held over and over into one line.
 *
 * A referee is assigned to every game they officiate, so once the fixtures grew
 * into a real season the login screen listed "GAME_REFEREE gam_003 ·
 * GAME_REFEREE gam_005 · …" sixteen times and the useful part — that this
 * person is a referee, and those two are coaches of different teams — was
 * buried. The list exists to show the differences *within* a role at a glance.
 *
 * The first two objects are always named, and the rest counted. A bare count
 * would be tidier and useless: the reason to read this list is to pick somebody
 * to sign in as, and that needs an id you can then go and look at. Two is
 * enough to show that a coach's teams differ from another coach's.
 */
function summarise(held: string[]): string[] {
  const byRelation = new Map<string, string[]>()
  for (const entry of held) {
    const [code = entry, ...rest] = entry.split(" ")
    byRelation.set(code, [...(byRelation.get(code) ?? []), rest.join(" ")])
  }
  return [...byRelation].flatMap(([code, objects]) => {
    const named = objects.slice(0, 2).map((o) => `${code} ${o}`)
    const rest = objects.length - named.length
    return rest > 0 ? [...named, `${code} +${rest} more`] : named
  })
}

/**
 * Every seeded account, with what each one holds.
 *
 * The login screens used to build `${role}@remy.dev` and hope the seed route
 * had created it. The accounts are the Product Owner's people now, with their
 * own addresses at their own schools, so the screens ask rather than guess.
 *
 * All of them bar the admin: the differences *within* a role are the whole point
 * of a permission model, and they are what you need to sign in as to see whether
 * the GUI agrees with the matrix.
 *
 * Available in two situations, and only these. Locally, where mail is captured
 * in the outbox. And on a deployment where TEST_OTP is set, which fixes the code
 * for seeded non-admin accounts — without that there is no way in, because the
 * fixtures' addresses are `.test` and nothing delivers to them.
 *
 * `/api/dev/outbox` is NOT enabled by the second case and must never be: it
 * would expose real people's sign-in codes. Only the account *list* opens up.
 */
devMail.get("/api/dev/accounts", (c) => {
  const outbox = usesOutbox(c.env)
  const demo = Boolean(c.env.TEST_OTP)
  // Locally the outbox makes this useful. On a deployment it is useful only if
  // the codes are fixed, because there is no inbox to read `.test` mail from.
  if (!outbox && !demo) return c.json({ error: "Not found" }, 404)

  /**
   * On a deployment the admin is not offered, and could not sign in this way
   * anyway — src/auth.ts withholds the fixed code from it wherever mail is
   * really sent. That account can impersonate, which is the one power that
   * reaches a real person.
   *
   * Locally it stays in the list: mail is captured, the outbox is readable only
   * by whoever is running the Worker, and the admin console is a thing to
   * develop against.
   */
  /**
   * Nobody the model does not call ACTIVE, either.
   *
   * The fixtures gained a SUSPENDED and a DEACTIVATED account on 2026-08-29, to
   * exercise a lifecycle the model had always described. Both were offered here
   * as one-click sign-ins that then failed at `session.create.before` with a
   * 403 and no explanation — a button that cannot work, which is the thing this
   * list exists to avoid. They are still in the fixtures and still refused;
   * they are simply not offered.
   *
   * `isRefusedStatus`, not `=== "ACTIVE"`: PENDING_APPROVAL signs in, and the
   * first version of this filter dropped a referee awaiting approval — an
   * account the fixtures have precisely so that case is exercised.
   */
  const signable = SEED_ENTITIES.users.filter((u) => !isRefusedStatus(u.statusCode))
  const people = outbox ? signable : signable.filter((u) => u.roleCode !== "ADMIN")

  return c.json({
    /**
     * The code, when it is fixed.
     *
     * Publishing it is not a leak — it is a published credential by
     * construction, and saying so on the page is more honest than a one-click
     * button that hides where the code came from. Absent locally, where the
     * outbox carries a real generated code instead.
     */
    ...(demo && !outbox ? { code: c.env.TEST_OTP } : {}),
    accounts: people.map((u) => ({
      role: STORED_ROLE[u.roleCode],
      email: u.email,
      name: u.names.en,
      holds: holdsFor(u.id),
    })),
  })
})
