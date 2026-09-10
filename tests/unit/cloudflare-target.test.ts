import { afterEach, describe, expect, it } from "vitest"
import {
  credentialEnv,
  namedEnvironment,
  normalisedEnvironmentArgs,
  resolveTarget,
  withoutEnvironment,
} from "../../scripts/lib/cloudflare"

/**
 * Which environment an operation acts on — asserted, not assumed.
 *
 * Every failure this file guards against shares one shape: the command runs,
 * exits 0, and reports success about a different deployment than the one it was
 * asked about. None of them raise an error, so none of them are caught by a
 * suite that only checks that things work.
 *
 * See tests/repo/envs.test.ts for the structural half — that no *code* names an
 * environment's resource, and that `--env` has one reader. This is the
 * behavioural half: that the reader is right, and that nothing ambient can
 * override it.
 */

describe("the environment flag has one reader, and it knows both spellings", () => {
  // `--env staging` is what every help text in this repo shows; `--env=staging`
  // is what a shell alias or a CI file tends to carry. A reader that knows one
  // does not fail on the other — it reports "nothing named" and falls through to
  // production. That is how `ops analytics --env staging` reported production's
  // telemetry, and how `ops docs check --env=staging` ran a local check.
  it("reads the separated form", () => {
    expect(namedEnvironment(["--env", "staging", "2"])).toBe("staging")
  })

  it("reads the joined form", () => {
    expect(namedEnvironment(["--env=staging", "2"])).toBe("staging")
  })

  it("says nothing when nothing was named", () => {
    expect(namedEnvironment(["2", "--logs"])).toBeUndefined()
  })

  // The value must not be mistaken for the flag by a later filter.
  it("strips both spellings, and the separated form's value with it", () => {
    expect(withoutEnvironment(["-g", "x", "--env", "staging", "--retries", "0"])).toEqual([
      "-g", "x", "--retries", "0",
    ])
    expect(withoutEnvironment(["--env=staging", "--retries", "0"])).toEqual(["--retries", "0"])
  })

  it("normalises the joined form for a positional reader", () => {
    expect(normalisedEnvironmentArgs(["check", "--env=staging"])).toEqual([
      "check", "--env", "staging",
    ])
  })
})

describe("a target resolves the same way whatever the shell says", () => {
  const before = process.env.CLOUDFLARE_ENV
  afterEach(() => {
    if (before === undefined) delete process.env.CLOUDFLARE_ENV
    else process.env.CLOUDFLARE_ENV = before
  })

  /**
   * The one that had teeth.
   *
   * CLOUDFLARE_ENV is wrangler's variable equivalent of `--env`, so it steers
   * any wrangler call that does not pass the flag — and production is exactly
   * that call, because `Target.flag` is undefined for the top-level config.
   *
   * Measured against the real account on 2026-09-10: `wrangler secret list`
   * returned production's 7 secrets with nothing set and staging's 8 with
   * CLOUDFLARE_ENV=staging exported. Same command, different Worker, no warning.
   * A dry-run deploy resolved D1, R2, the queue, the dataset, BETTER_AUTH_URL
   * and the ENVIRONMENT variable itself to staging while the tool believed it
   * was acting on production.
   *
   * So `ops demo on --env production` could have put its sign-in secret on
   * staging and said production. The variable is now removed from every child.
   */
  it("never hands CLOUDFLARE_ENV to a wrangler child", () => {
    process.env.CLOUDFLARE_ENV = "staging"
    expect(credentialEnv().CLOUDFLARE_ENV, "an exported environment must not steer a target").toBeUndefined()
  })

  it("still passes the account through", () => {
    expect(credentialEnv().CLOUDFLARE_ACCOUNT_ID).toMatch(/^[0-9a-f]{32}$/)
  })

  // Production is the top-level config, so its flag is absent by design — which
  // is why the variable above could fill the gap. `wrangler()` turns this into
  // an explicit `--env ""`, wrangler's own way of naming the top-level.
  it("gives production no flag, and staging its own", () => {
    expect(resolveTarget(["--env", "production"]).flag).toBeUndefined()
    expect(resolveTarget(["--env", "staging"]).flag).toBe("staging")
  })

  /**
   * A read may default; a write may not.
   *
   * The asymmetry is the module's rule rather than a convenience. An unnamed
   * read costs a wrong answer somebody can see; an unnamed write costs a
   * migration applied to the live database by somebody who thought they were on
   * staging — which is how `CF_D1_NAME` once pointed
   * `migrations:apply:remote --env staging` at production.
   */
  it("defaults a read to production and refuses an unnamed write", () => {
    expect(resolveTarget([], "ambient").environment).toBe("production")
    expect(() => resolveTarget([], "explicit")).toThrow()
  })

  it("refuses a typo rather than answering it", () => {
    // The old analytics parser accepted any string, so `--env stagng` produced
    // an empty report — which reads exactly like a healthy silence.
    expect(() => resolveTarget(["--env", "stagng"], "ambient")).toThrow(/not an environment/)
  })
})
