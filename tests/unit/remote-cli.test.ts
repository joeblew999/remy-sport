/**
 * The ops CLI runs on a checkout that has never been installed into.
 *
 * ## Why this reads `HEAD` and not the working tree
 *
 * It used to `copyFileSync` these files straight out of the working tree into
 * `.wrangler/`, and it was the repository's one reliably flaky test — three
 * deploy attempts failed on it, each differently, each passing when re-run on
 * its own. That is a slow and expensive way to learn nothing.
 *
 * The cause is not a race in the copy. Measured, so as not to guess:
 * `copyFileSync` on APFS is `clonefile` and tore 0 times in 10,429 copies
 * against a concurrent writer; 12-core saturation did not reproduce it; the
 * command takes 0.3s against a 45s timeout; and a canary directory under
 * `.wrangler/` survived a running dev server, so nothing was deleting the
 * fixture either.
 *
 * What is left is structural, and is simply true whatever the weather: this
 * test **copies source files out of a shared working tree and executes them**.
 * Several agents work in this repository at once. Both observed failures landed
 * while another was part-way through editing `scripts/ops.ts` — a file in the
 * list below. A half-finished edit is not a corrupt file; it is a valid file
 * that does not work yet, and running it fails in a different way each time.
 *
 * Building the fixture with `git archive HEAD` removes the coupling: committed
 * content is immutable, so this test now measures one thing and not the weather.
 *
 * **The trade-off, stated rather than hidden.** It no longer covers uncommitted
 * edits: break the no-install property in your working tree and this stays green
 * until you commit. That is the deliberate choice, because there is no snapshot
 * of "my changes only" in a tree several agents share — the previous behaviour
 * did not test your edits so much as everybody's, whichever happened to be
 * half-written. The property is re-checked on the next run after commit, and the
 * gate runs before deploy, so the exposure is one commit.
 *
 * The fixture also moved from `.wrangler/` to the OS temp directory, which makes
 * this **stricter**: sitting inside the repository, it could resolve the real
 * `node_modules` through an ancestor lookup, so "no dependencies" was only
 * half-checked. Outside it, there is no ancestor to find.
 */
import { afterEach, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * `--no-install`, or this tests nothing it claims to.
 *
 * Bun auto-installs a missing package from its global cache when a checkout has
 * no `node_modules` — which is exactly the situation this fixture creates. So
 * "no dependencies and no installation" was being satisfied by Bun going and
 * fetching them: `import { z } from "zod"` added to a file on the CLI's own
 * path left both tests green. Measured 2026-09-10 against a fixture archived
 * from HEAD: default `bun` exited 0, `bun --no-install` exited 1.
 *
 * The flag is the assertion. Without it this is a slow way to check that the
 * help text still prints.
 */
const NO_INSTALL = ["--no-install"]

/**
 * These build a checkout and run a CLI against it; the 5s default was inherited
 * from when the fixture was eight files. Not a latency assertion — the ceiling
 * before a hang is called a hang.
 */
const BUILDS_A_CHECKOUT = 60_000

const fixtures: string[] = []
afterEach(() => fixtures.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
function freshCheckout(): string {
  const root = mkdtempSync(join(tmpdir(), "remote-cli-test-"))
  fixtures.push(root)
  /**
   * The whole tree at HEAD, not a list of files.
   *
   * It used to name the handful of files the CLI was believed to need, which
   * modelled a checkout nobody has — a remote machine clones everything — and
   * had to be maintained by hand, so a legitimate new import broke this test
   * rather than the property it guards. That cost a deploy on 2026-09-10, when
   * `prepare.ts` gained `deploy-lock.ts`: the minimum grew and the list did not.
   *
   * With `--no-install` above, a full archive tests the property better than
   * any list could: anything reaching for a dependency fails on its own. It is
   * not slower in a way that matters — the tree is 10MB and archives in about a
   * tenth of a second.
   */
  const tar = join(root, "fixture.tar")
  // Written to a file and then extracted, rather than piped through a shell, so
  // that no filename ever passes through shell quoting.
  const archived = spawnSync("git", ["archive", "--format=tar", "-o", tar, "HEAD"], { encoding: "utf8" })
  expect(archived.status, archived.stderr).toBe(0)
  const extracted = spawnSync("tar", ["-x", "-f", tar, "-C", root], { encoding: "utf8" })
  expect(extracted.status, extracted.stderr).toBe(0)
  rmSync(tar)
  // A silently empty or partial archive would make every assertion below
  // vacuous. Counted against what HEAD holds, so this is not one more number to
  // keep current — which is the thing this test has just finished removing.
  const atHead = spawnSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], { encoding: "utf8" })
  expect(atHead.status, atHead.stderr).toBe(0)
  expect(filesUnder(root).length, "fixture does not match HEAD — did the archive fail?")
    .toBe(atHead.stdout.split("\n").filter(Boolean).length)
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
    const result = spawnSync("bun", [...NO_INSTALL, "scripts/ops.ts", ...args], { cwd: root, encoding: "utf8", timeout: 5000 })
    expect(result.status, result.stderr).toBe(expected)
    expect(result.stdout + result.stderr).not.toContain("bun install")
  }
  expect(existsSync(join(root, "node_modules"))).toBe(false)
  expect(filesUnder(root)).toEqual(before)
}, BUILDS_A_CHECKOUT)
it("status reports unavailable configuration as JSON without writing to a fresh checkout", () => {
  const root = freshCheckout()
  const before = filesUnder(root)
  const env = { ...process.env }
  delete env.TUNNEL_NAME
  delete env.TUNNEL_HOSTNAME
  delete env.TUNNEL_ZONE
  const result = spawnSync("bun", [...NO_INSTALL, "scripts/ops.ts", "remote", "status", "--json"], { cwd: root, env, encoding: "utf8", timeout: 45_000 })
  expect(result.status, result.stderr).toBe(2)
  expect(JSON.parse(result.stdout)).toMatchObject({ schema: 1, ready: false, cloudflare: { state: "unknown" } })
  expect(filesUnder(root)).toEqual(before)
  expect(result.stdout + result.stderr).not.toContain("bun install")
}, BUILDS_A_CHECKOUT)
