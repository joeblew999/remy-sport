/**
 * Read the telemetry back: what is failing, where, how often.
 *
 * Writing events is half a system. Analytics Engine has no dashboard of its own
 * — the data is reachable only over a SQL API — so without this the whole thing
 * is a write-only pipe that feels like observability and provides none.
 *
 * ## Nothing here knows a column number
 *
 * Every query is generated from `EVENTS` in src/analytics.ts, through the same
 * `blobColumn`/`doubleColumn` the writer uses. That is the point of this file
 * rather than tidiness: the first version hand-wrote `blob3 AS route`, was wrong
 * by one column against a writer that had shifted, and nothing caught it —
 * because a shifted string is still a string. Two halves reading one
 * declaration cannot disagree; two halves that each know the layout will.
 *
 * Adding an event to the catalogue adds its report here. There is no list to
 * keep in step.
 *
 * ## Local first, deployment second
 *
 * `wrangler dev` binds Analytics Engine and discards every write, so a dev
 * server's telemetry lives in an in-memory ring served at `/api/dev/events`.
 * This prefers it when a dev server is up, because that is the loop worth
 * having, and falls back to the real dataset over the SQL API.
 *
 * The SQL API needs an account API token with **Account Analytics: Read** — the
 * wrangler OAuth token has no analytics scope at all. Same convention as
 * `cf:audit`: `$CLOUDFLARE_API_TOKEN`, or fnox.
 */

import { accountId, token } from "../lib/cloudflare.ts"

import {
  EVENTS,
  blobColumn,
  doubleColumn,
  fixedColumn,
  type EventName,
  type EventSpec,
} from "../../src/analytics.ts"

// Through the boundary, so this consults fnox itself rather than needing its
// mise task to have exported one first — which is what the shell block there
// was for, and why it can now go. It was the last copy of that rule.
const ACCOUNT = accountId()
const TOKEN = token()
const DATASET = "remy_sport_events"
/**
 * Which environment to report on. `bun run ops analytics --env staging`.
 *
 * Defaults to production because that is the one somebody is usually asking
 * about, and because an unfiltered report now mixes three deployments into one
 * table — staging's traffic is one person exercising a feature, and averaging
 * it with production's would make both numbers describe nothing.
 */
const ENVIRONMENT =
  process.argv.find((a) => a.startsWith("--env="))?.slice(6) ??
  (process.argv.includes("--all-environments") ? "" : "production")
const DEV = process.env.DEV_URL ?? "http://127.0.0.1:8787"

/** How far back, in hours. `bun run ops analytics 168` for a week. */
const HOURS = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 24)
/** `--remote` reads the deployment even when a dev server is up. */
const FORCE_REMOTE = process.argv.includes("--remote")

type Row = Record<string, string | number>

/** What each report is for, in words. Optional — the structure is derived. */
const NOTES: Partial<Record<EventName, string>> = {
  "api.refused": "The system saying no. A spike on one route is an authz bug, or someone probing.",
  "api.threw": "Our bugs. Every line here is code that is wrong — this should be empty.",
  "api.served":
    "What is slow. p50_ms is honest as it stands; multiply n by p50_rate for a true count, " +
    "since a deployment records one success in ten. `bun run ops time <path>` measures one route on demand.",
  "push.sent": "Apple, FCM and Mozilla each enforce the RFCs differently. A host at 0% is the failure.",
  "broadcast.started": "Cameras switched on.",
  "broadcast.ended": "...and off, with how long they lasted. A short median is the gym uplink.",
  "moq.session": "Video. A `websocket` transport is a browser without WebTransport.",
}

/** The headings a report shows, derived from what the event declares. */
function columnsFor(spec: EventSpec): string[] {
  return [...spec.dimensions, "n", ...spec.doubles.map((d) => `p50_${d}`)]
}

// ── the deployment: one SQL query per event ────────────────────────────────

