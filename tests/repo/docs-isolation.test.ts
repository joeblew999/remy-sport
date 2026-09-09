import { afterEach, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { appSnapshot, changedPaths } from "../../scripts/ops/docs"

const root = resolve(import.meta.dirname, "../..")
const fixtures: string[] = []
afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }) })

it("detects app edits, deleted files and changed dependency manifests without resetting them", () => {
  const dir = mkdtempSync(join(tmpdir(), "remy-docs-boundary-"))
  fixtures.push(dir)
  mkdirSync(join(dir, "src"))
  mkdirSync(join(dir, "node_modules/react"), { recursive: true })
  writeFileSync(join(dir, "package.json"), '{}')
  writeFileSync(join(dir, "src/app.ts"), 'original uncommitted content')
  writeFileSync(join(dir, "node_modules/react/package.json"), '{"version":"1"}')
  const before = appSnapshot(dir)
  writeFileSync(join(dir, "src/app.ts"), 'changed')
  rmSync(join(dir, "package.json"))
  writeFileSync(join(dir, "node_modules/react/package.json"), '{"version":"2"}')
  expect(changedPaths(before, appSnapshot(dir))).toEqual(["node_modules/react/package.json", "package.json", "src/app.ts"])
  expect(readFileSync(join(dir, "src/app.ts"), "utf8")).toBe("changed")
})

it("keeps the content package out of the app workspace and deployment", () => {
  const app = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const help = JSON.parse(readFileSync(join(root, "sites/help/package.json"), "utf8"))
  expect(app.workspaces).toBeUndefined()
  expect(Object.keys({ ...app.dependencies, ...app.devDependencies }).filter((name) => /fuma|waku/.test(name))).toEqual([])
  expect(help.workspaces).toBeUndefined()
  expect(help.overrides).toBeUndefined()
  expect(help.dependencies.fumapress).toBe("1.2.0")
  expect(readFileSync(join(root, "wrangler.toml"), "utf8")).not.toContain("sites/help")
  expect(readFileSync(join(root, "src/web/vite.config.ts"), "utf8")).not.toContain("sites/help")
  const worker = JSON.parse(readFileSync(join(root, "sites/help/wrangler.jsonc"), "utf8"))
  expect(worker.name).toBe("remy-help-proof")
  expect(worker.routes).toBeUndefined()
  expect(worker.assets.directory).toBe("./dist/public")
})
