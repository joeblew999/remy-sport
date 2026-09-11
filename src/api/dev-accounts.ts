/**
 * The demo sign-in picker: every seeded account, with what each one holds.
 *
 * The login screens used to build an address from the role and hope the seed
 * route had created it. The accounts are the Product Owner's people now, with
 * their own addresses, so the screens ask rather than guess — all of them bar
 * the admin, because differences *within* a role are the point of a permission
 * model.
 *
 * It keeps its own gate rather than taking `dev(capability)`: three questions
 * decide it, not one, and they resolve differently on staging than anywhere
 * else. See the handler.
 */

import { z } from "zod"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../domain/model/entities"
import { RELATION, STORED_ROLE } from "../domain/vocabularies"
import { isRefusedStatus } from "../auth.config"
import { fixedSignInCode, permits } from "../environment"
import { usesOutbox } from "../mail/mailer"
import { ORPCError } from "@orpc/server"
import { infrastructure, pub } from "./base"

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


export const accounts = pub
  .use(
    infrastructure(
      "the demo sign-in picker; offered only where a code can actually be read, and never offering the admin on a deployment",
    ),
  )
  .route({ method: "GET", path: "/dev/accounts", summary: "Seeded accounts that can sign in" })
  .output(
    z.object({
      /**
       * The code, when it is fixed.
       *
       * Publishing it is not a leak — it is a published credential by
       * construction, and saying so is more honest than a one-click button
       * that hides where the code came from. Absent locally, where the outbox
       * carries a real generated code instead.
       */
      code: z.string().optional(),
      accounts: z.array(
        z.object({
          role: z.string(),
          email: z.string(),
          name: z.string(),
          holds: z.array(z.string()),
        }),
      ),
    }),
  )
  .handler(async ({ context }) => {
    /**
     * Three questions that used to be one.
     *
     * `usesOutbox` answered all of them, which held only while dev and
     * production were the whole world. Staging wants the picker (it is most of
     * what staging is for), must not offer the admin (it is a deployment, and
     * the admin can impersonate), and sends real mail (so there is no outbox
     * to read a code from, and the code must be published instead).
     */
    const offered = permits(context.env, "seededSignIn")
    const withAdmin = permits(context.env, "offersAdminSignIn")
    const captured = usesOutbox(context.env)
    // Asked of the policy, not of the binding. Staging derives its code and
    // sets no secret, so `Boolean(env.TEST_OTP)` would have 404'd the picker on
    // the one deployment built to offer it.
    const fixed = fixedSignInCode(context.env)
    const demo = Boolean(fixed)
    // Useful only where the codes can actually be read: captured in an outbox,
    // or fixed and published. `.test` addresses have no inbox either way.
    if (!offered || (!captured && !demo)) throw new ORPCError("NOT_FOUND", { message: "Not found" })

    /**
     * Nobody the model does not call ACTIVE.
     *
     * The fixtures hold a SUSPENDED and a DEACTIVATED account to exercise a
     * lifecycle the model describes. Offering them gave a one-click sign-in
     * that failed at `session.create.before` with an unexplained 403 — a button
     * that cannot work, which is what this list exists to avoid.
     *
     * `isRefusedStatus`, not `=== "ACTIVE"`: PENDING_APPROVAL signs in, and the
     * first filter dropped a referee awaiting approval.
     */
    const signable = SEED_ENTITIES.users.filter((u) => !isRefusedStatus(u.statusCode))
    const people = withAdmin ? signable : signable.filter((u) => u.roleCode !== "ADMIN")

    return {
      ...(demo && !captured ? { code: fixed } : {}),
      accounts: people.map((u) => ({
        role: STORED_ROLE[u.roleCode],
        email: u.email,
        name: u.names.en,
        holds: holdsFor(u.id),
      })),
    }
  })
