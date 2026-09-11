/**
 * Which of the Product Owner's actions the product actually implements.
 *
 * Written because a gap this size stayed invisible: the model declared what an
 * organiser may do with a schedule, the API had no way to create a game, and
 * nothing connected the two. Found by reading the router by hand.
 *
 * Nothing here fails the build — most of these are unbuilt on purpose. What was
 * missing was a way to *see* it.
 *
 * Three honest buckets:
 *
 *   enforced   a procedure declares a policy naming it, or a notification
 *              consults it to decide who should hear
 *   public     every grant is PUBLIC, so there is nothing to enforce — a
 *              spectator reading a score needs no check, and counting these as
 *              "missing" would be a lie in the other direction
 *   missing    neither
 *
 * "Missing" is not the same as "wrong". It means the model promises something
 * the product cannot do yet, which is exactly the list worth looking at before
 * deciding what to build.
 *
 * ## The router is walked, not grepped
 *
 * Scanning for the literal `requireAction("X")` found one of four policy kinds,
 * so six built-and-shipped actions read as unbuilt — wrong in the direction
 * that invents work, in the report meant to say what to build next. `policyOf`
 * over the real router is what tests/repo/authz.test.ts already uses, so both
 * tools now answer "is this enforced" from one source.
 *
 * ## Enforcement is not the only way an action is implemented
 *
 * Three RECEIVE_*_NOTIFICATIONS actions are not permission checks at all:
 * `notify()` hands them to `audienceFor` to decide **who should hear**. Reading
 * a table directly instead of asking them is how Web Push once notified a
 * team's followers and not its own coaches.
 *
 * So the map is imported from src/api/push.ts rather than restated.
 */

import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { ACTION, GRANTS } from "../../src/domain/vocabularies.ts"
import { policyOf, type Policy } from "../../src/api/base.ts"
import { RECEIVE_ACTION } from "../../src/api/push.ts"
import { router } from "../../src/api/index.ts"

type Node = Record<string, unknown>

/**
 * Every action a procedure actually enforces.
 *
 * `action` (requireAction), `handler` (checkedInHandler — the handler calls
 * `can` itself because the action depends on the input) and `stricter` all
 * count: each is a check that runs.
 *
 * `open` does not. `openTo` declares that the model grants the action to PUBLIC
 * and the code agrees — there is nothing being enforced, and those belong in the
 * "public" bucket below, which exists to say exactly that. Counting them as
 * enforced moved nine actions out of a bucket that was describing them
 * correctly.
 *
 * `infrastructure` names no action at all: it is the escape hatch for health and
 * the vocabularies, which are not domain objects.
 */
const enforced = new Set<string>()

function collect(node: Node) {
  for (const value of Object.values(node)) {
    const internals = (value as Record<string, Node> | null)?.["~orpc"]
    if (internals?.handler) {
      const middlewares = (internals.middlewares ?? []) as unknown[]
      const policy = middlewares.map(policyOf).find((p): p is Policy => p !== null)
      if (!policy) continue
      if (policy.kind === "handler") for (const a of policy.actions) enforced.add(a)
      else if (policy.kind === "action" || policy.kind === "stricter") enforced.add(policy.action)
    } else if (value && typeof value === "object") {
      collect(value as Node)
    }
  }
}

collect(router as unknown as Node)

/**
 * And the actions consulted as an audience rather than enforced as a check.
 *
 * From push.ts's own map, so adding a fourth object type to notifications
 * cannot leave this report claiming the action behind it was never built.
 */
for (const action of Object.values(RECEIVE_ACTION)) enforced.add(action)

/**
 * Actions the product implements with no server surface at all.
 *
 * The third way an action gets built, and the one that made this report wrong
 * for a third time. `SPOILER_MODE` is shipped across six components — it hides
 * scores until a reader asks — and it has nothing to enforce, because there is
 * no resource: it is a display preference held in the browser. No procedure can
 * declare it and no audience consults it, so both this report and the Product
 * Owner's the Owner.s old `built` task called a working feature missing.
 *
 * Worth noting how that survived: the two repos derive this independently and
 * *agreed*. Agreement is not correctness when both share an assumption — here,
 * that a built action leaves a server-side trace.
 *
 * Listed rather than detected, because "we chose to do this in the client" is a
 * decision and not a pattern. The assertion below keeps the list from rotting:
 * an entry that gains a server marker is stale and says so.
 */
const CLIENT_ONLY: Record<string, string> = {
  SPOILER_MODE:
    "a display preference — the reader hides scores in their own browser. " +
    "src/web/main.tsx holds it and six components read it. There is no resource " +
    "to protect and nothing a server could check.",
}

for (const [action, why] of Object.entries(CLIENT_ONLY)) {
  if (enforced.has(action)) {
    console.error(
      `model-coverage: ${action} is listed as client-only but a procedure now declares it.\n` +
        `  Reason on file: ${why}\n` +
        `  Remove it from CLIENT_ONLY — it has a server surface now.`,
    )
    process.exit(1)
  }
}

