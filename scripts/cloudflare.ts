/**
 * The Cloudflare boundary. One module owns it.
 *
 * Grew out of `cf-ensure`, whose contents were never the problem — it already
 * owned resolved-config reading and the `database_id` write that pointed
 * production at the wrong database on 2026-08-20. Its *name* was the problem:
 * it read like a task entry point, so nothing else grew here and fifteen
 * scripts each re-decided the same four things instead.
 *
 * Credential, account, target and what an error means are defined here once.
 * Before that they were scattered: the credential rule alone existed in three
 * shapes across seven sites, and the unreachable/absent distinction existed in
 * exactly one private function that only provisioning could reach. That is what
 * 2026-09-01 was — fourteen callers would have read "could not ask" as "not
 * there" and carried on.
 *
 * See docs/dev/cloudflare-module.md for the decisions taken before any of this
 * moved, particularly the `--env` rule, which is declared per operation and is
 * deliberately not a global policy.
 */

import { readFileSync, writeFileSync } from "fs"
import { experimental_readRawConfig, unstable_readConfig } from "wrangler"
import { ENVIRONMENTS, type Environment } from "../src/environment"

const WRANGLER_TOML = "wrangler.toml"

/** The label for the unnamed top-level environment, which is production. */
export const TOP_LEVEL = "(top-level)"

/**
 * Resolved config for one environment — the only view worth provisioning from.
 *
 * Resolved rather than parsed, because inheritance is invisible in the file:
 * a named environment with no `routes` block of its own still deploys onto the
 * top-level hostname. `check-envs.ts` uses this same reader for the same
 * reason. Provisioning from `CF_D1_NAME`-style literals is what this replaces,
 * and the failure there was not an error — every task quietly did the right
 * thing to the wrong account resource.
 */
export function resolvedConfig(env?: string) {
  return unstable_readConfig({ config: WRANGLER_TOML, env })
}

/**
 * Every `[env.*]` block declared in the file, top-level excluded.
 *
 * Enumerated rather than hardcoded so a future `[env.preview]` is covered the
 * day somebody adds it — an environment nothing compares against is exactly how
 * the first one would have gone wrong.
 */
export function declaredEnvs(configPath: string = WRANGLER_TOML): string[] {
  const raw = experimental_readRawConfig({ config: configPath })
  return Object.keys((raw.rawConfig as { env?: Record<string, unknown> }).env ?? {})
}

// ── Writing a database_id, and proving we wrote the right one ────────────────

/**
 * Every environment's D1 bindings, read from **resolved** config.
 *
 * The snapshot the write is checked against. Resolved rather than parsed,
 * because that is the only view that accounts for inheritance: a named
 * environment with no `d1_databases` of its own does not silently show up empty
 * here, it shows whatever it would actually deploy with.
 */
export function d1Snapshot(configPath: string): Map<string, string> {
  const envs = declaredEnvs(configPath)
  const snapshot = new Map<string, string>()
  for (const env of [undefined, ...envs]) {
    const config = unstable_readConfig({ config: configPath, env })
    // Annotated rather than inferred: the tests' tsconfig resolves wrangler's
    // types differently from the worker's and infers `any` here, which would
    // silently stop checking the two field names this whole comparison rests on.
    const bindings = config.d1_databases as Array<{ database_name?: string; database_id?: string }>
    snapshot.set(
      env ?? TOP_LEVEL,
      JSON.stringify(bindings.map((d) => ({ name: d.database_name, id: d.database_id }))),
    )
  }
  return snapshot
}

/**
 * The lines of the block that declares `databaseName`, located by content.
 *
 * Located by the `database_name` it contains rather than by position, then
 * bounded by the enclosing section headers. Position is what the previous
 * version used — a bare `/^database_id/m`, which takes the FIRST match in the
 * file — and with two environments declared that is production's block no
 * matter which environment you asked for.
 */
