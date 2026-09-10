/**
 * The Cloudflare boundary. One module owns it.
 *
 * Credential, account, target and what an error means are defined here once —
 * scattered, each was re-decided per script and they disagreed.
 *
 * docs/dev/cloudflare-module.md has the decisions, particularly the `--env`
 * rule, which is declared per operation and deliberately not a global policy.
 */

import { spawnSync } from "node:child_process"
import { parseArgs } from "node:util"
import { readFileSync, writeFileSync } from "node:fs"
import { experimental_readRawConfig, unstable_readConfig } from "wrangler"
import { ENVIRONMENTS, type Environment } from "../../src/environment.ts"

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
 * Verified rather than careful, because any regex over TOML guesses at a format
 * with sections, inheritance and comments — and when it guesses wrong it writes
 * something and exits 0. A first-match `database_id` pattern once meant patching
 * staging would have pointed production at staging's database.
 *
 * So: snapshot every environment's resolved bindings, write, re-read, assert the
 * target moved and every other environment is byte-identical. Either failure
 * restores the file and refuses, turning a wrong write into a loud no-op.
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

/**
 * The environment a caller named, in either spelling, or undefined.
 *
 * A reader that knows only one spelling does not fail on the other — it reports
 * nothing named and falls through to production, silently. One reader, so there
 * is one behaviour to get right.
 *
 * This answers "what did they type", not "what should we act on"; for that use
 * `resolveTarget`. Smoke and demo-status need the distinction, because
 * `CF_DEPLOY_URL` may only win when nothing more specific was said.
 */
export function namedEnvironment(argv: string[]): string | undefined {
  return read(argv).values.env as string | undefined
}

/**
 * `--env` parsed by Node, not by hand.
 *
 * Knowing that `--env staging` and `--env=staging` are the same flag is the job
 * of an argument parser, and hand-rolling it is what produced two of today's
 * bugs — one reader that knew only the joined form, another that knew only the
 * separated one, each falling through to production on the spelling it did not
 * know. `node:util.parseArgs` has known both since it shipped.
 *
 * `strict: false` because every caller forwards what it does not consume:
 * `test:e2e` hands the rest to Playwright, `ops analytics` takes bare `24` and
 * `--logs`. Strict mode would reject those as unknown options. Declaring `env`
 * is still required — without it, `--env staging` parses as a boolean followed
 * by a stray positional.
 */
function read(argv: string[]) {
  return parseArgs({
    args: argv,
    options: { env: { type: "string" } },
    strict: false,
    allowPositionals: true,
    tokens: true,
  })
}

/**
 * The same argv with `--env=staging` rewritten as `--env staging`.
 *
 * For the caller whose own checks are positional and cannot be taught two
 * spellings in place — `ops docs` requires `--env` at index 1 with its value at
 * index 2. Normalising once at the door keeps that strictness and still accepts
 * what people type.
 */
export function normalisedEnvironmentArgs(argv: string[]): string[] {
  return argv.flatMap((a) =>
    a.startsWith("--env=") ? ["--env", a.slice("--env=".length)] : [a],
  )
}

/**
 * The same argv with the environment flag removed, in either spelling.
 *
 * For a command that consumes `--env` itself and forwards the remainder to
 * another tool — `test:e2e` passes the rest to Playwright, which would refuse an
 * argument it has never heard of.
 *
 * By token index rather than by string. The hand-rolled version dropped any
 * argument whose predecessor happened to be the string `--env`, which is a
 * guess that is usually right; `parseArgs` reports the flag's own index and
 * whether its value was inline, so removal is exact.
 */
export function withoutEnvironment(argv: string[]): string[] {
  const drop = new Set<number>()
  for (const token of read(argv).tokens) {
    if (token.kind !== "option" || token.name !== "env") continue
    drop.add(token.index)
    if (!token.inlineValue) drop.add(token.index + 1)
  }
  return argv.filter((_, i) => !drop.has(i))
}

/**
 * Say which environment was resolved, and do nothing else.
 *
 * `REMY_TARGET_PROBE=1 <command> --env staging` prints it and exits before the
 * command acts, which is how tests/repo/command-targets.test.ts asks a script
 * that parses `process.argv` at module scope and exports nothing.
 *
 * Only when `argv` is the tail of the real command line: `ops versions`
 * synthesises a target per environment, and must not trip a probe about what
 * the user asked for.
 */
function probe(target: Target): Target {
  if (!process.env.REMY_TARGET_PROBE) return target
  // A distinctive token, because the assertion is over a whole process's
  // output. The first version printed `target:`, which Playwright's own
  // WebServer output also contains — so a test meant to prove which environment
  // a command chose passed on somebody else's log line.
  console.log(`remy-target=${target.environment}`)
  process.exit(0)
}

/** Is `argv` the tail of what was actually typed? */
function fromCommandLine(argv: string[]): boolean {
  const typed = process.argv.slice(2)
  if (argv.length > typed.length) return false
  return argv.every((a, i) => a === typed[typed.length - argv.length + i])
}

