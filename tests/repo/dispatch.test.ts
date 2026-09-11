import { readFileSync } from "node:fs"
import { DISPATCH } from "../../src/dispatch"
import { ROOT, parse, sources, walk, lineOf, type Node } from "./lib/ast"
import { rule } from "./helpers"

/**
 * There is no server-side router library, and every prefix is enumerable.
 *
 * Four rules. The first three are about `src/dispatch.ts` and the dispatch that
 * reads it; the last is the one that makes them true — no Hono anywhere in
 * `src`, so there is no second place a route can be mounted from.
 *
 * This replaces the second rule in tests/repo/authz.test.ts, which read Hono's
 * own route table off the exported app. That rule cannot survive Hono's
 * deletion: its subject disappears and it passes over an empty set. Delete it
 * only once every rule here is green.
 *
 * The runtime half — an undeclared path under /api/ answering oRPC's 404 rather
 * than a raw Response — is a worker-tier test, and lands with Part C. What is
 * checkable here is that nothing but DISPATCH can name a prefix at all.
 */

const INDEX = "src/index.ts"
const indexSource = readFileSync(`${ROOT}/${INDEX}`, "utf8")

// ── 1. Every entry carries a guard sentence ─────────────────────────────────

const unguarded = DISPATCH.filter((entry) => entry.guard.trim().length === 0).map(
  (entry) => `${entry.prefix} (${entry.owner}): guard is empty`,
)

rule(
  "every dispatch entry says how it is guarded",
  unguarded,
  `dispatch: ${unguarded.length} prefix(es) declare no guard\n\n` +
    unguarded.map((u) => `  ${u}`).join("\n") +
    "\n\nAdd a sentence to `guard` in src/dispatch.ts saying what authorises requests\n" +
    "there. `POST /api/seed` was an unauthenticated write for months because\n" +
    "nothing enumerated it — an entry without a guard is that, with extra steps.",
  `dispatch: ${DISPATCH.length} prefixes, each with a guard`,
)

// ── 2. Order is the dispatch, so a general prefix cannot shadow a specific ──

const shadowed: string[] = []
DISPATCH.forEach((entry, i) => {
  const earlier = DISPATCH.slice(0, i).find((before) => entry.prefix.startsWith(before.prefix))
  if (earlier) {
    shadowed.push(`${entry.prefix} is unreachable: "${earlier.prefix}" matches it first`)
  }
})

rule(
  "no dispatch prefix is shadowed by an earlier one",
  shadowed,
  `dispatch: ${shadowed.length} unreachable prefix(es)\n\n` +
    shadowed.map((s) => `  ${s}`).join("\n") +
    "\n\nDISPATCH is matched in order with startsWith, so the most specific prefix\n" +
    "must come first: /api/auth/ before /api.",
)

// ── 3. Dispatch reads DISPATCH, and nothing else names a prefix ──────────────

/**
 * A route-shaped literal anywhere in `src/index.ts`.
 *
 * The point of the table is that the fetch handler owns no prefix of its own.
 * A literal like "/api/versions" or "/openapi.json" here is a route nobody
 * enumerated — exactly what this file exists to prevent.
 */
const strays: string[] = []
{
  const parsed = parse(INDEX, indexSource)
  const declared = new Set<string>(DISPATCH.map((entry) => entry.prefix))
  walk(parsed.program, (node: Node) => {
    if (node.type !== "Literal") return
    const value = node.value
    if (typeof value !== "string") return
    if (!/^\/(api|rpc|openapi|doc)\b/.test(value)) return
    if (declared.has(value)) return
    strays.push(`${INDEX}:${lineOf(parsed, node)}  "${value}"`)
  })
}

const importsDispatch = /from\s+"\.\/dispatch"/.test(indexSource)

rule(
  "the fetch handler dispatches from DISPATCH and names no prefix of its own",
  [...(importsDispatch ? [] : [`${INDEX} does not import DISPATCH`]), ...strays],
  `dispatch: dispatch is not driven by src/dispatch.ts\n\n` +
    (importsDispatch ? "" : `  ${INDEX} does not import DISPATCH from "./dispatch"\n`) +
    strays.map((s) => `  ${s}`).join("\n") +
    "\n\nEach literal above is a route the dispatch table does not declare. Move it\n" +
    "into a procedure (its URL does not change) or add it to DISPATCH with a guard.",
)

// ── 4. No Hono in src ───────────────────────────────────────────────────────

const honoImports: string[] = []
for (const path of sources("src")) {
  const parsed = parse(path)
  walk(parsed.program, (node: Node) => {
    if (node.type !== "ImportDeclaration") return
    const specifier = (node.source as { value?: string } | null)?.value
    if (!specifier || !/^(hono|@hono\/)/.test(specifier)) return
    honoImports.push(`${path}:${lineOf(parsed, node)}  imports "${specifier}"`)
  })
}

rule(
  "hono is not importable anywhere in src",
  honoImports,
  `dispatch: ${honoImports.length} Hono import(s) remain in src\n\n` +
    honoImports.map((h) => `  ${h}`).join("\n") +
    "\n\nEvery endpoint is an oRPC procedure and src/index.ts is the only dispatch.\n" +
    "This list is the migration: each import is a file that still mounts routes of\n" +
    "its own. See docs/2026-09-11-01-unify-server-routing-orpc.md.",
  "dispatch: no Hono in src",
)
