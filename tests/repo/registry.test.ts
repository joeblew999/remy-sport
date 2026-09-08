/**
 * Copied components match what the registry wrote, and came from where the
 * lock allows.
 *
 * Why this exists, and why it is the lock rather than a convention, is in
 * scripts/lib/registry-lock.ts. This file only asks the question.
 */
import { resolve } from "node:path"
import { expect, test } from "vitest"
import { rule } from "./helpers"
import { LOCK_FILE, UI_DIR, qualify, readLock, verifyLock } from "../../scripts/lib/registry-lock"

const ROOT = resolve(import.meta.dirname, "../..")

test("items are qualified by registry and never by URL or path", () => {
  expect(qualify("button")).toBe("@shadcn/button")
  expect(qualify("@magicui/marquee")).toBe("@magicui/marquee")
  expect(() => qualify("https://example.com/r/button.json")).toThrow()
  expect(() => qualify("./local.json")).toThrow()
})

const problems = verifyLock(ROOT)
rule(
  `every file under ${UI_DIR} is locked, unchanged, and from an allowed registry`,
  problems,
  `registry: ${problems.length} problem(s)\n  ${problems.join("\n  ")}\n\n` +
    `Components are added and upgraded with \`bun run ops ui add <item>\`, never edited by hand.\n` +
    `A registry is allowed by naming it, with the reason, under "registries" in ${LOCK_FILE}.`,
  `registry: ${Object.keys(readLock(ROOT).items).length} locked item(s), tree and lock agree`,
)
