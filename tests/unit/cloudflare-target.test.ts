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
 * Every failure here shares one shape: the command exits 0 and reports success
 * about a different deployment than the one asked for. See tests/repo/envs.test.ts
 * for the structural half.
 */

describe("the environment flag has one reader, and it knows both spellings", () => {
  // A reader that knows one spelling does not fail on the other — it reports
  // "nothing named" and falls through to production.
  it("reads the separated form", () => {
    expect(namedEnvironment(["--env", "staging", "2"])).toBe("staging")
  })

  it("reads the joined form", () => {
    expect(namedEnvironment(["--env=staging", "2"])).toBe("staging")
  })

  it("says nothing when nothing was named", () => {
    expect(namedEnvironment(["2", "--logs"])).toBeUndefined()
  })

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
   * CLOUDFLARE_ENV is wrangler's variable equivalent of `--env`, so it steers
   * any call that does not pass the flag — and production is exactly that call,
   * since `Target.flag` is undefined for the top-level config. Measured against
   * the real account: the same command reached a different Worker.
   */
  it("never hands CLOUDFLARE_ENV to a wrangler child", () => {
    process.env.CLOUDFLARE_ENV = "staging"
    expect(credentialEnv().CLOUDFLARE_ENV, "an exported environment must not steer a target").toBeUndefined()
  })

  it("still passes the account through", () => {
    expect(credentialEnv().CLOUDFLARE_ACCOUNT_ID).toMatch(/^[0-9a-f]{32}$/)
  })

  // Production is the top-level config, so its flag is absent by design —
  // which is why the variable above could fill the gap.
  it("gives production no flag, and staging its own", () => {
    expect(resolveTarget(["--env", "production"]).flag).toBeUndefined()
    expect(resolveTarget(["--env", "staging"]).flag).toBe("staging")
  })

  // An unnamed read costs a wrong answer you can see; an unnamed write costs a
  // migration on the live database.
  it("defaults a read to production and refuses an unnamed write", () => {
    expect(resolveTarget([], "ambient").environment).toBe("production")
    expect(() => resolveTarget([], "explicit")).toThrow()
  })

  it("refuses a typo rather than answering it", () => {
    expect(() => resolveTarget(["--env", "stagng"], "ambient")).toThrow(/not an environment/)
  })
})
