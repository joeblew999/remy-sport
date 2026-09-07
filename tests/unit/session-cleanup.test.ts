import { afterEach, expect, it, vi } from "vitest"
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const active = vi.hoisted(() => new Set<string>())
vi.mock("@playwright/test", () => ({ request: { newContext: async ({ storageState }: { storageState: { id: string } }) => ({
  get: async () => ({ ok: () => storageState.id !== "unreachable", status: () => 503, json: async () => active.has(storageState.id) ? { session: { id: storageState.id } } : null }),
  post: async () => { active.delete(storageState.id); return { ok: () => true } },
  dispose: async () => {},
}) } }))
import { endRunSessions } from "../helpers/session-cleanup"

const directory = mkdtempSync(join(tmpdir(), "remy-cleanup-test-"))
afterEach(() => { rmSync(directory, { recursive: true, force: true }); active.clear() })
it("cleans independent sessions, verifies sign-out, and retains failed records for recovery", async () => {
  for (const id of ["one", "already-ended", "unreachable", "four", "five"]) {
    writeFileSync(join(directory, `${id}.json`), JSON.stringify({ id }))
    if (id !== "already-ended") active.add(id)
  }
  await expect(endRunSessions("http://localhost:8787", directory)).rejects.toThrow("Test session cleanup failed")
  expect(active).toEqual(new Set(["unreachable"]))
  expect(existsSync(join(directory, "unreachable.json"))).toBe(true)
  for (const id of ["one", "already-ended", "four", "five"]) expect(existsSync(join(directory, `${id}.json`))).toBe(false)
})