function blockOf(lines: string[], databaseName: string): { from: number; to: number } | null {
  const declares = new RegExp(`^\\s*database_name\\s*=\\s*"${databaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*$`)
  const at = lines.findIndex((l) => declares.test(l))
  if (at === -1) return null
  const header = /^\s*\[/
  let from = at
  while (from > 0 && !header.test(lines[from]!)) from--
  let to = at + 1
  while (to < lines.length && !header.test(lines[to]!)) to++
  return { from, to }
}

/**
 * Point one environment's D1 binding at `uuid`, and prove nothing else moved.
 *
 * ## Why this is verified rather than merely careful
 *
 * The job is writing a uuid into a config file, and the failure mode is writing
 * it into the wrong block. That happened: `/^database_id\s*=\s*"([^"]*)"/m`
 * matches the first occurrence in the file, which was unambiguous while one
 * environment existed and became production's block the day staging arrived.
 * Patching staging would have pointed **production** at staging's database, and
 * the next deploy would have served production from an empty one — precisely
 * the 2026-08-20 loss this script was written to prevent.
 *
 * A tighter regex is not the fix. Any regex over TOML is a guess about a format
 * with sections, arrays-of-tables, inheritance and comments, and when it guesses
 * wrong it does so **silently** — it writes something, exits 0, and the damage
 * is found later. The property that actually matters is not "the pattern was
 * precise" but "the file now says what I intended and nothing else changed",
 * and that can be checked directly.
 *
 * So: snapshot every environment's resolved D1 bindings, write, re-read, and
 * assert both halves — the target moved to `uuid`, and every other environment
 * is byte-identical. If either fails the original file is restored and the run
 * refuses. A wrong write becomes a loud no-op.
 */
export function patchDatabaseId(opts: {
  configPath: string
  /** The environment being provisioned; undefined is the top-level one. */
  env?: string
  databaseName: string
  uuid: string
}): "unchanged" | "patched" {
  const { configPath, env, databaseName, uuid } = opts
  const label = env ?? TOP_LEVEL
  const original = readFileSync(configPath, "utf-8")

  const before = d1Snapshot(configPath)
  if (!before.has(label)) {
    fail(`environment "${label}" is not declared in ${configPath}`)
  }

  const lines = original.split("\n")
  const block = blockOf(lines, databaseName)
  if (!block) {
    fail(`no [[d1_databases]] block declaring database_name = "${databaseName}" in ${configPath}`)
  }

  const idLine = /^(\s*)database_id\s*=\s*"([^"]*)"/
  const at = lines.slice(block.from, block.to).findIndex((l) => idLine.test(l))
  if (at === -1) {
    fail(`the block for "${databaseName}" has no database_id line to set`)
  }
  const index = block.from + at
  const [, indent = "", current = ""] = lines[index]!.match(idLine)!

  if (current === uuid) {
    console.log(`cloudflare: D1 "${databaseName}" (${uuid}) — database_id already correct, no change`)
    return "unchanged"
  }

  lines[index] = `${indent}database_id = "${uuid}"`
  writeFileSync(configPath, lines.join("\n"))

  // ── The verification. Restoring on failure is the whole point. ─────────────
  const after = d1Snapshot(configPath)
  const problems: string[] = []

  const target = JSON.parse(after.get(label) ?? "[]") as Array<{ name: string; id: string }>
  const wrote = target.find((d) => d.name === databaseName)
  if (wrote?.id !== uuid) {
    problems.push(
      `${label}: database "${databaseName}" should now be ${uuid} but resolves to ${wrote?.id ?? "nothing"}`,
    )
  }
  for (const [other, value] of before) {
    if (other === label) continue
    if (after.get(other) !== value) {
      problems.push(`${other} changed, and must not have:\n      was ${value}\n      now ${after.get(other)}`)
    }
  }

  if (problems.length) {
    writeFileSync(configPath, original)
    fail(
      `refusing to edit ${configPath} — the write did not do what it claimed:\n` +
        problems.map((p) => `    ${p}`).join("\n") +
        `\n\n  ${configPath} has been restored to what it was. Nothing was changed.`,
    )
  }

  console.log(
    `cloudflare: D1 "${databaseName}" [${label}] — database_id ${current || "(empty)"} → ${uuid}` +
      ` (${configPath} updated; ${before.size - 1} other environment(s) verified unchanged)`,
  )
  return "patched"
}

/**
 * Throws rather than exiting, and the CLI boundary below turns it into an exit
 * code.
 *
 * `process.exit` here made the refusal untestable in the way that mattered: a
 * test proving the guard fires would kill the test runner mid-file instead of
 * reporting a named failure, so the regression test for the wrong-block write
 * could not actually assert anything. A refusal a test cannot observe is most of
 * the way back to a silent one.
 */
export class Refused extends Error {}

