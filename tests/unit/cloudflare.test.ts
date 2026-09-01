import { describe, it, expect } from "bun:test"
import { fnoxGet, resolveTarget, unreachable, type Ran } from "../../scripts/lib/cloudflare"

/**
 * The Cloudflare boundary's decisions, which are the ones that fail quietly.
 *
 * Everything else in `cloudflare.ts` talks to the account. These three do not,
 * and each of them has exactly one wrong answer that looks like success:
 * a credential lookup that explodes instead of finding nothing, a failure
 * classifier that calls a success a failure, and a target that resolves when it
 * should refuse.
 */

const ran = (over: Partial<Ran> = {}): Ran => ({ code: 1, out: "", err: "", ...over })

describe("resolving the credential out of fnox", () => {
  /**
   * The branch this exists for.
   *
   * `Bun.spawnSync` throws on a missing executable — "Executable not found in
   * $PATH" — rather than returning a non-zero exitCode, so an exit-code check
   * alone is not enough. Without the catch, a machine that has never
   * provisioned (CI, a fresh clone, a new contributor) gets a stack trace from
   * a lookup that is explicitly allowed to find nothing. The shell this
   * replaced said `2>/dev/null || true`.
   */
  it("returns null when the binary does not exist, rather than throwing", () => {
    expect(() => fnoxGet("ANYTHING", "definitely-not-a-real-binary-xyz")).not.toThrow()
    expect(fnoxGet("ANYTHING", "definitely-not-a-real-binary-xyz")).toBeNull()
  })

  it("returns null for a name the provider does not hold", () => {
    // `false` exits non-zero and prints nothing — a present binary that found
    // nothing, which is the other way this legitimately comes back empty.
    expect(fnoxGet("ANYTHING", "false")).toBeNull()
  })

  it("returns null rather than an empty string when the value is blank", () => {
    // `true` exits 0 with no output. An empty secret is not a secret, and a
    // caller testing truthiness must not receive "".
    expect(fnoxGet("ANYTHING", "true")).toBeNull()
  })
})

describe("could not ask, versus absent", () => {
  it("classifies a real auth failure, with the API's own code", () => {
    const why = unreachable(ran({ err: "Authentication error [code: 10000]" }))
    expect(why).toContain("10000")
    expect(why).toMatch(/not the same as|NOT "absent"/i)
  })

  it("says nothing about an ordinary failure that is not a reachability problem", () => {
    expect(unreachable(ran({ err: "no such bucket" }))).toBeNull()
  })

  /**
   * The defect. `Ran` carries the exit code and this ignored it, so the
   * guarantee lived in each call site's `code !== 0` guard — four had it and
   * the fifth would not have. A successful listing whose output merely
   * *contains* the phrase is a resource name, not a failure, and treating it as
   * one turns a working command into a refusal.
   */
  it("never classifies a SUCCESSFUL command as unreachable, whatever it printed", () => {
    expect(unreachable(ran({ code: 0, out: "Authentication error [code: 10000]" }))).toBeNull()
    expect(unreachable(ran({ code: 0, out: "fetch failed" }))).toBeNull()
    expect(unreachable(ran({ code: 0, out: '[{"name":"ENOTFOUND-test-bucket"}]' }))).toBeNull()
  })
})

describe("the target rule, which the caller declares", () => {
  it("refuses without --env when the operation says explicit", () => {
    expect(() => resolveTarget([], "explicit")).toThrow(/no target environment/)
  })

  /**
   * The asymmetry, and why it is not one global policy. Defaulting a *read* to
   * production costs a wrong answer you can see; defaulting a *write* costs a
   * migration applied to the live database by somebody who thought they were on
   * staging. See docs/dev/cloudflare-module.md.
   */
  it("falls back to the top-level config when the operation says ambient", () => {
    expect(resolveTarget([], "ambient")).toEqual({ environment: "production" })
  })

  it("honours an explicit --env under either rule", () => {
    for (const rule of ["explicit", "ambient"] as const) {
      expect(resolveTarget(["--env", "staging"], rule)).toEqual({
        environment: "staging",
        flag: "staging",
      })
    }
  })

  it("still refuses a bad environment under ambient — the fallback is not a bypass", () => {
    expect(() => resolveTarget(["--env", "prod"], "ambient")).toThrow(/not an environment/)
    expect(() => resolveTarget(["--env", "dev"], "ambient")).toThrow(/local/)
  })
})
