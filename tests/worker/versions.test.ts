import { describe, expect, it } from "vitest"
import { api } from "./helpers"

/**
 * `/api/versions` answers with the shape its callers reach through.
 *
 * Three of them index into it directly — `scripts/deploy.ts` waits on
 * `current._generated`, `scripts/e2e.ts` refuses to run without
 * `current.git.commit`, and `scripts/ops/versions.ts` builds its table from the
 * rest — so the `current` wrapper and every field under it are contract, not
 * presentation.
 *
 * Written when the route moved from Hono to `health.versions` in the oRPC
 * unification. The old raw route had no test: it returned `c.json(...)`
 * unvalidated, so nothing would have noticed a renamed field until a deploy
 * hung waiting for a stamp that never matched. The procedure declares a Zod
 * output, and this proves the declaration is the shape the CLI reads.
 */

describe("GET /api/versions", () => {
  it("returns the build stamp the ops CLI and the deploy wait loop read", async () => {
    const res = await api("/api/versions")
    expect(res.status).toBe(200)

    // The placeholder `[vars] BUILD` from wrangler.toml, which is what this
    // tier and `wrangler dev` see; a deploy overwrites it with the real stamp.
    const body = (await res.json()) as { current: Record<string, unknown> }
    expect(body.current).toEqual({
      _generated: "1970-01-01T00:00:00.000Z",
      app: "0.0.0",
      environment: "dev",
      // Whatever this deployment thinks it is; the value is the binding's, but
      // a caller reading `.url` must never get undefined.
      url: expect.any(String),
      // `github` is "" in TOML and null on the wire. Asserted because that
      // mapping is the one place the var's shape and the published shape
      // differ, and `toEqual` is what notices if either moves.
      git: { commit: "dev", branch: "dev", github: null },
    })
  })
})
