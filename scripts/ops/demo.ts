/**
 * Turning seeded sign-in on and off, and then checking whether it worked.
 *
 * ## Why this is not just `wrangler secret put`
 *
 * It was, and it was silently a no-op on production for a whole commit. The
 * fixed code had been gated on `permits(env, "seededSignIn")`, which production
 * has as false — so `demo:on` put the secret, printed a cheerful success line,
 * and every seeded account still got a random code. Nothing failed. It would
 * have surfaced at the next `mise run 3-deploy`, when the whole Playwright suite
 * could not sign in.
 *
 * So this ends by **asking the deployment**. "The secret was written" and
 * "seeded people can sign in" are different claims, and only the second is the
 * one anybody wants. `demo-status.ts` reads `/api/dev/accounts` — what is
 * actually being served — and this fails if the answer is not what was asked
 * for.
 *
 * ## Production is the only environment this applies to
 *
 * `signInCode` in src/environment.ts: dev and staging are `"derived"`, so the
 * code comes from the policy table, there is no secret, and there is nothing
 * here to turn on. Production is `"secret"` precisely so a human decides when.
 * Running this against a derived environment is refused rather than ignored —
 * it would suggest the setting had been changed when it had not.
 */

import { DEMO_SIGN_IN_CODE, POLICY } from "../../src/environment"
import { Refused, resolveTarget, wrangler } from "../lib/cloudflare"

const action = process.argv[2] as "on" | "off"
const argv = process.argv.slice(3)

