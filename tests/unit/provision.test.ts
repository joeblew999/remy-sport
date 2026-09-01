import { describe, it, expect } from "bun:test"
import { decideSecrets, resolveTarget, queueNames, type SecretGroup } from "../../scripts/cf-provision"
import { POLICY } from "../../src/environment"

/**
 * The two decisions provisioning turns on, both pure so both testable.
 *
 * Everything else in `cf-provision.ts` talks to the Cloudflare API, and the
 * half-written-group branches are exactly the ones you cannot reach that way:
 * reproducing them for real means putting production into the broken state to
 * find out what happens next.
 */

const group = (over: Partial<SecretGroup> = {}): SecretGroup => ({
  label: "test",
  pair: ["A", "B"],
  supply: async () => ({ A: "1", B: "2" }),
  appliesTo: () => true,
  ...over,
})

describe("the one secret decision, shared by every group", () => {
  it("keeps a complete group rather than rewriting it", () => {
    expect(decideSecrets(new Set(["A", "B"]), group())).toEqual({ action: "keep" })
  })

  it("sets a wholly absent group", () => {
    expect(decideSecrets(new Set(), group())).toEqual({ action: "set", which: ["A", "B"] })
  })

  /**
   * The branch this exists for. A half-written pair is never completed by
   * generating a fresh one: for VAPID that rotates a public key every
   * subscribed browser has pinned, and for BETTER_AUTH_SECRET it signs
   * everybody out. Both look like success.
   */
  it("refuses a half-written group, in both directions", () => {
    expect(decideSecrets(new Set(["A"]), group())).toEqual({
      action: "refuse",
      have: ["A"],
      missing: ["B"],
    })
    expect(decideSecrets(new Set(["B"]), group())).toEqual({
      action: "refuse",
      have: ["B"],
      missing: ["A"],
    })
  })

  /**
   * The `cf:secret:set` bug, as a property.
   *
   * Its guard was `grep -q BETTER_AUTH_SECRET` over the whole secret listing,
   * so an unrelated `OLD_BETTER_AUTH_SECRET_BACKUP` satisfied it and the task
   * skipped — leaving the Worker with no usable secret, on every deploy.
   */
  it("is not satisfied by a name that merely CONTAINS the one it wants", () => {
    const auth = group({ pair: ["BETTER_AUTH_SECRET"] })
    const decoy = new Set(["OLD_BETTER_AUTH_SECRET_BACKUP", "BETTER_AUTH_SECRET_OLD"])
    expect(decideSecrets(decoy, auth)).toEqual({
      action: "set",
      which: ["BETTER_AUTH_SECRET"],
    })
  })

  it("fills an absent extra without treating it as a half-pair", () => {
    // VAPID_SUBJECT is not part of the keypair — it is the address a push
    // service complains to — so a missing one is filled, never a refusal.
    const withExtra = group({ extras: ["S"] })
    expect(decideSecrets(new Set(["A", "B"]), withExtra)).toEqual({ action: "set", which: ["S"] })
    expect(decideSecrets(new Set(["A", "B", "S"]), withExtra)).toEqual({ action: "keep" })
  })
})

describe("the target, which is never guessed", () => {
  it("refuses with no --env at all", () => {
    expect(() => resolveTarget([])).toThrow(/no target environment/)
  })

  it("refuses an environment that does not exist", () => {
    expect(() => resolveTarget(["--env", "prod"])).toThrow(/not an environment/)
  })

  it("refuses dev, which provisions nothing on the account", () => {
    expect(() => resolveTarget(["--env", "dev"])).toThrow(/local/)
  })

  /**
   * Production is wrangler's *unnamed* top-level config, so its flag is absent.
   * Passing `--env production` to wrangler does not select production — it
   * looks for an `[env.production]` block that does not exist.
   */
  it("maps production to no --env flag, and staging to its own", () => {
    expect(resolveTarget(["--env", "production"])).toEqual({ environment: "production" })
    expect(resolveTarget(["--env", "staging"])).toEqual({
      environment: "staging",
      flag: "staging",
    })
  })

  it("accepts --env=x as well as --env x", () => {
    expect(resolveTarget(["--env=staging"]).environment).toBe("staging")
  })

  it("never resolves an unknown input to production", () => {
    // The inverse of environmentOf(), deliberately. That resolves the unknown
    // to production because the risk is an opened door; this performs writes,
    // where the strict answer is to refuse.
    for (const bad of [[], ["--env"], ["--env", ""], ["--apply"], ["--env", "PRODUCTION"]]) {
      expect(() => resolveTarget(bad), `${JSON.stringify(bad)} must not resolve`).toThrow()
    }
  })
})

describe("queues, including the one that is easy to miss", () => {
  it("includes the dead letter queue, which appears only inside a consumer", () => {
    const config = {
      queues: {
        producers: [{ queue: "n" }],
        consumers: [{ queue: "n", dead_letter_queue: "n-dlq" }, { queue: "n-dlq" }],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    // Two names are visible as `queue = ...` lines; three must be created.
    expect(queueNames(config)).toEqual(["n", "n-dlq"])
  })
})

describe("TEST_OTP follows the policy table, not a hand-set secret", () => {
  it("is derived for dev and staging and human-set for production only", () => {
    expect(POLICY.dev.signInCode).toBe("derived")
    expect(POLICY.staging.signInCode).toBe("derived")
    // The row that keeps `demo:on` meaningful: production is the one place a
    // person decides, so it is the one place provisioning must not decide.
    expect(POLICY.production.signInCode).toBe("secret")
  })
})
