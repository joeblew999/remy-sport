import { describe, expect, it } from "vitest"
import { excludeInternal } from "../../src/api/openapi"
import { router } from "../../src/api/index"
import type { Bindings } from "../../src/types"

/**
 * One predicate, and the answer depends on the environment asking.
 *
 * The worker tier proves the dev case, because that is the environment the
 * pool binds. This proves the two it cannot reach — and production is the one
 * that was wrong: it published all seven dev operations while answering 404 to
 * each.
 */

const envFor = (environment: string) => ({ ENVIRONMENT: environment }) as unknown as Bindings
const nodeOf = (path: string[]) =>
  path.reduce<Record<string, unknown>>((node, key) => node[key] as Record<string, unknown>, router as never)

const SEED = nodeOf(["dev", "seed"])
const PRUNE = nodeOf(["dev", "sessions", "prune"])
const OUTBOX = nodeOf(["dev", "outbox", "list"])
const HEALTH = nodeOf(["health", "get"])
const EVENTS = nodeOf(["events", "list"])

describe("excludeInternal", () => {
  it("drops every dev endpoint on production, which mounts none of them", () => {
    const exclude = excludeInternal(envFor("production"))
    for (const [name, procedure] of [["seed", SEED], ["prune", PRUNE], ["outbox", OUTBOX]] as const) {
      expect(exclude(procedure), `${name} must not be published by production`).toBe(true)
    }
  })

  it("keeps the two staging actually mounts, and drops the mail ones it does not", () => {
    // POLICY grants staging seedRoute and devSessionRoutes, and withholds
    // devMailRoutes — so the document differs per environment, which is the point.
    const exclude = excludeInternal(envFor("staging"))
    expect(exclude(SEED), "staging mounts the seed route").toBe(false)
    expect(exclude(PRUNE), "staging mounts prune-sessions").toBe(false)
    expect(exclude(OUTBOX), "staging captures no mail, so there is no outbox").toBe(true)
  })

  it("drops every dev endpoint when no environment is given — the published set", () => {
    const exclude = excludeInternal()
    expect(exclude(SEED)).toBe(true)
    expect(exclude(PRUNE)).toBe(true)
  })

  it("never drops a domain procedure, and always drops plain infrastructure", () => {
    for (const env of [undefined, envFor("dev"), envFor("production")]) {
      const exclude = excludeInternal(env)
      expect(exclude(EVENTS), "events.list is the product").toBe(false)
      expect(exclude(HEALTH), "health is infrastructure everywhere").toBe(true)
    }
  })
})
