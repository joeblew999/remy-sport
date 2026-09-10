/**
 * Drilling in has a way back, and every screen does it the same way.
 *
 * The Product Owner, 2026-09-09: an organisation can be drilled into and backed
 * out of, and the other entry points cannot — decide it and make it consistent.
 * The audit that followed found three different habits across fifteen headers:
 *
 *   - Eleven screens passed their **own** name as a crumb, which is not a path,
 *     it is a label. Discover passed two — an unlinked "Home" and itself — a
 *     shape nothing else had.
 *   - `team.tsx` passed none at all. A team is reached from the directory, from
 *     a schedule and from a player, and every one of those was a one-way trip.
 *   - `event`, `org`, `player`, `game` and `video` already did the right thing:
 *     the ancestors, linked.
 *
 * The rule now, held here: **`crumbs` are the ancestors, each one linked, and
 * the page itself is the `h1` the site header draws at the end of the trail.**
 * A top-level screen has no ancestors and passes nothing.
 *
 * So an unlinked crumb is the failure this file names. It is either the page
 * naming itself — which the header already does — or a step back that cannot
 * be taken, which is worse than none: it looks like a way out and is not.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { rule } from "./helpers"

const PAGES = "src/web/pages"

/** The `{ … }` objects at the top level of one array literal. */
function objects(array: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = -1
  for (let i = 0; i < array.length; i++) {
    const c = array[i]
    if (c === "{") {
      if (depth === 0) start = i
      depth++
    } else if (c === "}") {
      depth--
      if (depth === 0 && start >= 0) {
        out.push(array.slice(start, i + 1))
        start = -1
      }
    }
  }
  return out
}

/** Every crumb literal a page builds, whether inline or through a variable. */
function crumbArrays(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/(?:crumbs=\{|const crumbs(?::[^=]+)? = )\[/g)) {
    const open = m.index! + m[0].length - 1
    let depth = 0
    for (let i = open; i < source.length; i++) {
      if (source[i] === "[") depth++
      else if (source[i] === "]") {
        depth--
        if (depth === 0) {
          out.push(source.slice(open, i + 1))
          break
        }
      }
    }
  }
  return out
}

const problems: string[] = []
for (const file of readdirSync(PAGES).filter(f => f.endsWith(".tsx"))) {
  const source = readFileSync(join(PAGES, file), "utf8")
  for (const array of crumbArrays(source)) {
    for (const object of objects(array)) {
      // A conditional spread carries its own object; both halves are checked
      // because `objects` walks the whole array text.
      if (!/\bhref\s*:/.test(object)) {
        problems.push(`${PAGES}/${file}: ${object.replace(/\s+/g, " ").slice(0, 72)}`)
      }
    }
  }
}

rule(
  "every breadcrumb is an ancestor you can click",
  problems,
  `check-nav: ${problems.length} crumb(s) with no href:\n  ${problems.join("\n  ")}\n\n` +
    `A crumb is a step back up, so it must be a link. A page does not name itself in\n` +
    `its own trail — the site header draws the page as the h1 at the end of it. A\n` +
    `top-level screen passes no crumbs at all.`,
  `check-nav: every crumb on ${readdirSync(PAGES).filter(f => f.endsWith(".tsx")).length} pages is a link`,
)

/**
 * Every route has a way out, and the type system is what says so.
 *
 * Installing removes the browser's Back. On iOS there is nothing behind it but
 * an undiscoverable edge swipe, and in the Tauri window there is nothing at
 * all — so on most surfaces this product ships to, the application is the only
 * thing that can offer a way back. A route added without one is not a cosmetic
 * gap; it is a reader who has to force-quit.
 *
 * `PARENT` in `src/web/components/back-control.tsx` is `Record<Page, …>` with no
 * `default` branch, so a new entry in `PAGES` is already a type error. This is
 * the same rule stated where a reader of the tests will meet it, and it fails
 * for the one case types cannot see: a page listed with a parent that is not
 * itself a page.
 *
 * docs/done/2026-09-09-10-installed-app-back-navigation.md.
 */
const backControl = readFileSync("src/web/components/back-control.tsx", "utf8")
const router = readFileSync("src/web/lib/router.tsx", "utf8")

const declaredPages = [...(router.match(/export const PAGES = \[([\s\S]*?)\] as const/)?.[1] ?? "")
  .matchAll(/"([\w-]+)"/g)].map(m => m[1]!)
const parentBlock = backControl.match(/const PARENT: Record<Page, Page \| null> = \{([\s\S]*?)\n\}/)?.[1] ?? ""
const parented = new Map(
  [...parentBlock.matchAll(/^\s*"?([\w-]+)"?:\s*(?:"([\w-]+)"|null)/gm)].map(m => [m[1]!, m[2] ?? null]),
)

const exitless = [
  ...declaredPages.filter(p => !parented.has(p)).map(p => `${p}: no exit declared in PARENT`),
  ...[...parented].filter(([, to]) => to !== null && !declaredPages.includes(to))
    .map(([from, to]) => `${from}: exits to "${to}", which is not a page`),
]

rule(
  "every route declares where Back goes",
  exitless,
  `check-nav: ${exitless.length} route(s) with no usable exit:\n  ${exitless.join("\n  ")}\n\n` +
    `Installing removes the browser's Back — on iOS entirely, and in the Tauri window\n` +
    `entirely. A route with no exit strands the reader with the sidebar or a force-quit.\n` +
    `Add it to PARENT in src/web/components/back-control.tsx.`,
  `check-nav: all ${declaredPages.length} routes declare where Back goes`,
)
