import { afterEach, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { join, resolve, dirname } from "node:path"

const fixtures: string[] = []
afterEach(() => fixtures.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
function freshCheckout(): string {
  const parent = resolve(".wrangler")
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, "remote-cli-test-"))
  fixtures.push(root)
  const files = ["scripts/ops.ts", "scripts/ops/remote.ts", "scripts/ops/tunnel.ts", "scripts/lib/prepare.ts", "scripts/lib/bun-pin.ts", "scripts/lib/app-tunnel.ts", "src/environment.ts",
    ...readdirSync("scripts/lib").filter(file => file.startsWith("remote-") && file.endsWith(".ts")).map(file => `scripts/lib/${file}`)]
  for (const file of files) { mkdirSync(dirname(join(root, file)), { recursive: true }); copyFileSync(file, join(root, file)) }
  return root
}
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)])
}
it("help and invalid arguments work with no dependencies and no installation", () => {
  const root = freshCheckout()
  const before = filesUnder(root)
  for (const [args, expected] of [
    [["remote", "--help"], 0], [["tunnel", "--help"], 0],
    [["remote", "unknown"], 1], [["tunnel", "unknown"], 1],
  ] as const) {
    const result = spawnSync("bun", ["scripts/ops.ts", ...args], { cwd: root, encoding: "utf8", timeout: 5000 })
    expect(result.status, result.stderr).toBe(expected)
    expect(result.stdout + result.stderr).not.toContain("bun install")
  }
  expect(existsSync(join(root, "node_modules"))).toBe(false)
  expect(filesUnder(root)).toEqual(before)
})
it("status reports unavailable configuration as JSON without writing to a fresh checkout", () => {
  const root = freshCheckout()
  const before = filesUnder(root)
  const env = { ...process.env }
  delete env.TUNNEL_NAME
  delete env.TUNNEL_HOSTNAME
  delete env.TUNNEL_ZONE
  const result = spawnSync("bun", ["scripts/ops.ts", "remote", "status", "--json"], { cwd: root, env, encoding: "utf8", timeout: 45_000 })
  expect(result.status, result.stderr).toBe(2)
  expect(JSON.parse(result.stdout)).toMatchObject({ schema: 1, ready: false, cloudflare: { state: "unknown" } })
  expect(filesUnder(root)).toEqual(before)
  expect(result.stdout + result.stderr).not.toContain("bun install")
})
