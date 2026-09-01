import { describe, it, expect } from "bun:test"
import { ENVIRONMENTS, POLICY, environmentOf, permits } from "../../src/environment"

/**
 * The capability table, and the combination that made it necessary.
 *
 * Eight behaviours used to be read off `usesOutbox(env)`. That worked while
 * there were two environments and the answers happened to agree. Staging is the
 * counterexample: it must send real mail AND keep the seed route AND offer
 * seeded sign-in — which a boolean about the mail transport cannot say.
 */

describe("the environment is declared, not inferred", () => {
  it("treats anything unrecognised as production", () => {
    // The same fail-safe as the smoke classifier and the dev panel: unset
    // config resolves to the strictest answer, never the most permissive.
    for (const bad of [undefined, "", "prod", "Production", "staging ", "dev\n", "test"]) {
      expect(environmentOf({ ENVIRONMENT: bad })).toBe("production")
    }
    expect(environmentOf({})).toBe("production")
  })

  it("accepts exactly the three it declares", () => {
    for (const e of ENVIRONMENTS) expect(environmentOf({ ENVIRONMENT: e })).toBe(e)
  })
})

describe("the combination that broke the proxy", () => {
  it("staging sends real mail AND keeps the seed route", () => {
    // Inexpressible before: one boolean decided both, so enabling real mail on
    // staging would have silently deleted the seed route.
    expect(permits({ ENVIRONMENT: "staging" }, "capturesMail")).toBe(false)
    expect(permits({ ENVIRONMENT: "staging" }, "seedRoute")).toBe(true)
  })

  it("staging offers seeded sign-in but NOT the admin", () => {
    // The admin can impersonate, which is the one power that reaches a real
    // person. A deployment never publishes a way in as that account.
    expect(permits({ ENVIRONMENT: "staging" }, "seededSignIn")).toBe(true)
    expect(permits({ ENVIRONMENT: "staging" }, "offersAdminSignIn")).toBe(false)
  })

  it("staging writes real telemetry, sampled at 1", () => {
    expect(permits({ ENVIRONMENT: "staging" }, "hasLocalEventStore")).toBe(false)
    // Its traffic is one person, so a tenth of it is not a sample, it is a gap.
    expect(permits({ ENVIRONMENT: "staging" }, "sampleRate")).toBe(1)
  })
})

describe("production is the strictest row, and unset resolves to it", () => {
  const dangerous = ["seedRoute", "devMailRoutes", "devSessionRoutes", "seededSignIn", "offersAdminSignIn"] as const

  it("permits none of the things that open a deployment up", () => {
    for (const capability of dangerous) {
      expect(POLICY.production[capability], `production must not permit ${capability}`).toBe(false)
    }
  })

  it("and an undeclared environment gets exactly that", () => {
    // The property that matters: a Worker deployed without the var is not
    // merely "some default", it is production's row.
    for (const capability of dangerous) {
      expect(permits({}, capability), `undeclared must not permit ${capability}`).toBe(false)
    }
    expect(permits({}, "capturesMail"), "an undeclared deployment sends real mail").toBe(false)
  })

  it("has no environment more permissive than dev", () => {
    // A guard on the table itself: if a fourth environment is added, it must
    // not quietly out-permit the one meant for a laptop.
    for (const e of ENVIRONMENTS) {
      for (const capability of [...dangerous, "capturesMail", "hasLocalEventStore"] as const) {
        if (POLICY[e][capability]) {
          expect(POLICY.dev[capability], `${e}.${capability} exceeds dev`).toBe(true)
        }
      }
    }
  })
})
