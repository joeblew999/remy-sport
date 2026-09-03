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
   * Where the fixed sign-in code comes from, if anywhere.
   *
   * The second half of seeded sign-in, and it must be its own row — `seededSignIn`
   * decides whether the picker *appears*, this decides whether those accounts
   * can actually get *in*. They differ on production, which is why one boolean
   * cannot carry both:
   *
   *   * `"derived"` — the code is `DEMO_SIGN_IN_CODE`, always present, nothing
   *     to provision. Dev and staging, where every seeded address is `.test` and
   *     reaches nobody.
   *   * `"secret"` — only a human-set `TEST_OTP` fixes it, and `mise run
   *     demo:off` removes it without a redeploy. **Production, and production
   *     only.**
   *
   * Collapsing this into `seededSignIn` is not hypothetical: it shipped that way
   * for one commit. Production has `seededSignIn: false`, so gating the code on
   * it silently made `demo:on` a no-op there — every seeded account got a random
   * code and the deployed Playwright suite, which signs in on every test, had no
   * way to authenticate. Nothing failed at deploy time; it would have failed at
   * the next `mise run deploy`.
   */
  signInCode: "derived" | "secret"
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
    signInCode: "derived",
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
    // Derived, not provisioned: staging's seeded addresses are all `.test`, so
    // the code reaches nobody and there is no secret for anyone to forget.
    signInCode: "derived",
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
    // The one environment where a human decides. `mise run demo:on` sets the
    // secret so the deployed Playwright suite can sign in; `demo:off` removes
    // it, and must be run before the platform has real users.
    signInCode: "secret",
    offersAdminSignIn: false,
    hasLocalEventStore: false,
    sampleRate: 10,
  },
}

/**
 * The fixed sign-in code where the environment derives one.
 *
 * Not a secret, and calling it one would be the mistake. It is a published
 * credential by construction — `/api/dev/accounts` sends it to the browser and
 * the login page says so — and it only ever applies to seeded `.test`
 * addresses that no mail can reach. What keeps it safe is scope, not obscurity.
 */
/**
 * Where the local dev server serves.
 *
 * Decided here because dev is one of the three environments this file governs,
 * and the port was written in four places — mise's [env], the dev script, the
 * latency tool's fallback and the tunnel's service target. wrangler.toml cannot
 * hold it: there is no [env.dev] block, because dev is not a deployment.
 */
export const DEV_PORT = 8787
export const DEV_ORIGIN = `http://localhost:${DEV_PORT}`

export const DEMO_SIGN_IN_CODE = "424242"

/** Just enough of the env to answer. Keeps this importable from anywhere. */
type HasEnvironment = { ENVIRONMENT?: string; TEST_OTP?: string; TEST_ADMIN_OTP?: string }

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

/**
 * The fixed sign-in code for seeded accounts, or undefined for none.
 *
 * The single place that answers "can a seeded account sign in with a known
 * code", so `auth.ts` and `/api/dev/accounts` cannot drift apart on it — they
 * already had two different expressions of the same question, one of which was
 * wrong.
 *
 * **Deliberately independent of `seededSignIn`.** Production offers no picker
 * and still fixes the code when a human sets `TEST_OTP`, because the deployed
 * Playwright suite signs in on every test and there is no outbox to read. Those
 * are two questions and this answers only the second.
 *
 * Undefined is the safe answer and the common one: no `TEST_OTP` on production
 * means every account, seeded or not, gets a random code.
 */
export const fixedSignInCode = (env: HasEnvironment): string | undefined =>
  policyFor(env).signInCode === "derived" ? DEMO_SIGN_IN_CODE : env.TEST_OTP

/**
 * Whether the seeded ADMIN may use the fixed code here.
 *
 * The policy row is the default and stays false on every deployment, for the
 * reason written beside it: a deployment never *publishes* a way in as the
 * account that can impersonate. That property is about what a deployment offers
 * to the public, and it is preserved — nothing here changes unless a human sets
 * a secret, and `ops -- demo off` removes it.
 *
 * The secret exists because the alternative was worse. `admin-console.spec.ts`
 * and `authz.spec.ts` are the only cover the admin console has, and they could
 * not run anywhere but dev — so the surface that decides who may impersonate
 * whom was verified exclusively against a local Worker, and a deployment could
 * break it with nothing to say so. Fifteen tests skipped on staging, silently,
 * which is the shape of coverage that is worse than none because it reads green.
 *
 * Separate from `TEST_OTP` on purpose. That one governs every seeded actor and
 * is derived on dev and staging; this governs the one account that can reach
 * every other, so it is never derived and never on by default — a human sets it,
 * for a run, and takes it off. Two questions, two switches, so turning on the
 * ordinary demo cannot quietly turn on the admin.
 */
export const adminSignInAllowed = (env: HasEnvironment): boolean =>
  policyFor(env).offersAdminSignIn || Boolean(env.TEST_ADMIN_OTP)

/**
 * The address space the e2e suite owns, so it never borrows a person's account.
 *
 * Every spec used to sign in as one of the PO's seeded people — and so does
 * anyone using the dev tunnel, which exists for exactly that. Two writers on one
 * account: sessions appear and vanish under a running test, two specs consume
 * each other's OTP, "sign out all other devices" signs the human out, and any
 * assertion about how many sessions someone has is a guess about what everybody
 * else is doing. Every one of those was fixed individually at least once, which
 * is the signature of treating symptoms.
 *
 * An account per test removes the class. The test owns every session on it, so
 * counts mean something again, `revoke-other-sessions` is safe, and a person
 * clicking around on the tunnel is invisible to it.
 *
 * `.test` is IANA-reserved and unroutable (RFC 2606), so a code mailed here
 * reaches nobody — the same property that lets staging derive a public code for
 * the seeded `.test` fixtures. And an account minted here starts empty with the
 * default role: the fixed code opens a door onto nothing, which is strictly less
 * than the seeded accounts it replaces, since those hold fixture data.
 *
 * Deliberately NOT reachable on production by default. There the code lives in a
 * secret and `signInCode: "secret"` means `fixedSignInCode()` is undefined until
 * a human runs `ops -- demo on`, so this predicate is never consulted.
 */
export const E2E_EMAIL_DOMAIN = "e2e.test"

export const isReservedTestEmail = (email: string): boolean =>
  email.toLowerCase().endsWith(`@${E2E_EMAIL_DOMAIN}`)
