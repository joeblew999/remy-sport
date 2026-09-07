import { spawnSync } from "node:child_process"
import { expect, test } from "vitest"

test("ops help succeeds without installing and unknown operations fail without installing", () => {
  for (const [args, status] of [[[], 0], [["--help"], 0], [["unknown-operation"], 1]] as const) {
    const result = spawnSync("bun", ["scripts/ops.ts", ...args], { encoding: "utf8" })
    expect(result.status, result.stderr).toBe(status)
    expect(result.stdout).toContain("bun run ops <operation>")
    expect(result.stdout + result.stderr).not.toContain("bun install")
    if (status === 0) expect(result.stdout).not.toContain("no such operation")
  }
})
