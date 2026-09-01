/**
 * How long an endpoint takes, measured rather than guessed.
 *
 * This exists because of one hour that should have been two minutes. An
 * endpoint was slow, nothing in the repo measured latency, and the gap was
 * filled with assertion: a cause was named without evidence, one call was
 * removed for a 4% gain, a single bad experiment was run, and a *correct*
 * diagnosis was retracted on its strength. The settling test — stub the
 * suspect, time it again — took two minutes and gave 0.23s → 0.01s.
 *
 * The tool that would have made that the first move rather than the last did
 * not exist. `mise run probe` is the equivalent for types ("write a file,
 * typecheck it, delete it") and is cited all over this repo as the reason
 * several wrong beliefs died quickly. This is that, for time.
 *
 *   mise run time /api/games?eventId=evt_002
 *   mise run time /api/health 50
 *
 * ## Why the first request is dropped
 *
 * The Worker compiles on the first hit and the D1 connection is cold, so run
 * one is routinely 5-10× the rest. Including it makes the median depend on how
 * many runs you asked for, which is the opposite of a measurement. It is
 * reported separately, because "first 340ms, then 12ms" is itself a finding —
 * it means the cost is startup and not the query.
 *
 * ## Why median and p95, not mean
 *
 * One GC pause moves a mean and tells you nothing. The median is what a request
 * costs; the spread between it and p95 is whether that number can be trusted.
 */

const args = process.argv.slice(2)

/**
 * A path against the dev server, or a whole URL against anything.
 *
 * The URL form is not a convenience. mise sets `DEV_URL` in its own `[env]`,
 * which beats an exported one — so `DEV_URL=https://... mise run time /api/health`
 * silently measured localhost and reported the tunnel at 2.2ms. It is under
 * 100ms, and the README had been claiming 1.4s. Three numbers, no two agreeing,
 * from a tool whose entire job is to settle that kind of question.
 *
 *   mise run time /api/health
 *   mise run time https://dev-remy.ubuntusoftware.net/api/health
 */
const target = args.find((a) => a.startsWith("/") || a.startsWith("http"))
const runs = Number(args.find((a) => /^\d+$/.test(a)) ?? 10)

if (!target) {
  console.error("usage: mise run time <path|url> [runs]   e.g. mise run time /api/health 20")
  process.exit(2)
}

const BASE = process.env.DEV_URL ?? "http://127.0.0.1:8787"
const path = target

/**
 * A cookie, when the endpoint needs one.
 *
 * Most interesting endpoints are behind a session, and the slow ones especially
 * — authorisation is what makes them slow. Rather than reimplement sign-in
 * here, take the header from the environment:
 *
 *   COOKIE="$(cat .session)" mise run time /api/events
 *
 * Without it an authenticated route answers 401 in a millisecond and the report
 * says a slow endpoint is fast, which is why a non-2xx is called out below
 * rather than quietly averaged in.
 */
const headers: Record<string, string> = process.env.COOKIE
  ? { cookie: process.env.COOKIE }
  : {}

// An absolute URL is used as given; a path hangs off the dev server.
const url = path.startsWith("http") ? path : `${BASE}${path}`
const ms: number[] = []
const statuses = new Map<number, number>()
let bytes = 0
let warmup = 0

for (let i = 0; i <= runs; i++) {
  const started = performance.now()
  let status = 0
  try {
    const res = await fetch(url, { headers })
    status = res.status
    // Drained, not discarded: a response you never read is timed to the headers
    // and not to the body, which is where a slow endpoint spends its time.
    bytes = (await res.arrayBuffer()).byteLength
  } catch (err) {
    console.error(`\n  ${url}\n  unreachable: ${(err as Error).message}`)
    console.error(`  is the dev server up? \`mise run dev\``)
    process.exit(1)
  }
  const took = performance.now() - started
  statuses.set(status, (statuses.get(status) ?? 0) + 1)
  // Run 0 is the warm-up. Recorded in `statuses` — a 401 on the first request
  // is a 401 on all of them — but kept out of the numbers.
  if (i === 0) warmup = took
  else ms.push(took)
}

const sorted = [...ms].sort((a, b) => a - b)
const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!
const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1)).padStart(6)

const codes = [...statuses.entries()].map(([s, n]) => `${s}×${n}`).join(" ")
const ok = [...statuses.keys()].every((s) => s >= 200 && s < 300)

console.log(`\n  ${path}   ${runs} runs after one warm-up   ${(bytes / 1024).toFixed(1)} KB`)
console.log(`  min ${fmt(sorted[0]!)} ms`)
console.log(`  p50 ${fmt(at(0.5))} ms`)
console.log(`  p95 ${fmt(at(0.95))} ms`)
console.log(`  max ${fmt(sorted[sorted.length - 1]!)} ms`)

// The warm-up, beside the median it was excluded from. A large gap means the
// cost is cold start; no gap means the endpoint is simply this slow.
const ratio = warmup / at(0.5)
console.log(
  `\n  warm-up ${warmup.toFixed(0)} ms — ${
    ratio > 3 ? `${ratio.toFixed(0)}× the median, so most of it is cold start` : "in line with the rest"
  }`,
)
console.log(`  status ${codes}`)
if (!ok) {
  console.log(`  ⚠ not every response was 2xx — a refusal is fast and proves nothing.`)
  console.log(`    for a route behind a session: COOKIE="..." mise run time ${path}`)
}