async function sql(query: string): Promise<Row[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/plain" },
      body: query,
    },
  )
  const text = await res.text()
  // A bad query is a 400 with the reason in the body, and the reason is the only
  // useful part — a bare status sends you looking at the token when the problem
  // is a column name.
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`)
  if (!text.trim()) return []
  return (JSON.parse(text) as { data?: Row[] }).data ?? []
}

/**
 * The query for one event, built from its declaration.
 *
 * `sum(_sample_interval)` rather than `count()`: Analytics Engine samples at
 * high volume and hands back the weight it applied. Counting rows would
 * under-report exactly the events that became frequent enough to matter.
 */
function queryFor(event: EventName, spec: EventSpec, since: string): string {
  const dims = spec.dimensions.map((d) => `${blobColumn(spec.blobs.indexOf(d))} AS ${d}`)
  const stats = spec.doubles.map(
    (d, i) => `round(quantileWeighted(0.5)(${doubleColumn(i)}, _sample_interval)) AS p50_${d}`,
  )
  const select = [...dims, "sum(_sample_interval) AS n", ...stats].join(", ")
  const group = spec.dimensions.length > 0 ? `GROUP BY ${spec.dimensions.join(", ")}` : ""
  // The environment filter this file's `--env` promised and never applied:
  // ENVIRONMENT was computed and read by nothing, so every report mixed three
  // deployments into one table. Empty means --all-environments.
  const env = ENVIRONMENT ? ` AND ${fixedColumn("environment")} = '${ENVIRONMENT}'` : ""
  return `SELECT ${select} FROM ${DATASET}
          WHERE timestamp > ${since} AND ${fixedColumn("event")} = '${event}'${env}
          ${group} ORDER BY n DESC LIMIT 25`
}

// ── the dev server: the same aggregation, over the in-memory ring ──────────

interface Recorded {
  event: EventName
  country: string
  at: string
  fields: Record<string, string | number>
}

async function fromDev(): Promise<{ since: string; events: Recorded[] } | null> {
  try {
    const res = await fetch(`${DEV}/api/dev/events`, { signal: AbortSignal.timeout(1500) })
    // 404 is the deployed shape: a deployment keeps nothing in memory, so the
    // endpoint that serves it does not exist there.
    if (!res.ok) return null
    return (await res.json()) as { since: string; events: Recorded[] }
  } catch {
    // No dev server. Not an error: the deployment is the other half of this.
    return null
  }
}

/** "4m ago", so how much history is behind a report is legible at a glance. */
function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 90) return `${s}s`
  if (s < 5400) return `${Math.round(s / 60)}m`
  return `${Math.round(s / 3600)}h`
}

/**
 * Group, count and take a median — the same shape the SQL produces.
 *
 * Deliberately separate logic rather than a shared query language, because the
 * two backends have nothing in common but the catalogue. What is shared is the
 * part that matters: which fields are dimensions, and which columns they live
 * in. The rest is thirty lines.
 */
function aggregate(spec: EventSpec, rows: Recorded[]): Row[] {
  const groups = new Map<string, Recorded[]>()
  for (const r of rows) {
    const key = spec.dimensions.map((d) => String(r.fields[d] ?? "")).join("\0")
    const bucket = groups.get(key)
    if (bucket) bucket.push(r)
    else groups.set(key, [r])
  }

  const median = (xs: number[]) => {
    if (xs.length === 0) return 0
    const s = [...xs].sort((a, b) => a - b)
    return Math.round(s[Math.floor(s.length / 2)]!)
  }

  return [...groups.values()]
    .map((bucket) => {
      const out: Row = {}
      for (const d of spec.dimensions) out[d] = String(bucket[0]!.fields[d] ?? "")
      out.n = bucket.length
      for (const d of spec.doubles) {
        out[`p50_${d}`] = median(bucket.map((r) => Number(r.fields[d] ?? 0)))
      }
      return out
    })
    .sort((a, b) => Number(b.n) - Number(a.n))
}

// ── output ────────────────────────────────────────────────────────────────

/** A plain aligned table. No dependency, and it pastes into an issue unchanged. */
function table(columns: string[], rows: Row[]): string {
  const cells = rows.map((r) => columns.map((c) => String(r[c] ?? "")))
  const width = columns.map((c, i) => Math.max(c.length, ...cells.map((r) => r[i]!.length)))
  const line = (parts: string[]) => parts.map((p, i) => p.padEnd(width[i]!)).join("  ").trimEnd()
  return [line(columns), line(width.map((w) => "─".repeat(w))), ...cells.map(line)].join("\n")
}

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`