const publicOnly = (code: string) => {
  const grants = (GRANTS as Record<string, ReadonlyArray<{ relation: string }>>)[code] ?? []
  return grants.length > 0 && grants.every((g) => g.relation === "PUBLIC")
}

const byCategory = new Map<string, { code: string; state: string }[]>()
for (const a of ACTION) {
  /**
   * The model is asked first, and the code second.
   *
   * An action granted only to PUBLIC has nothing to enforce whatever names it —
   * `VIEW_EVENT` is public and is also listed by `events.mine`'s
   * `checkedInHandler`. Asking the code first moved three such actions into
   * "enforced", which reads as coverage the model never asked for. This report
   * measures the model, so "public" wins.
   */
  const state = CLIENT_ONLY[a.code]
    ? "client"
    : publicOnly(a.code)
      ? "public"
      : enforced.has(a.code)
        ? "enforced"
        : "missing"
  const list = byCategory.get(a.category) ?? []
  list.push({ code: a.code, state })
  byCategory.set(a.category, list)
}

const MARK: Record<string, string> = { enforced: "✓", public: "·", client: "◗", missing: " " }
let enforcedN = 0
let publicN = 0
let clientN = 0
let missingN = 0

for (const [category, actions] of [...byCategory].sort()) {
  const done = actions.filter((a) => a.state !== "missing").length
  console.log(`\n  ${category}  ${done}/${actions.length}`)
  for (const a of actions.sort((x, y) => x.code.localeCompare(y.code))) {
    console.log(`    ${MARK[a.state]} ${a.code}`)
    if (a.state === "enforced") enforcedN++
    else if (a.state === "public") publicN++
    else if (a.state === "client") clientN++
    else missingN++
  }
}

console.log(
  `\n  ${enforcedN} enforced · ${publicN} public (nothing to enforce) · ` +
    `${clientN} client-only · ${missingN} not built` +
    `\n  ${ACTION.length} actions in the Product Owner's model.\n` +
    `\n  "not built" is not "wrong" — most are on the roadmap. It is the list to\n` +
    `  read before choosing what to build, and the one nothing used to show.\n`,
)


/**
 * And the layer above: which procedures the GUI actually calls.
 *
 * The same blind spot one step up. Building an endpoint feels like finishing —
 * there are tests, it returns the right thing, the OpenAPI document lists it —
 * and a procedure nothing calls is a feature nobody has. On the day this was
 * written, every write built that day was in the right-hand column.
 *
 * A procedure can be legitimately unreachable: `games.get` is there for a deep
 * link that does not exist yet, and the generic domain reads back the fixtures
 * for tools rather than for a page. So this is a list to read, not a rule.
 */
const WEB = resolve(import.meta.dirname, "../../src/web")
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "paraglide") return []
    const full = join(dir, e.name)
    return e.isDirectory() ? walk(full) : /\.tsx?$/.test(e.name) ? [full] : []
  })
const web = walk(WEB).map((f) => readFileSync(f, "utf8")).join("")

/** The HTTP method a procedure declares, which is how a read is told from a write. */
const methodOf = (node: unknown): string =>
  ((node as Record<string, Record<string, Record<string, string>>> | null)?.["~orpc"]?.route
    ?.method ?? "GET")

const procedures: { path: string; method: string }[] = []
for (const [group, value] of Object.entries(router)) {
  if (typeof value === "object" && value && !("~orpc" in value)) {
    for (const [name, proc] of Object.entries(value)) {
      procedures.push({ path: `${group}.${name}`, method: methodOf(proc) })
    }
  } else {
    procedures.push({ path: group, method: methodOf(value) })
  }
}

const called = (p: string) => new RegExp(`\\b(api|orpc)\\.${p}\\b`).test(web)
const unreachable = procedures.filter((p) => !called(p.path))
const reachableN = procedures.length - unreachable.length

/**
 * A write nobody calls is the serious case, so the report separates them rather
 * than leaving a reader to check each one by hand — which is what its own
 * closing note used to ask for.
 */
const isWrite = (m: string) => m !== "GET"
const strandedWrites = unreachable.filter((p) => isWrite(p.method))

console.log(`  ── The GUI ──\n`)
console.log(`  ${reachableN} of ${procedures.length} procedures are called from src/web.`)
if (unreachable.length) {
  console.log(`\n  Not reachable from any page:`)
  for (const p of unreachable.sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`      ${isWrite(p.method) ? "!" : " "} ${p.method.padEnd(6)} ${p.path}`)
  }
}
console.log(
  strandedWrites.length
    ? `\n  ${strandedWrites.length} of those are WRITES, marked "!". Somebody can only do that\n` +
        `  with curl, which means nobody does it. Reads can be deliberate — the\n` +
        `  generic domain endpoints exist for tooling — but a stranded write is a\n` +
        `  feature that was built and never connected.\n`
    : `\n  All of them are reads, and reads can be deliberate: the generic domain\n` +
        `  endpoints exist for tooling rather than for a page. No write is stranded,\n` +
        `  which is the case that would mean a feature nobody can reach.\n`,
)
