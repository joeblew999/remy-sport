import { describe, it, expect } from "bun:test"
import {
  blocking,
  decideSecrets,
  refusalMessage,
  resolveTarget,
  queueNames,
  type SecretGroup,
  type Step,
} from "../../scripts/deploy/provision"
import { POLICY } from "../../src/environment"

/**
 * The two decisions provisioning turns on, both pure so both testable.
 *
 * Everything else in `provision.ts` talks to the Cloudflare API, and the
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

describe("what stops an apply, including the question it could not ask", () => {
  const step = (outcome: Step["outcome"], resource: string, detail = "d"): Step => ({
    resource,
    outcome,
    detail,
  })

  it("lets a plan with nothing outstanding through", () => {
    const clean = [
      step("exists", "D1 remy-sport-db"),
      step("would-create", "Queue remy-notifications"),
      step("would-set", "VAPID"),
      step("skip", "TEST_OTP"),
    ]
    expect(blocking(clean)).toEqual([])
  })

  it("stops on a refusal, as it always did", () => {
    const refused = step("refuse", "Secrets", "could not read the secret list")
    expect(blocking([step("exists", "R2"), refused])).toEqual([refused])
  })

  /**
   * The branch this exists for, and the incident that produced it.
   *
   * On 2026-09-01 the D1 API answered "Authentication error [code: 10000]"
   * while R2, queues and workers all answered normally. Both D1 steps planned
   * as `unknown`, carried no `apply`, and passed a gate that looked only for
   * `refuse` — so bootstrap created the queues, skipped the database and five
   * pending migrations, and exited 0. The next line of `deploy` is `cf:deploy`.
   */
  it("stops on an unknown, which is NOT the same as absent", () => {
    const unknowns = [
      step("unknown", "D1 remy-sport-db", "Authentication error [code: 10000]"),
      step("unknown", "D1 migrations → remy-sport-db", "depends on the above"),
    ]
    // The queues were reachable and would have been created. That is the half
    // that made the old run look like a success.
    expect(blocking([...unknowns, step("would-create", "Queue remy-notifications")])).toEqual(unknowns)
  })

  it("names every blocker, and says why unknown is not absent", () => {
    const message = refusalMessage([
      step("refuse", "Secrets", "could not read the secret list"),
      step("unknown", "D1 remy-sport-db", "Authentication error [code: 10000]"),
    ])
    expect(message).toContain("Nothing was changed.")
    expect(message).toContain("Secrets — could not read the secret list")
    expect(message).toContain("D1 remy-sport-db — Authentication error [code: 10000]")
    expect(message).toMatch(/not the same as "absent"/)
  })

  it("says nothing about unknowns when there are none", () => {
    const message = refusalMessage([step("refuse", "R2", "no r2_buckets binding")])
    expect(message).toContain("R2 — no r2_buckets binding")
    expect(message).not.toMatch(/Could not determine/)
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