export function resolveTarget(argv: string[], rule: TargetRule = "explicit"): Target {
  const named = namedEnvironment(argv)
  const answer = (target: Target): Target => (fromCommandLine(argv) ? probe(target) : target)

  if (!named) {
    // `ambient` resolves the unknown to production for the same reason
    // `environmentOf()` does — the risk of an unnamed *read* is a wrong answer
    // you can see. The risk of an unnamed write is not, which is why the other
    // branch refuses instead.
    if (rule === "ambient") return answer({ environment: "production" })
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
        "  sign-in code comes from the policy table. Run `bun run setup`.",
    )
  }
  const environment = named as Environment
  return answer({ environment, flag: environment === "production" ? undefined : environment })
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
 * `wrangler login` is not enough: on an OAuth token every account-scoped D1 call
 * answers 10000 while R2, queues, workers and secrets answer normally — so D1
 * looks unreachable and everything else looks fine, which reads as a Cloudflare
 * outage and is not one.
 *
 * Environment wins so CI can supply its own. `fnox get`, not `fnox exec`, which
 * would inject every secret in fnox.toml.
 *
 * Null rather than a refusal: a machine that never provisions is correctly
 * configured without it, and a caller that genuinely needed it fails through
 * `unreachable()` with the API's own words.
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
 * A missing executable is not an error here. Bun's own `spawnSync` **threw**
 * on one — "Executable not found in $PATH" — so the exit-code check alone was
 * not enough, and a machine with no fnox (CI, a fresh clone, a contributor who
 * has never provisioned) got a stack trace from a lookup that is supposed to
 * be allowed to find nothing. Node's `spawnSync` reports it as `error` with no
 * status, which is what this checks. The shell this replaced said
 * `2>/dev/null || true` and was right.
 *
 * `bin` is a parameter so the absent-binary path is testable without
 * uninstalling anything.
 */
export function fnoxGet(name: string, bin = "fnox"): string | null {
  const got = spawnSync(bin, ["get", name], { stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 })
  if (got.error || got.status !== 0) return null
  return got.stdout?.toString().trim() || null
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
  // wrangler.toml first: it is the file that decides every other per-environment
  // fact, and an account pinned in two places is a pin that can disagree with
  // itself. The environment variable stays as an override for CI.
  const id = process.env.CLOUDFLARE_ACCOUNT_ID || (resolvedConfig().account_id as string | undefined)
  if (!id) {
    fail(
      "CLOUDFLARE_ACCOUNT_ID is not set.\n" +
        "  It is pinned by `account_id` in wrangler.toml so no command can act against\n" +
        "  a different account than the one this repo deploys to.",
    )
  }
  return id
}

/**
 * The environment every Cloudflare child process gets, and nothing else.
 *
 * Exported for tests/unit/cloudflare-target.test.ts, which asserts what is
 * *absent* — the one property of this function that cannot be seen by reading a
 * call site.
 */
export function credentialEnv(): NodeJS.ProcessEnv {
  // Both discarded from the spread rather than overwritten. An empty
  // CLOUDFLARE_API_TOKEN means unset, and a child receiving "" would
  // authenticate differently from what this module decided.
  //
  // CLOUDFLARE_ENV is wrangler's variable equivalent of `--env`, so it retargets
  // any call that does not pass the flag — and production is exactly that call,
  // since `Target.flag` is undefined for the top-level config. No caller needs
  // it: every one states its target as an argument.
  const { CLOUDFLARE_API_TOKEN: _discarded, CLOUDFLARE_ENV: _ambient, ...rest } = process.env
  const t = token()
  return {
    ...rest,
    CLOUDFLARE_ACCOUNT_ID: accountId(),
    ...(t ? { CLOUDFLARE_API_TOKEN: t } : {}),
  }
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
  /**
   * A named target always says which environment, production included.
   *
   * `--env ""` is wrangler's own way of naming the top-level environment, and
   * what its "no target environment was specified" warning asks for. Omitting
   * the flag hands the decision to CLOUDFLARE_ENV instead.
   *
   * Only when a target was passed. `undefined` means a fully resolved config —
   * deploy's generated wrangler.json — where naming an environment is not
   * idempotent and once published `remy-sport-staging-staging`.
   */
  const environment = target ? ["--env", target.flag ?? ""] : []
  const full = ["x", "wrangler", ...args, ...environment]
  const out = opts.inherit ? "inherit" : "pipe"
  const env = credentialEnv()
  const proc = spawnSync("bun", full, {
    input: opts.stdin,
    stdio: [opts.stdin === undefined ? "ignore" : "pipe", out, out],
    env,
    // Node caps a captured stream at 1 MiB and kills the child past it. A
    // `d1 execute --json` over a seeded table is bigger than that.
    maxBuffer: 256 * 1024 * 1024,
  })
  return {
    // No status means it never ran or was killed; neither is success.
    code: proc.status ?? 1,
    out: proc.stdout?.toString() ?? "",
    err: (proc.stderr?.toString() ?? "") + (proc.error ? `${proc.error.message}\n` : ""),
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
