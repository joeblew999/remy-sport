import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { prepareConfig } from "../../scripts/deploy/build-config"

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "remy-build-config-"))
  directories.push(root)
  return {
    root,
    add(directory: string, name: string, account = "account") {
      const dir = join(root, directory)
      mkdirSync(dir)
      const path = join(dir, "wrangler.json")
      writeFileSync(path, JSON.stringify({ name, account_id: account }))
      return path
    },
  }
}

it("selects staging even when the gate left a production build first", () => {
  const f = fixture()
  const production = f.add("a-production", "remy-sport")
  const staging = f.add("z-staging", "remy-sport-staging")
  expect(prepareConfig(f.root, "remy-sport-staging", "account")).toBe(staging)
  expect(prepareConfig(f.root, "remy-sport", "account")).toBe(production)
})

it("refuses absent, ambiguous and wrong-account builds", () => {
  const f = fixture()
  f.add("production", "remy-sport")
  expect(() => prepareConfig(f.root, "remy-sport-staging", "account")).toThrow("found 0")
  f.add("wrong-account", "remy-sport-staging", "other-account")
  expect(() => prepareConfig(f.root, "remy-sport-staging", "account")).toThrow("found 0")
  f.add("staging", "remy-sport-staging")
  f.add("duplicate", "remy-sport-staging")
  expect(() => prepareConfig(f.root, "remy-sport-staging", "account")).toThrow("found 2")
})

/**
 * The stamp written into the config is the one the deploy waits for.
 *
 * These are two different processes' idea of "now" unless something makes them
 * agree: the build runs as a child with BUILD_ID in its environment, and
 * `prepareConfig` runs in the deploy itself. When they disagreed, staging
 * published correctly and then failed verification for five minutes, because
 * `wait` was comparing the served stamp against a BUILD_ID the Worker had
 * never been given.
 */
it("stamps the config with BUILD_ID rather than the moment it ran", async () => {
  const { stamp } = await import("../../scripts/lib/build-stamp")
  const before = process.env.BUILD_ID
  process.env.BUILD_ID = "2026-01-01T00:00:00.000Z"
  try {
    expect(stamp("build", "staging").builtAt).toBe("2026-01-01T00:00:00.000Z")
  } finally {
    if (before === undefined) delete process.env.BUILD_ID
    else process.env.BUILD_ID = before
  }
})