const local = FORCE_REMOTE ? null : await fromDev()

if (!local && (!ACCOUNT || !TOKEN)) {
  console.error(
    `No dev server at ${DEV}, and no credentials for the deployment.\n` +
      "Start one with `bun run dev`, or set CLOUDFLARE_ACCOUNT_ID and a\n" +
      "CLOUDFLARE_API_TOKEN with Account Analytics: Read.",
  )
  process.exit(1)
}

console.log(
  `\nremy-sport telemetry · ${
    local ? `dev server · collecting for ${ago(local.since)}` : `${DATASET} · last ${HOURS}h`
  }`,
)

const since = `toDateTime('${new Date(Date.now() - HOURS * 3600_000)
  .toISOString()
  .replace(/\.\d+Z$/, "")}')`

let total = 0
for (const [name, spec] of Object.entries(EVENTS) as [EventName, EventSpec][]) {
  const note = NOTES[name]
  console.log(`\n${bold(name)}${note ? `\n${dim(note)}` : ""}`)
  try {
    const rows = local
      ? aggregate(spec, local.events.filter((r) => r.event === name))
      : // An aggregate with no GROUP BY returns one row of zeroes rather than
        // no rows at all, which reads as "0 broadcasts" where the truth is
        // "none recorded" — a distinction that matters when you are checking
        // whether the pipe works.
        (await sql(queryFor(name, spec, since))).filter((r) => Number(r.n) > 0)
    if (rows.length === 0) {
      console.log(dim("  (nothing)"))
      continue
    }
    total += rows.reduce((sum, r) => sum + Number(r.n ?? 0), 0)
    console.log(table(columnsFor(spec), rows).replace(/^/gm, "  "))
  } catch (err) {
    // One failing report must not hide the others. A dataset never written to
    // reports as a missing table, which is itself information.
    console.log(`  \x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m`)
  }
}

if (total === 0) {
  console.log(
    dim(
      local
        ? "\nNothing recorded yet. The ring fills as the dev server handles requests —\n" +
            "use the app, then run this again."
        : "\nNo rows. Either nothing has happened, or the dataset has never been written\n" +
            "to — Analytics Engine creates it on first write, and `wrangler dev` does not.",
    ),
  )
}
console.log()

// ── what Cloudflare thinks of how it runs ──────────────────────────────────

/**
 * The other half of the question, and the half our own telemetry cannot answer.
 *
 * Everything above is what the *application* recorded: an invalid code, a
 * client error, a reminder that ran. None of it exists if the Worker never got
 * far enough to write it. A handler killed for exceeding CPU writes nothing at
 * all, and reads here as silence — which is indistinguishable from a quiet hour.
 *
 * `workersInvocationsAdaptive` is the platform's own view: how long each
 * invocation took, how many subrequests it made, and — the column worth the
 * whole query — its `status`. `exceededResources` means Cloudflare stopped the
 * code; `scriptThrewException` means it threw; `clientDisconnected` means the
 * reader left first, which for a long request usually means they gave up.
 *
 * Found on 2026-09-10, the first time this was run: a sibling Worker with two
 * requests at **thirty seconds of CPU** — the limit itself — and one uncaught
 * exception. Nothing in that project's own telemetry showed either, because
 * neither request lived long enough to record anything.
 *
 * This uses the GraphQL analytics API and the token already needed for the SQL
 * above: **Account Analytics: Read** covers both. The newer Workers
 * Observability *logs* API is a different scope and answers 403 with this
 * token — worth knowing before somebody spends an afternoon on it.
 */
const CPU_LIMIT_US = 30_000_000

