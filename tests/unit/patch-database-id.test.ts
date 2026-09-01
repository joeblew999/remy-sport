import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { patchDatabaseId, d1Snapshot, TOP_LEVEL } from "../../scripts/cloudflare"

/**
 * Writing a database_id into the right block, and proving the others did not move.
 *
 * The bug this exists for: `patchDatabaseId` matched `/^database_id\s*=\s*"…"/m`,
 * which takes the **first** occurrence in the file. That was unambiguous while
 * one environment existed. The day `[env.staging]` was added there were two, and
 * production's came first — so provisioning *staging* would have written
 * staging's uuid into **production's** block, and the next deploy would have
 * served production from an empty database. That is the 2026-08-20 data loss
 * this script was written to prevent, reached from a new direction.
 *
 * The fixture below is the two-database_id case, in the order wrangler.toml
 * actually has them: production first, staging second. Every test here asks the
 * same question — after patching one environment, is every *other* environment
 * byte-identical?
 */

const PRODUCTION_ID = "c5b3cb3e-6b40-45e3-8e9a-ec7cddb84a87"
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000"
const NEW_STAGING_ID = "11111111-2222-3333-4444-555555555555"

/**
 * Deliberately minimal, and deliberately in the file order that caused the bug.
 * A real wrangler.toml has 300 lines between these blocks; the distance is not
 * what made it dangerous, the ordering is.
 */
const FIXTURE = `name = "remy-sport"
main = "src/index.ts"
compatibility_date = "2025-09-01"

[[d1_databases]]
binding = "DB"
database_name = "remy-sport-db"
database_id = "${PRODUCTION_ID}"
migrations_dir = "src/db/migrations"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "remy-sport-storage"

[env.staging]
name = "remy-sport-staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "remy-sport-staging-db"
database_id = "${PLACEHOLDER}"
migrations_dir = "src/db/migrations"

[[env.staging.r2_buckets]]
binding = "STORAGE"
bucket_name = "remy-sport-staging-storage"
`

let dir: string
let config: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cf-ensure-"))
  config = join(dir, "wrangler.toml")
  writeFileSync(config, FIXTURE)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** The id each environment resolves to, which is the only view that matters. */
const idsOf = (path: string) =>
  Object.fromEntries(
    [...d1Snapshot(path)].map(([label, json]) => [
      label,
      (JSON.parse(json) as Array<{ id: string }>).map((d) => d.id).join(","),
    ]),
  )

describe("patching one environment's database_id", () => {
  it("writes staging's block and leaves production byte-identical", () => {
    const before = readFileSync(config, "utf-8")

    const result = patchDatabaseId({
      configPath: config,
      env: "staging",
      databaseName: "remy-sport-staging-db",
      uuid: NEW_STAGING_ID,
    })

    expect(result).toBe("patched")
    const ids = idsOf(config)
    expect(ids.staging, "staging should now hold the new uuid").toBe(NEW_STAGING_ID)
    expect(ids[TOP_LEVEL], "production must not have moved").toBe(PRODUCTION_ID)

    // The assertion the old code would have failed, stated on the text itself:
    // production's line is untouched, character for character.
    const after = readFileSync(config, "utf-8")
    expect(after).toContain(`database_id = "${PRODUCTION_ID}"`)
    expect(after.split("\n")[7], "production's line, by position").toBe(
      before.split("\n")[7]!,
    )
    // ...and exactly one line differs in the whole file.
    const changed = after
      .split("\n")
      .map((l, i) => (l === before.split("\n")[i] ? null : i))
      .filter((i) => i !== null)
    expect(changed).toHaveLength(1)
  })

  it("writes production's block and leaves staging alone", () => {
    // The mirror case, so this cannot pass by always patching the second block
    // any more than the old code passed by always patching the first.
    const fresh = "99999999-8888-7777-6666-555555555555"
    patchDatabaseId({
      configPath: config,
      databaseName: "remy-sport-db",
      uuid: fresh,
    })

    const ids = idsOf(config)
    expect(ids[TOP_LEVEL]).toBe(fresh)
    expect(ids.staging, "staging must not have moved").toBe(PLACEHOLDER)
  })

  it("is a no-op when the id is already right, and does not rewrite the file", () => {
    const before = readFileSync(config, "utf-8")
    const result = patchDatabaseId({
      configPath: config,
      databaseName: "remy-sport-db",
      uuid: PRODUCTION_ID,
    })
    expect(result).toBe("unchanged")
    expect(readFileSync(config, "utf-8")).toBe(before)
  })

  /**
   * The placeholder is the case that will actually happen: staging's block ships
   * with a zeroed uuid, so the first provisioning run replaces it. Production's
   * real id sits four lines above it.
   */
  it("replaces staging's zeroed placeholder without touching the real id above it", () => {
    expect(idsOf(config).staging).toBe(PLACEHOLDER)
    patchDatabaseId({
      configPath: config,
      env: "staging",
      databaseName: "remy-sport-staging-db",
      uuid: NEW_STAGING_ID,
    })
    expect(idsOf(config)).toEqual({
      [TOP_LEVEL]: PRODUCTION_ID,
      staging: NEW_STAGING_ID,
    })
  })

  it("refuses a database_name no block declares, and changes nothing", () => {
    const before = readFileSync(config, "utf-8")
    expect(() =>
      patchDatabaseId({ configPath: config, databaseName: "no-such-db", uuid: "x" }),
    ).toThrow(/no-such-db/)
    expect(readFileSync(config, "utf-8")).toBe(before)
  })

  it("refuses an environment that is not declared", () => {
    expect(() =>
      patchDatabaseId({
        configPath: config,
        env: "preview",
        databaseName: "remy-sport-db",
        uuid: NEW_STAGING_ID,
      }),
    ).toThrow(/not declared/)
  })
})

/**
 * The guard itself, exercised by writing to the wrong block on purpose.
 *
 * Everything above proves the *locator* picks the right block. This proves the
 * verification would catch it if the locator were wrong again — which is the
 * property that has to survive the consolidation refactor, where a target
 * environment starts being threaded through and there is a fresh opportunity to
 * thread it wrong.
 *
 * It writes staging's uuid over production's line directly, then asks
 * `patchDatabaseId` to reconcile staging, so the file is in exactly the state
 * the old first-match code would have produced.
 */
describe("the verification, not just the locator", () => {
  it("refuses and restores when another environment's id would move", () => {
    // Two blocks, same database_name — so the locator finds production's block
    // first while the caller has asked for staging's environment. A malformed
    // config rather than a contrived one: this is what a copy-pasted [env.*]
    // block looks like before the name is edited.
    const collided = FIXTURE.replace('database_name = "remy-sport-staging-db"', 'database_name = "remy-sport-db"')
    writeFileSync(config, collided)
    const before = readFileSync(config, "utf-8")

    expect(() =>
      patchDatabaseId({
        configPath: config,
        env: "staging",
        databaseName: "remy-sport-db",
        uuid: NEW_STAGING_ID,
      }),
    ).toThrow(/changed, and must not have/)

    // The whole point: production's id survived a write that targeted it.
    expect(readFileSync(config, "utf-8")).toBe(before)
    expect(idsOf(config)[TOP_LEVEL]).toBe(PRODUCTION_ID)
  })
})
