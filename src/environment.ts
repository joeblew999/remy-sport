/**
 * Which environment this is, and what that permits.
 *
 * Eight unrelated behaviours used to be decided by `usesOutbox(env)` — mail
 * capture, the analytics dataset, the telemetry sampling rate, whether seeded
 * sign-in offers the admin, and whether four dev routes exist at all. That
 * worked because there were two environments and the answers happened to agree.
 *
 * Staging is the counterexample. Staging must send **real mail** and still have
 * the seed route, seeded accounts and its own telemetry — a combination the
 * proxy cannot express. Under it, turning on real mail for staging would
 * silently delete four routes and start writing staging's telemetry into
 * production's dataset. Neither would error; both would be discovered later.
 *
 * So the environment is declared, not inferred, and each capability is a named
 * row. "Does staging have the seed route" is now readable rather than deduced
 * from what its mail transport happens to be.
 *
 * ## Unset means production
 *
 * The same rule as the smoke surface classifier and the dev rejection panel:
 * absent or unrecognised configuration resolves to the *strictest* answer. A
 * deployment that forgets to declare itself gets no dev routes, real mail and
 * real analytics — the failure is a missing convenience, never an opened door.
 */

export const ENVIRONMENTS = ["dev", "staging", "production"] as const
export type Environment = (typeof ENVIRONMENTS)[number]

/**
 * What an environment permits. One row per capability, one column per
 * environment, so a new environment is a column and a new capability is a row.
 */
export interface Policy {
  /**
   * Mail is captured in memory instead of sent.
   *
   * The only thing `usesOutbox` still means. **Staging sends real mail on
   * purpose**: "does email actually arrive" is exactly the question local
   * cannot answer, and it is the one that has already bitten us.
   */
  capturesMail: boolean
  /**
   * `POST /api/seed` exists.
   *
   * Staging keeps it — an environment you cannot reseed is one you cannot use
   * to reproduce anything. Production must never have it: it is 330 D1
   * statements to anyone who finds it.
   */
  seedRoute: boolean
  /**
   * `/api/dev/outbox` and friends exist.
   *
   * Dev only, and not because of tidiness: the outbox would expose everyone
   * else's sign-in codes, and staging sends real mail so there is nothing in it
   * to read anyway.
   */
  devMailRoutes: boolean
  /** `POST /api/dev/prune-sessions`. Useful on staging, absent in production. */
  devSessionRoutes: boolean
  /**
   * The demo account picker offers the seeded actors.
   *
   * Staging keeps it: signing in as a coach without an inbox is most of what
   * staging is for.
   */
  seededSignIn: boolean
  /**
   * ...and offers the **admin** among them.
   *
   * Dev only, and this is the row that cannot be folded into the one above. The
   * admin can impersonate, which is the one power that reaches a real person,
   * so a deployment must never publish a way in. Staging is a deployment.
   */
  offersAdminSignIn: boolean
  /**
   * There is a local event ring to read, and `/api/dev/events` serves it.
   *
   * Named for what the policy decides — whether a readable local store exists —
   * rather than for the runtime fact that motivated it. `wrangler dev` binds
   * Analytics Engine and discards every write, so a dev server has nowhere real
   * to send telemetry; but "AE writes go nowhere" is a property of the runtime,
   * and "there is somewhere else to look" is the decision. Only the second
   * belongs in a policy table.
   */
  hasLocalEventStore: boolean
  /**
   * One `api.served` row in this many requests.
   *
   * Every request on a dev server, because the loop that matters is the one you
   * are watching. Sampled on a deployment, where the billing makes a row per
   * request wasteful — and staging is sampled at 1 because its traffic is you.
   */
  sampleRate: number
}

/**
 * The table.
 *
 * **Staging seeds from FIXTURES ONLY. Never from a production dump, export or
 * copy.** Read the rows above: staging has `seededSignIn` and a public
 * `seedRoute`, which together mean anybody who finds it can sign in as a seeded
 * actor and see everything. Production data there would put real parents' and
 * real children's names, ages and addresses into an environment built to be
 * entered. That is a PDPA problem before it is an engineering one.
 *
 * The temptation arrives later and it arrives reasonably: staging fails to
 * reproduce a production bug and a copy of the data would settle it in a
 * minute. It is still not allowed. Reproduce it with fixtures, or add the
 * fixture that makes it reproducible.
 */
export const POLICY: Record<Environment, Policy> = {
  dev: {
    capturesMail: true,
    seedRoute: true,
    devMailRoutes: true,
    devSessionRoutes: true,
    seededSignIn: true,
    offersAdminSignIn: true,
    hasLocalEventStore: true,
    sampleRate: 1,
  },
  staging: {
    capturesMail: false,
    seedRoute: true,
    devMailRoutes: false,
    devSessionRoutes: true,
    seededSignIn: true,
    // A deployment never publishes a way in as the account that can impersonate.
    offersAdminSignIn: false,
    hasLocalEventStore: false,
    sampleRate: 1,
  },
  production: {
    capturesMail: false,
    seedRoute: false,
    devMailRoutes: false,
    devSessionRoutes: false,
    seededSignIn: false,
    offersAdminSignIn: false,
    hasLocalEventStore: false,
    sampleRate: 10,
  },
}

/** Just enough of the env to answer. Keeps this importable from anywhere. */
type HasEnvironment = { ENVIRONMENT?: string }

/**
 * Which environment this is. Anything unrecognised is production.
 *
 * Not a throw: a Worker that cannot answer this must still serve requests, and
 * refusing to boot over a missing var would turn a typo into an outage. It
 * resolves to the strictest answer instead, which is the same failure direction
 * everything else in this codebase takes.
 */
export function environmentOf(env: HasEnvironment): Environment {
  const declared = env.ENVIRONMENT
  return (ENVIRONMENTS as readonly string[]).includes(declared ?? "")
    ? (declared as Environment)
    : "production"
}

/** What this environment permits. */
export const policyFor = (env: HasEnvironment): Policy => POLICY[environmentOf(env)]

/** One capability, read by name. The form every call site uses. */
export const permits = <K extends keyof Policy>(env: HasEnvironment, capability: K): Policy[K] =>
  policyFor(env)[capability]
