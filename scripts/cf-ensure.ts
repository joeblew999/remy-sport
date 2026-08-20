/**
 * Idempotent Cloudflare resource provisioning (ADR 006).
 *
 * Resolves the project's D1 database and R2 bucket, creating either only if
 * absent, and writes the resolved D1 uuid back into wrangler.toml so no human
 * ever copies a database_id by hand — the drift that emptied the environment
 * on 2026-08-20.
 *
 * Usage: bun scripts/cf-ensure.ts <d1|r2>
 *
 * Env vars (from mise.toml [env]):
 *   CF_D1_NAME — D1 database name
 *   CF_R2_NAME — R2 bucket name
 */

import { execFileSync } from "child_process"
import { readFileSync, writeFileSync } from "fs"

const WRANGLER_TOML = "wrangler.toml"

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`cf-ensure: missing required env var ${name} (expected from mise.toml [env])`)
    process.exit(1)
  }
  return v
}

/**
 * Every Cloudflare call goes through a mise task, per the AGENTS.md convention
 * that agents and humans drive the same tooling — never raw `bun x wrangler`.
 *
 * `-q` is required, not cosmetic: a plain `mise run` prints the resolved
 * `depends` output (e.g. `bun install`) on stdout, which corrupts JSON capture.
 * Run via argv (no shell) so nothing in the task name can inject.
 */
function mise(task: string): string {
  // stderr is piped rather than inherited so a tolerated failure (the expected
  // "bucket already exists") does not print an alarming wrangler ERROR block on
  // a successful run. Genuine failures are re-printed by the callers below.
  return execFileSync("mise", ["run", "-q", task], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

// ── D1 ───────────────────────────────────────────────────────────────────────

/**
 * `wrangler d1 list --json` is verified to emit objects keyed uuid/name on
 * wrangler 4.124.0. Unlike R2 below, this is structured output we can trust.
 */
function ensureD1(name: string): void {
  let db = findD1(name)

  if (!db) {
    console.log(`cf-ensure: D1 "${name}" not found — creating`)
    try {
      mise("cf:d1:create")
    } catch (err) {
      // If the create is rejected because the name is taken, the listing we
      // just read was incomplete — the same truncation that bites R2 above.
      // We cannot recover, because the uuid we need only comes from the list.
      const e = err as { stdout?: string; stderr?: string }
      const output = `${e.stdout ?? ""}${e.stderr ?? ""}`
      if (/already exists/.test(output)) {
        console.error(
          `cf-ensure: D1 "${name}" exists but was absent from the listing — 'wrangler d1 list --json' is truncating. Resolve the uuid manually and set database_id in ${WRANGLER_TOML}.`,
        )
      } else {
        console.error(`cf-ensure: creating D1 "${name}" failed:\n${output}`)
      }
      process.exit(1)
    }
    db = findD1(name)
    if (!db) {
      console.error(`cf-ensure: created D1 "${name}" but it did not appear in the list`)
      process.exit(1)
    }
  }

  patchDatabaseId(name, db.uuid)
}

function findD1(name: string): { uuid: string; name: string } | undefined {
  const raw = mise("cf:d1:list:json")
  // wrangler prepends a banner before the JSON array; slice from the first "[".
  const start = raw.indexOf("[")
  if (start === -1) {
    console.error(`cf-ensure: could not find JSON in 'mise run cf:d1:list:json' output:\n${raw}`)
    process.exit(1)
  }
  const list = JSON.parse(raw.slice(start)) as Array<{ uuid: string; name: string }>
  return list.find((d) => d.name === name)
}

/**
 * Rewrite database_id in the [[d1_databases]] block. Matched narrowly on the
 * key line so nothing else in wrangler.toml can be touched.
 */
function patchDatabaseId(name: string, uuid: string): void {
  const toml = readFileSync(WRANGLER_TOML, "utf-8")
  const current = toml.match(/^database_id\s*=\s*"([^"]*)"/m)

  if (!current) {
    console.error(`cf-ensure: no database_id line found in ${WRANGLER_TOML}`)
    process.exit(1)
  }
  if (current[1] === uuid) {
    console.log(`cf-ensure: D1 "${name}" (${uuid}) — database_id already correct, no change`)
    return
  }

  const patched = toml.replace(/^database_id\s*=\s*"[^"]*"/m, `database_id = "${uuid}"`)
  writeFileSync(WRANGLER_TOML, patched)
  console.log(`cf-ensure: D1 "${name}" — database_id ${current[1]} → ${uuid} (${WRANGLER_TOML} updated)`)
}

// ── R2 ───────────────────────────────────────────────────────────────────────

/**
 * R2 is checked by attempting the create, NOT by scraping the listing.
 *
 * `wrangler r2 bucket list` has no --json flag (verified: "Unknown argument:
 * json") and — the reason this matters — it silently paginates at 20 buckets
 * with no flag to page further. This account has 26, and remy-sport-storage
 * fell off page 1, so a listing-based check reported it absent when it in fact
 * existed. That is worse than the unparseable output ADR 006 anticipated: the
 * output parses perfectly and is simply incomplete, so there is nothing to
 * detect. Creating and tolerating "already exists" is idempotent regardless of
 * how the listing is formatted or truncated.
 */
function ensureR2(name: string): void {
  try {
    mise("cf:r2:create")
    console.log(`cf-ensure: R2 "${name}" created`)
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    const output = `${e.stdout ?? ""}${e.stderr ?? ""}`
    if (/already exists, and you own it|code: 10004/.test(output)) {
      console.log(`cf-ensure: R2 "${name}" already exists, no change`)
      return
    }
    console.error(`cf-ensure: creating R2 "${name}" failed:\n${output}`)
    process.exit(1)
  }
}

// ── Entry ────────────────────────────────────────────────────────────────────

const target = process.argv[2]

switch (target) {
  case "d1":
    ensureD1(requireEnv("CF_D1_NAME"))
    break
  case "r2":
    ensureR2(requireEnv("CF_R2_NAME"))
    break
  default:
    console.error(`cf-ensure: usage: bun scripts/cf-ensure.ts <d1|r2> (got "${target ?? ""}")`)
    process.exit(1)
}