async function runtime(): Promise<void> {
  const since = new Date(Date.now() - HOURS * 3600 * 1000).toISOString()
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      query: `query($acc:String!,$since:Time!){viewer{accounts(filter:{accountTag:$acc}){
        workersInvocationsAdaptive(limit:100, filter:{datetime_geq:$since}){
          sum{requests errors subrequests}
          quantiles{cpuTimeP50 cpuTimeP99 wallTimeP99}
          dimensions{scriptName status}
        }}}}`,
      variables: { acc: ACCOUNT, since },
    }),
  })
  const body = (await res.json()) as {
    errors?: { message: string }[]
    data?: { viewer?: { accounts?: { workersInvocationsAdaptive?: RuntimeRow[] }[] } }
  }
  if (body.errors?.length) {
    // The reason, not the status: a scope problem and a bad query look the same
    // from the outside and are fixed in completely different places.
    console.error(`\nruntime: ${body.errors.map((e) => e.message).join("; ").slice(0, 300)}`)
    return
  }

  const rows = body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? []
  /**
   * This repository's Workers by default, every Worker in the account with
   * `--all`.
   *
   * The narrow default is right for a report headed "remy-sport telemetry".
   * The flag exists because the first run of this query found the problem in a
   * *sibling* project — two requests at the CPU limit — and a filter that hides
   * the neighbour's fire is a filter worth being able to turn off.
   */
  const all = process.argv.includes("--all")
  const ours = all ? rows : rows.filter((r) => r.dimensions.scriptName.startsWith("remy-"))
  if (!ours.length) {
    console.log(dim("\nNo invocations recorded for remy-* in this window."))
    return
  }

  console.log(`\n${bold("runtime")}  ${dim(`what Cloudflare saw · last ${HOURS}h`)}`)
  const summary = ours
    .sort((a, b) => b.sum.requests - a.sum.requests)
    .map((r) => ({
      worker: r.dimensions.scriptName,
      status: r.dimensions.status,
      requests: r.sum.requests,
      errors: r.sum.errors,
      subreq: r.sum.subrequests,
      cpu_p50_ms: (r.quantiles.cpuTimeP50 / 1000).toFixed(1),
      cpu_p99_ms: (r.quantiles.cpuTimeP99 / 1000).toFixed(1),
    }))
  console.log(
    summary.length
      ? table(["worker", "status", "requests", "errors", "subreq", "cpu_p50_ms", "cpu_p99_ms"], summary as unknown as Row[])
      : dim("  (nothing)"),
  )

  // The two that are never acceptable, said plainly rather than left in a row.
  const killed = ours.filter((r) => r.dimensions.status === "exceededResources")
  const threw = ours.filter((r) => r.dimensions.status === "scriptThrewException")
  const near = ours.filter((r) => r.quantiles.cpuTimeP99 > CPU_LIMIT_US / 2 && r.dimensions.status === "success")
  for (const r of killed) {
    console.log(`  ${bold("!")} ${r.dimensions.scriptName}: ${r.sum.requests} request(s) stopped for exceeding CPU. Cloudflare killed the code; it recorded nothing itself.`)
  }
  for (const r of threw) {
    console.log(`  ${bold("!")} ${r.dimensions.scriptName}: ${r.sum.errors} uncaught exception(s).`)
  }
  for (const r of near) {
    console.log(`  ${bold("~")} ${r.dimensions.scriptName}: p99 CPU is ${(r.quantiles.cpuTimeP99 / 1000).toFixed(0)}ms, over half the 30s limit.`)
  }
}

interface RuntimeRow {
  sum: { requests: number; errors: number; subrequests: number }
  quantiles: { cpuTimeP50: number; cpuTimeP99: number; wallTimeP99: number }
  dimensions: { scriptName: string; status: string }
}

if (process.argv.includes("--runtime")) {
  if (!ACCOUNT || !TOKEN) {
    console.error("\nruntime needs CLOUDFLARE_ACCOUNT_ID and a token with Account Analytics: Read.")
  } else {
    await runtime()
  }
  console.log()
}