function fail(message: string): never {
  throw new Refused(message)
}

// ── The target ───────────────────────────────────────────────────────────────

/**
 * Which environment, and what wrangler calls it.
 *
 * `production` is wrangler's *unnamed* top-level config, so its flag is absent
 * rather than `--env production`. That asymmetry is worth naming: passing
 * `--env production` to wrangler does not select production, it looks for an
 * `[env.production]` block that does not exist.
 */
export interface Target {
  environment: Environment
  /** The `--env` value, or undefined for the top-level (production) config. */
  flag?: string
}

export const DEPLOYABLE: Environment[] = ["staging", "production"]

/**
 * Whether this operation may proceed without being told which environment.
 *
 * Declared by the caller, never inferred here. See
 * docs/dev/cloudflare-module.md — deriving it mechanically from "does this
 * write" gets the provisioning plan backwards, and a global rule in either
 * direction breaks something: universally required breaks local migrations,
 * which have never passed `--env`; universally optional lets a remote write go
 * unnamed, which does not error, it resolves to production.
 *
 * - `explicit` — refuse without `--env`. Remote writes, and anything that must
 *   resolve identically to a remote write it describes.
 * - `ambient` — use `--env` when given, otherwise the top-level config. Local
 *   and read-only work.
 */
export type TargetRule = "explicit" | "ambient"

export function resolveTarget(argv: string[], rule: TargetRule = "explicit"): Target {
  const at = argv.indexOf("--env")
  const named = at !== -1 ? argv[at + 1] : argv.find((a) => a.startsWith("--env="))?.split("=")[1]

  if (!named) {
    // `ambient` resolves the unknown to production for the same reason
    // `environmentOf()` does — the risk of an unnamed *read* is a wrong answer
    // you can see. The risk of an unnamed write is not, which is why the other
    // branch refuses instead.
    if (rule === "ambient") return { environment: "production" }
    fail(
      "no target environment.\n" +
        `  Usage: --env <${DEPLOYABLE.join("|")}>\n\n` +
        "  There is deliberately no default. Every other unset-configuration path in\n" +
        "  this codebase resolves to production because the risk is an opened door;\n" +
        "  this one performs writes, where the strict answer is to refuse.",
    )
  }
  if (!(ENVIRONMENTS as readonly string[]).includes(named)) {
    fail(`"${named}" is not an environment. Known: ${ENVIRONMENTS.join(", ")}`)
  }
  if (named === "dev") {
    fail(
      "dev is local and provisions nothing on the account.\n" +
        "  Its D1 lives in .wrangler/state, its secrets in .dev.vars, and its fixed\n" +
        "  sign-in code comes from the policy table. Run `mise run dev:vars`.",
    )
  }
  const environment = named as Environment
  return { environment, flag: environment === "production" ? undefined : environment }
}

/**
 * Where an environment serves, and what its Worker is called — from the config
 * it deploys with, not from a literal.
 *
 * These were CF_DEPLOY_URL and CF_WORKER_NAME in mise's [env], pinned to
 * production. That is the same shape as the CF_D1_NAME literal provisioning
 * used to read: it cannot express three environments, and the failure is not an
 * error — every caller quietly does the right thing to the wrong environment.
 * `cf:wait` polled production's hostname on a staging deploy for exactly this
 * reason.
 *
 * CF_DEPLOY_URL still wins when set, because pointing smoke at localhost or the
 * dev tunnel is a real thing to do; it is an override now rather than the source.
 */
export function originOf(target: Target): string {
  const routes = (resolvedConfig(target.flag).routes ?? []) as Array<{ pattern?: string }>
  const pattern = routes[0]?.pattern
  if (!pattern) {
    fail(
      `no [[routes]] pattern resolves for ${target.environment}, so there is no origin.\n` +
        "  A deployment that cannot be named cannot be verified either.",
    )
  }
  return `https://${pattern.replace(/\/\*$/, "")}`
}

export function workerName(target: Target): string {
  return resolvedConfig(target.flag).name as string
}

// ── The credential ───────────────────────────────────────────────────────────

let cachedToken: string | null | undefined

