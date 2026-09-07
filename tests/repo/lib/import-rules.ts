import { edgesOf, parse, sources, type Edge } from "./ast"

/**
 * The dependency rules this repo has always had in its head.
 *
 * Written down because they were enforced by hoping. The Worker importing
 * `src/web` is the one that actually happened: sending the sign-in email from
 * the product's own messages meant importing the SPA, which typechecks only by
 * accident and inverts the layering. It was fixed by moving files, which fixes
 * that instance and prevents nothing.
 *
 * These were a dependency-cruiser config. The tool was the right call at the
 * time — five rules and the config was the whole implementation — and its price
 * turned out to be a TypeScript extractor built on the JavaScript compiler API
 * that TypeScript 7 does not ship. Five rules were half of what pinned the repo
 * to TypeScript 6. The rules are unchanged; the graph is now the imports and
 * re-exports oxc reports, resolved the way the bundler resolves them.
 */

export interface Violation {
  rule: string
  from: string
  to: string
  line: number
  why: string
}

/** Every local import and re-export in `src`, with the drizzle cycle noted. */
export function graphOf(files: readonly string[], overrides: Readonly<Record<string, string>> = {}): Edge[] {
  const virtual = new Set(Object.keys(overrides))
  return [...new Set([...files, ...virtual])].flatMap((path) => edgesOf(parse(path, overrides[path]), virtual))
}

interface Rule {
  name: string
  why: string
  /** True when this edge breaks the rule. */
  broken: (edge: Edge) => boolean
}

const RULES: Rule[] = [
  {
    name: "worker-must-not-import-spa",
    why:
      "The Worker is the server; src/web is a browser bundle. An import that way " +
      "round drags React and DOM types into the Worker's compile. Shared code " +
      "belongs outside both — src/domain for the model, src/paraglide for the " +
      "product's copy, which is exactly why the messages compile there now.",
    broken: (e) => !e.from.startsWith("src/web/") && e.to.startsWith("src/web/"),
  },
  {
    name: "spa-reaches-only-the-shared-roots",
    why:
      "The SPA's runtime reach is src/web, src/domain, src/paraglide and the " +
      "dependency-free src/moq-relay.ts protocol helper. It may still import TYPES from anywhere — `import type " +
      "{ Router }` is how the client is typed, and types erase. What it must not " +
      "do is import an implementation: that would pull drizzle, Better Auth and " +
      "the D1 bindings into the browser bundle. " +
      "An allowlist, where this was once a denylist of `src/(api|db|routes|mail)`. " +
      "A denylist can only forbid the directories that existed when it was " +
      "written, so a NEW top-level directory imported by the SPA passed it in " +
      "silence. Demonstrated end to end on 2026-09-02: a new src/newthing/ " +
      "imported from main.tsx, every gate green. A new shared root has to be " +
      "added here, deliberately.",
    broken: (e) =>
      e.from.startsWith("src/web/") &&
      !e.typeOnly &&
      e.to.startsWith("src/") &&
      !/^src\/(web|domain|paraglide)\//.test(e.to) && e.to !== "src/moq-relay.ts",
  },
  {
    name: "relay-protocol-helper-is-independent",
    why: "src/moq-relay.ts is shared by browser, Worker and setup scripts. It must not acquire runtime dependencies on application code.",
    broken: (e) => e.from === "src/moq-relay.ts" && !e.typeOnly,
  },
  {
    name: "screens-never-decide",
    why:
      "src/domain/grants.ts is the grant table applied: given the relations a " +
      "person holds, which actions are allowed. A screen receives the answers " +
      "(`row.can.MANAGE_ROSTER`) and must never hold the table — a component " +
      'that branched on "am I the head coach" would be a second copy of GRANTS, ' +
      "which is the drift the resolver exists to prevent. Types included: there " +
      "is nothing in that module a screen legitimately needs, and the row types " +
      "already carry `can` through src/domain/api.",
    broken: (e) => e.from.startsWith("src/web/") && e.to === "src/domain/grants.ts",
  },
  {
    name: "domain-is-the-root",
    why:
      "src/domain is the Product Owner's model and the schemas derived from it. " +
      "It is the bottom of the stack: if it reaches back up into the API, the " +
      "database or the SPA, the direction of the whole chain is inverted.",
    broken: (e) => e.from.startsWith("src/domain/") && /^src\/(api|routes|web|mail)\//.test(e.to),
  },
]

/**
 * The drizzle schema files reference each other's tables, and that is the
 * documented pattern rather than an accident: `references(() => org.id)` takes
 * a thunk *so that* two tables can point at one another. `team.org_id` and
 * `game.event_id` cross the app/fixtures split in opposite directions, and the
 * split is by ownership — ours versus the Product Owner's — which is a more
 * useful boundary than the reference graph. Nothing is read at module load, so
 * the cycle is inert.
 */
const CYCLE_EXEMPT = /^src\/db\/(app|fixtures)-schema\.ts$/

/**
 * Cycles, as the shortest loop through each one.
 *
 * A cycle means neither module can be understood without the other, and it
 * makes module initialisation order load-bearing. It found one the day it was
 * added: base.ts imported the relation resolver while relations.ts imported
 * `type Db` back out of base. TypeScript allowed it because a type import
 * erases, so nothing complained — `Db` lives in src/api/db.ts now.
 */
export function cyclesIn(edges: readonly Edge[]): string[][] {
  const out = new Map<string, string[]>()
  for (const [from, targets] of group(edges)) {
    if (CYCLE_EXEMPT.test(from)) continue
    // Depth-first from each module, looking for the way back to it. The first
    // path found is the shortest by construction of the queue below.
    const queue: string[][] = targets.map((t) => [from, t])
    const seen = new Set<string>([from])
    while (queue.length) {
      const path = queue.shift()!
      const head = path[path.length - 1]!
      if (head === from) {
        // Named by its members, sorted, so one cycle is reported once however
        // many of its modules the outer loop reaches it from.
        const key = [...path.slice(0, -1)].sort().join(" -> ")
        if (!out.has(key)) out.set(key, path)
        break
      }
      if (seen.has(head)) continue
      seen.add(head)
      for (const next of group(edges).get(head) ?? []) queue.push([...path, next])
    }
  }
  return [...out.values()]
}

let grouped: Map<string, string[]> | null = null
function group(edges: readonly Edge[]): Map<string, string[]> {
  if (grouped) return grouped
  grouped = new Map()
  for (const edge of edges) {
    const list = grouped.get(edge.from) ?? []
    list.push(edge.to)
    grouped.set(edge.from, list)
  }
  return grouped
}

export function importViolations(files: readonly string[] = sources("src"), overrides: Readonly<Record<string, string>> = {}): Violation[] {
  grouped = null
  const edges = graphOf(files, overrides)
  const found: Violation[] = []
  for (const rule of RULES) {
    for (const edge of edges) {
      if (rule.broken(edge)) {
        found.push({ rule: rule.name, from: edge.from, to: edge.to, line: edge.line, why: rule.why })
      }
    }
  }
  for (const cycle of cyclesIn(edges)) {
    found.push({
      rule: "no-circular",
      from: cycle[0]!,
      to: cycle.slice(1).join(" -> "),
      line: 0,
      why:
        "A cycle means neither module can be understood without the other, and it " +
        "makes module initialisation order load-bearing.",
    })
  }
  return found
}

export { RULES as IMPORT_RULES }
