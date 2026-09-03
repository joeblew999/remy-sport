import { test as teardown } from "@playwright/test"
import { existsSync } from "node:fs"
import { BASE, EVERY_SEEDED_ACTOR, stateFor } from "../helpers/auth"

/**
 * End the sessions `auth.setup.ts` opened, after everything that needed them.
 *
 * The suite is designed to inject into a live system — it is the only way to
 * validate a deployed production, and it is why there is no scratch database to
 * hide in. Injection is only sound if it is reversible: seed idempotently, then
 * put back what you took. Signing in was the one side effect nothing put back.
 *
 * The cost was not theoretical. Fourteen actors signed in per run and none
 * signed out, so `session` only ever grew — 57 rows to 77 in two runs on one
 * machine. `devices.spec.ts` asserts on how many sessions a person has, which is
 * the right thing for it to assert, and against a table that only grows the
 * answer moves underneath it. Run against production the same leak accumulates
 * real sessions on real accounts, which is worse than a red test.
 *
 * Signing out rather than revoking by token: the saved state IS the credential,
 * so `sign-out` ends exactly that session and needs nothing else looked up.
 * Never `revoke-other-sessions` — against production that signs real people out
 * of their real devices to tidy a test run.
 *
 * Best effort throughout. A session that cannot be ended is the situation that
 * already existed; failing the run here would turn a tidy-up into a red suite
 * after every test has already passed.
 */
teardown("sign the saved actors out again", async ({ playwright }) => {
  for (const email of EVERY_SEEDED_ACTOR) {
    const state = stateFor(email)
    if (!existsSync(state)) continue
    try {
      const ctx = await playwright.request.newContext({ baseURL: BASE, storageState: state })
      /**
       * Every session this actor holds, not just the one saved here.
       *
       * Signing out the saved session alone left about seven behind per run —
       * measured 0 to 20 over three runs — because a spec that signs in through
       * the form creates a session in the browser's jar, and any spec whose
       * own cleanup did not fire leaves it there. The pile is what makes
       * `devices.spec.ts` unstable: it is the one spec whose subject IS how many
       * sessions a person has.
       *
       * Safe precisely because these are fixtures. Every address here is a
       * seeded `.test` account that exists for the suite — never a real person,
       * on any environment. `revoke-other-sessions` is scoped to the caller's own
       * user, so it can only ever reach the account it is signed in as.
       *
       * Idempotent: after this the seeded actors hold no sessions at all, so a
       * second run starts from the same place as the first, and running the
       * teardown twice changes nothing.
       */
      await ctx.post("/api/auth/revoke-other-sessions", { data: {}, headers: { Origin: BASE } })
      await ctx.post("/api/auth/sign-out", { data: {}, headers: { Origin: BASE } })
      await ctx.dispose()
    } catch {
      // See above: a leaked session is the status quo ante, and worth less than
      // a spurious failure reported after a green run.
    }
  }
})