/**
 * The API token, or null when there is none to be had.
 *
 * `wrangler login` is not enough and the way it fails is why this module
 * exists. The OAuth token records `d1:write` and `whoami` prints it, but every
 * account-scoped D1 call answers 10000 while R2, queues, workers and secrets
 * answer normally on that same token — so a caller on OAuth reports D1 as
 * unreachable and everything else as fine, which reads exactly like a
 * Cloudflare outage and is not one.
 *
 * Environment wins, so `CLOUDFLARE_API_TOKEN=... mise run ...` keeps working and
 * CI supplies its own without touching a keychain. `fnox get`, not `fnox exec`:
 * exec injects every secret declared in fnox.toml and warns about each one
 * unrelated to the task at hand.
 *
 * Null rather than a refusal when fnox has nothing: a machine that never
 * provisions is correctly configured without it, wrangler still has its OAuth
 * credential for everything that works on OAuth, and the caller that genuinely
 * needed this fails through `unreachable()` with the API's own words.
 */
export function token(): string | null {
  if (cachedToken !== undefined) return cachedToken
  // Empty is unset. `CLOUDFLARE_API_TOKEN=` in front of a command says "not
  // this one", and `credentialEnv()` agrees — it strips the empty value rather
  // than passing it on, so both halves read it the same way.
  //
  // They disagreed in one case, and it was the worst one: with an empty value
  // here AND nothing in fnox, this returned null while the child still
  // inherited "". An empty token is worse than no token — wrangler tries to use
  // it instead of falling back to the OAuth credential that would have worked.
  const fromEnv = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (fromEnv) return (cachedToken = fromEnv)
  return (cachedToken = fnoxGet("CLOUDFLARE_API_TOKEN"))
}

/**
 * One secret out of fnox, or null — including when fnox is not installed.
 *
 * `Bun.spawnSync` **throws** on a missing executable rather than returning a
 * non-zero `exitCode`: "Executable not found in $PATH". So the obvious
 * exit-code check is not enough, and without the catch a machine with no fnox —
 * CI, a fresh clone, a contributor who has never provisioned — gets a stack
 * trace from a lookup that is supposed to be allowed to find nothing. The shell
 * this replaced said `2>/dev/null || true` and was right.
 *
 * `bin` is a parameter so the absent-binary path is testable without
 * uninstalling anything.
 */
export function fnoxGet(name: string, bin = "fnox"): string | null {
  try {
    const got = Bun.spawnSync([bin, "get", name], { stdout: "pipe", stderr: "ignore" })
    if (got.exitCode !== 0) return null
    return got.stdout.toString().trim() || null
  } catch {
    return null
  }
}

// ── The account ──────────────────────────────────────────────────────────────

/**
 * The pinned account, asserted rather than merely supplied.
 *
 * A credential valid for a *different* account does not error — it produces
 * confident, successful, wrong output against somebody else's resources. So
 * this refuses when the pin is missing, and every call this module makes
 * carries it explicitly: `wrangler()` puts it in the child's environment and
 * `api()` builds it into the URL. A caller cannot reach a different account by
 * accident, because it cannot reach one without going through here.
 */
export function accountId(): string {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!id) {
    fail(
      "CLOUDFLARE_ACCOUNT_ID is not set.\n" +
        "  It is pinned in mise.toml's [env] so no command can act against a different\n" +
        "  account than the one this repo deploys to. Run through `mise run`, or set it.",
    )
  }
  return id
}

/** The environment every Cloudflare child process gets, and nothing else. */
function credentialEnv(): Record<string, string> {
  // Discarded from the spread, not overwritten: an empty CLOUDFLARE_API_TOKEN
  // means unset, `token()` reads it that way, and a child that still received
  // "" would be authenticating differently from what this module decided.
  const { CLOUDFLARE_API_TOKEN: _discarded, ...rest } = process.env
  const t = token()
  return {
    ...rest,
    CLOUDFLARE_ACCOUNT_ID: accountId(),
    ...(t ? { CLOUDFLARE_API_TOKEN: t } : {}),
  } as Record<string, string>
}

// ── Running wrangler ─────────────────────────────────────────────────────────

export interface Ran {
  code: number
  out: string
  err: string
}

/**
 * One wrangler invocation, with the credential and account already decided.
 *
 * `inherit` streams to the terminal and returns empty strings, which is what
 * long operations want — wrangler writes progress to the same stdout as its
 * result, so piping a migration once killed a deploy with EPIPE. Captured is
 * the default because most callers need to read the answer.
 */
