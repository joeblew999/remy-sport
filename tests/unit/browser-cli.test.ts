import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { expect, it } from "vitest"

// Exercise the public CLI, not a duplicate of its argument construction. --list
// resolves the real Playwright projects without starting a server or signing in.
it("the browser CLI forwards a positional media spec without treating it as a project", () => {
  const output = execFileSync("bun", ["run", "test:e2e", "--", "--media", "tests/e2e/moq.media.ts", "--list"], {
    cwd: resolve(import.meta.dirname, "../.."), encoding: "utf8", timeout: 15_000,
  })
  expect(output).toContain("[media]")
  expect(output).toContain("real media: denial")
  expect(output).toContain("isolated local storage removed")
})
