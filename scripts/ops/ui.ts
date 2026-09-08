/**
 * shadcn components and theme, added the one way that keeps them upgradeable.
 *
 *   bun run ops ui add button dialog     copy items from the registry, then lock them
 *   bun run ops ui add @acme/thing       from an allowed namespace only
 *   bun run ops ui theme                 write the theme shadcn's preset system decides
 *   bun run ops ui check                 what tests/repo/registry.test.ts checks
 *
 * `add` runs `shadcn add` with `--overwrite`, so re-adding an item is how an
 * upgrade is taken, then records every file the registry wrote with its hash
 * in components-lock.json. The reasoning is in scripts/lib/registry-lock.ts.
 *
 * `theme` is the one decision-free way to get a theme: the preset recorded in
 * components-lock.json (style, base colour, theme colour, radius — the same
 * fields https://ui.shadcn.com/create offers) is sent to shadcn's own preset
 * endpoint, which answers with the complete light and dark token set, and
 * `shadcn add` writes it into the stylesheet. Change the theme by editing
 * that JSON and running this again; never by editing the values in CSS.
 * (`shadcn apply <code>` is the same thing driven by a preset code from the
 * create page; it answered 400 on 2026-09-08 for every code, so this drives
 * the endpoint it uses directly.)
 */
import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { LOCK_FILE, hashFile, namespaceOf, qualify, readLock, verifyLock } from "../lib/registry-lock.ts"

const ROOT = resolve(import.meta.dirname, "../..")
const [action, ...items] = process.argv.slice(2)

function usage(code: number): never {
  console.log("usage: bun run ops ui add <item...> | theme | check")
  process.exit(code)
}

if (action === "theme") {
  const { preset } = readLock(ROOT)
  if (!preset) {
    console.error(`ui: no "preset" in ${LOCK_FILE}. Add one with style, baseColor, theme, font, radius, iconLibrary, menuAccent and menuColor.`)
    process.exit(1)
  }
  const params = new URLSearchParams({ base: "base", ...preset, rtl: "false", only: "theme" })
  const url = `https://ui.shadcn.com/init?${params}`
  console.log(`ui: theme from ${url}`)
  const run = spawnSync("bun", ["x", "shadcn", "add", url, "--yes", "--overwrite"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "0" },
  })
  process.exit(run.status ?? 1)
}

if (action === "check") {
  const problems = verifyLock(ROOT)
  if (problems.length) {
    console.error(`ui: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`)
    process.exit(1)
  }
  console.log(`ui: ${Object.keys(readLock(ROOT).items).length} locked item(s), tree and lock agree`)
  process.exit(0)
}

if (action !== "add" || items.length === 0) usage(action === undefined || action === "--help" ? 0 : 1)

const lock = readLock(ROOT)
const qualified = items.map(qualify)
for (const item of qualified) {
  const namespace = namespaceOf(item)
  if (!(namespace in lock.registries)) {
    console.error(
      `ui: ${namespace} is not an allowed registry.\n\n` +
        `Allowed, with why:\n${Object.entries(lock.registries).map(([n, why]) => `  ${n}  ${why}`).join("\n")}\n\n` +
        `To allow it, add it to "registries" in ${LOCK_FILE} with the reason, then run this again.`,
    )
    process.exit(1)
  }
}

/**
 * The CLI names every file it writes; that list is the lock's source of truth.
 * `--overwrite` because this command is also how an upgrade is taken.
 */
const run = spawnSync("bun", ["x", "shadcn", "add", ...qualified, "--yes", "--overwrite"], {
  cwd: ROOT,
  encoding: "utf8",
  env: { ...process.env, FORCE_COLOR: "0" },
})
process.stdout.write(run.stdout)
process.stderr.write(run.stderr)
if (run.status !== 0) process.exit(run.status ?? 1)

const written = [...run.stdout.matchAll(/^\s+- (\S+)$/gm)].map((m) => m[1]!)
if (written.length === 0) {
  console.error("ui: shadcn reported no files written, so nothing was locked. Was the item already present and identical?")
  process.exit(1)
}

/*
 * One item at a time is not something the CLI reports — it prints the files
 * of the whole batch — so a batch's files are recorded under the first item
 * and the rest point at it. Add items one per command when the provenance
 * matters; it usually does.
 */
const [first, ...rest] = qualified
const files = Object.fromEntries(written.map((file) => [file, hashFile(join(ROOT, file))]))
lock.items[first!] = { files }
for (const item of rest) lock.items[item] = { files: {} }
for (const [item, entry] of Object.entries(lock.items)) {
  if (item === first) continue
  for (const file of Object.keys(entry.files)) if (file in files) delete entry.files[file]
}
writeFileSync(join(ROOT, LOCK_FILE), JSON.stringify(lock, null, 2) + "\n")
console.log(`ui: locked ${written.length} file(s) from ${qualified.join(", ")} in ${LOCK_FILE}`)

const problems = verifyLock(ROOT)
if (problems.length) {
  console.error(`ui: the lock and the tree still disagree\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