export function wrangler(
  args: string[],
  target?: Target,
  opts: { stdin?: string; inherit?: boolean } = {},
): Ran {
  const full = ["x", "wrangler", ...args, ...(target?.flag ? ["--env", target.flag] : [])]
  const proc = Bun.spawnSync(["bun", ...full], {
    stdin: opts.stdin === undefined ? "ignore" : new TextEncoder().encode(opts.stdin),
    stdout: opts.inherit ? "inherit" : "pipe",
    stderr: opts.inherit ? "inherit" : "pipe",
    env: credentialEnv(),
  })
  return {
    code: proc.exitCode,
    out: proc.stdout?.toString() ?? "",
    err: proc.stderr?.toString() ?? "",
  }
}

// ── The REST API, for what wrangler cannot do ────────────────────────────────

const API = "https://api.cloudflare.com/client/v4"

/** The one place a bearer token is attached to a request. */
async function v4(path: string, init: RequestInit = {}): Promise<Response> {
  const t = token()
  if (!t) {
    fail(
      "CLOUDFLARE_API_TOKEN is not set and fnox has no value for it.\n" +
        "  This call has no wrangler equivalent, so the OAuth credential cannot stand in.\n" +
        "  Store it:  mise exec -- fnox set --global -p keychain CLOUDFLARE_API_TOKEN",
    )
  }
  return fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...init.headers },
  })
}

/**
 * An account-scoped call, for endpoints wrangler has no command for.
 *
 * The prefix is built here rather than passed in, so a caller cannot name a
 * different account. `cf-audit.ts` carried `CF_ACCOUNT_ID ?? "<a literal
 * uuid>"` — Decision 2's failure wearing its most obvious face: a pin one
 * caller had quietly opted out of.
 */
export async function accountApi(path: string, init: RequestInit = {}): Promise<Response> {
  return v4(`/accounts/${accountId()}${path}`, init)
}

/**
 * A zone-scoped call. Zones are not account-scoped in the URL — the token is
 * what confines them to this account — so they get their own named door rather
 * than a general escape hatch from `accountApi`'s prefix.
 */
export async function zoneApi(path: string, init: RequestInit = {}): Promise<Response> {
  return v4(`/zones${path}`, init)
}

/**
 * The `{ success, result, errors }` envelope, unwrapped once.
 *
 * Every REST caller wrote this out again, and reading it wrongly is the same
 * family of mistake as `unreachable()`: `res.ok` is true for a 200 whose body
 * says `success: false`, so a refusal reads as a result.
 */
export async function apiResult<T>(res: Response, what: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as {
    success?: boolean
    result?: T
    errors?: { message?: string }[]
  } | null

  if (!body?.success) {
    const why = body?.errors?.map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${res.status}`
    fail(`${what} — ${why}`)
  }
  return body.result as T
}

// ── What an error means ──────────────────────────────────────────────────────

/**
 * Whether the account itself could not be reached, as opposed to the resource
 * being absent.
 *
 * The distinction every caller needs and only provisioning had. "This bucket
 * does not exist" and "I could not ask" look identical at the exit code, and
 * treating the second as the first is how a plan says `+ create` about
 * something already there — or, in apply mode, how a run decides a populated
 * database needs making. On 2026-09-01 it was the only thing standing between a
 * broken credential and five migrations being skipped silently.
 */
export function unreachable(r: Ran): string | null {
  // A command that succeeded reached the account, whatever its output says.
  // `Ran` carries the exit code and this used to ignore it, so the guarantee
  // lived in each call site's `code !== 0` guard instead of here — four of them
  // got it right and the fifth would not have. A successful listing that merely
  // *contains* "Authentication error" is a resource name, not a failure.
  if (r.code === 0) return null

  const text = r.out + r.err
  if (!/Authentication error|code: 10000|code: 10001|not logged in|fetch failed|ENOTFOUND/i.test(text)) {
    return null
  }
  const clean = text.split("\n").map((l) => l.replace(/\[[0-9;]*m/g, "").trim())
  // Prefer the line carrying the API's own code — "Authentication error
  // [code: 10000]" is diagnosable; "a request failed" is not.
  const reason =
    clean.find((l) => /\[code: \d+\]/.test(l)) ??
    clean.find((l) => /error|failed/i.test(l) && l.length > 10) ??
    "could not reach the Cloudflare API"
  return `${reason} — could not ask, so this is NOT "absent".`
}
