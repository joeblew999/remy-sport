/**
 * Turning seeded sign-in on and off, and then checking whether it worked.
 *
 * ## Why this is not just `wrangler secret put`
 *
 * It was, and it was silently a no-op on production for a whole commit. The
 * fixed code had been gated on `permits(env, "seededSignIn")`, which production
 * has as false — so `demo:on` put the secret, printed a cheerful success line,
 * and every seeded account still got a random code. Nothing failed. It would
 * have surfaced at the next `mise run deploy`, when the whole Playwright suite
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

import { DEMO_SIGN_IN_CODE, POLICY } from "../src/environment"
import { Refused, resolveTarget } from "./cloudflare"

const action = process.argv[2] as "on" | "off"
const argv = process.argv.slice(3)

function wrangler(args: string[], flag?: string): { code: number; text: string } {
  const proc = Bun.spawnSync(["bun", "x", "wrangler", ...args, ...(flag ? ["--env", flag] : [])], {
    stdin: undefined,
    stdout: "pipe",
    stderr: "pipe",
  })
  return { code: proc.exitCode, text: proc.stdout.toString() + proc.stderr.toString() }
}

try {
  const target = resolveTarget(argv)

  if (POLICY[target.environment].signInCode !== "secret") {
    throw new Refused(
      `${target.environment} derives its sign-in code from the policy table, so there is\n` +
        "  nothing to switch. Seeded sign-in is already on there and cannot be turned off\n" +
        "  by removing a secret — see `signInCode` in src/environment.ts.",
    )
  }

  if (action === "on") {
    const code = process.env.DEMO_CODE ?? DEMO_SIGN_IN_CODE
    const put = Bun.spawnSync(
      ["bun", "x", "wrangler", "secret", "put", "TEST_OTP", ...(target.flag ? ["--env", target.flag] : [])],
      { stdin: new TextEncoder().encode(code), stdout: "inherit", stderr: "inherit" },
    )
    if (put.exitCode !== 0) throw new Refused("could not set TEST_OTP")
  } else if (action === "off") {
    const gone = wrangler(["secret", "delete", "TEST_OTP", "--force"], target.flag)
    // Already absent is the desired state, not a failure. The old task deleted
    // unconditionally and errored when there was nothing to delete, which made
    // "make sure demo is off" a command you could not safely run twice.
    if (gone.code !== 0 && !/not found|does not exist/i.test(gone.text)) {
      throw new Refused(`could not delete TEST_OTP:\n${gone.text}`)
    }
  } else {
    throw new Refused(`usage: cf-demo.ts <on|off> --env <environment>`)
  }

  /**
   * The check, and it is the point of the file.
   *
   * A deploy takes a moment to propagate, so this is what `cf:wait` is for
   * elsewhere; here the secret takes effect without a new version, so one read
   * is enough. `demo-status.ts` exits non-zero when the admin is offered, which
   * is a separate failure it already guards.
   */
  console.log(`\ncf-demo: asking the deployment whether that actually worked…\n`)
  const status = Bun.spawnSync(["bun", "scripts/demo-status.ts"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  })
  const said = status.stdout.toString() + status.stderr.toString()
  console.log(said.trimEnd())

  const isOn = /demo: ON/.test(said)
  const servingCode = new RegExp(`code ${process.env.DEMO_CODE ?? DEMO_SIGN_IN_CODE}`).test(said)

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
  console.log(`\ncf-demo: verified — seeded sign-in is ${action.toUpperCase()} on ${target.environment}\n`)
} catch (err) {
  if (err instanceof Refused) {
    console.error(`\ncf-demo: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