try {
  const target = resolveTarget(argv, "explicit")

  /**
   * Two secrets, because there are two questions.
   *
   * `TEST_OTP` fixes the code for every seeded actor, and only production needs
   * it — dev and staging derive theirs from the policy table, which is why this
   * used to refuse them outright.
   *
   * `TEST_ADMIN_OTP` is the second question and applies everywhere: whether the
   * seeded ADMIN may use that code. Its default is off on every deployment
   * (`offersAdminSignIn: false`), so without it the admin console's only two
   * specs cannot run anywhere but dev — the surface deciding who may impersonate
   * whom, covered exclusively against a local Worker.
   *
   * So staging is no longer refused: it has nothing to switch for `TEST_OTP` and
   * something real to switch for the admin. `off` removes both regardless, since
   * "make sure demo is off" must be safe to run against anything.
   */
  const fixesEveryone = POLICY[target.environment].signInCode === "secret"

  if (action === "on") {
    const code = process.env.DEMO_CODE ?? DEMO_SIGN_IN_CODE
    if (fixesEveryone) {
      const put = wrangler(["secret", "put", "TEST_OTP"], target, { stdin: code, inherit: true })
      if (put.code !== 0) throw new Refused("could not set TEST_OTP")
    } else {
      console.log(
        `demo: ${target.environment} derives the seeded code from the policy table, so only\n` +
          "      admin sign-in is being switched here.",
      )
    }
    // The admin, deliberately last and deliberately separate: turning the
    // ordinary demo on must never quietly turn this on too.
    const admin = wrangler(["secret", "put", "TEST_ADMIN_OTP"], target, {
      stdin: code,
      inherit: true,
    })
    if (admin.code !== 0) throw new Refused("could not set TEST_ADMIN_OTP")
  } else if (action === "off") {
    // No `--force`: wrangler has no such flag and rejects the whole command with
    // "Unknown argument: force", so `demo:off` could not turn demo off at all —
    // the one command that must run before the platform has real users.
    // It prompts instead, and answers itself with "yes" when nothing is a TTY,
    // which is every way this runs.
    // Both, unconditionally. "Make sure demo is off" must not depend on knowing
    // which of the two switches somebody turned on.
    for (const name of ["TEST_OTP", "TEST_ADMIN_OTP"]) {
      const gone = wrangler(["secret", "delete", name], target)
      // Already absent is the desired state, not a failure. The old task deleted
      // unconditionally and errored when there was nothing to delete, which made
      // "make sure demo is off" a command you could not safely run twice.
      const goneText = gone.out + gone.err
      if (gone.code !== 0 && !/not found|does not exist/i.test(goneText)) {
        throw new Refused(`could not delete ${name}:\n${goneText}`)
      }
    }
  } else {
    throw new Refused(`usage: demo.ts <on|off> --env <environment>`)
  }

  /**
   * The check, and it is the point of the file.
   *
   * Polled, not read once. The old comment here said the secret "takes effect
   * without a new version, so one read is enough" — that is wrong.
   * `wrangler secret put` publishes a new version and the edge serves the old
   * one for a few seconds, so an immediate read reports the state from before
   * the write. On 2026-09-01 that made `demo:on` report failure on a success,
   * which is half of why a fixed sign-in code sat on production unnoticed.
   *
   * Same problem waitForOrigin solves in scripts/deploy.ts, and the same answer: ask
   * the deployment agrees, with a bound so a real failure still fails.
   *
   * `demo-status.ts` exits non-zero when the admin is offered, which is a
   * separate failure it already guards.
   */
  console.log(`\ndemo: asking the deployment whether that actually worked…\n`)

  const want = action === "on"
  const code = process.env.DEMO_CODE ?? DEMO_SIGN_IN_CODE
  const ATTEMPTS = 12
  const EVERY_MS = 2500
  let said = ""
  let observed = false
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    // `--env`, which this did not pass. demo-status.ts resolves `ambient`, and
    // ambient means production — so `demo on --env staging` set staging's secret
    // and then reported production's state back, in production's words:
    // "demo: OFF at https://remy.ubuntusoftware.net" for a staging command.
    // Same class as the CF_DEPLOY_URL bug in versions.ts: a reader that cannot
    // be told which environment it is asking about does not fail, it answers
    // confidently about the wrong one.
    const status = Bun.spawnSync(
      ["bun", "scripts/ops/demo-status.ts", "--env", target.environment],
      { stdout: "pipe", stderr: "pipe", env: { ...process.env } },
    )
    said = status.stdout.toString() + status.stderr.toString()
    if ((/demo: ON/.test(said) && new RegExp(`code ${code}`).test(said)) === want) {
      observed = true
      break
    }
    if (attempt < ATTEMPTS) Bun.sleepSync(EVERY_MS)
  }
  console.log(said.trimEnd())

  /**
   * Running out of time is not an observation.
   *
   * The distinction `unreachable()` draws in cloudflare.ts, in the one place it
   * would otherwise come back wearing a rarer costume. After the bound we have
   * "never saw it" — which is not the same claim as "it does not work", and
   * reporting the second would be the original bug again: a verification
   * asserting a state it did not witness. Saying so plainly also keeps this
   * step trustworthy, and a verification people learn to ignore is worse than
   * none.
   */
  if (!observed) {
    throw new Refused(
      `could not confirm within ${(ATTEMPTS * EVERY_MS) / 1000}s that seeded sign-in is ` +
        `${want ? "ON" : "OFF"} on ${target.environment}.\n` +
        "  The write itself succeeded. This is a timeout, not a verdict: the deployment never\n" +
        "  reported the new state inside the bound, and propagation after a `secret put` is\n" +
        "  usually seconds but is not guaranteed to be.\n\n" +
        "  Run `mise run demo:status` before concluding anything. If it still disagrees,\n" +
        "  check `signInCode` for this environment in src/environment.ts and generateOTP in\n" +
        "  src/auth.ts.",
    )
  }

  const isOn = /demo: ON/.test(said)
  const servingCode = new RegExp(`code ${code}`).test(said)

  if (action === "on" && !(isOn && servingCode)) {
    throw new Refused(
      "TEST_OTP was written, but the deployment is NOT serving that code.\n" +
        "  The secret being set and seeded sign-in working are different claims — this is\n" +
        "  exactly the no-op that went unnoticed for a commit. Check `signInCode` for this\n" +
        "  environment in src/environment.ts and src/auth.ts's generateOTP.",
    )
  }
  if (action === "off" && isOn) {
    throw new Refused("TEST_OTP was deleted, but the deployment still reports seeded sign-in as ON.")
  }
  console.log(`\ndemo: verified — seeded sign-in is ${action.toUpperCase()} on ${target.environment}\n`)
} catch (err) {
  if (err instanceof Refused) {
    console.error(`\ndemo: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
