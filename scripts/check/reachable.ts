/**
 * Every page must be reachable without typing its address.
 *
 * ## Why this exists
 *
 * `/#/admin` was linked from nowhere. Not the sidebar, not the topbar, not any
 * page — so the account list, the role controls, approving a referee, deleting
 * a team, deleting a player and creating an account were all built, all
 * enforced, and findable only by somebody who already knew the URL. Two of
 * those controls were added the week this was written, into a screen with no
 * door.
 *
 * Nothing caught it, and nothing could have. The route existed, the page
 * rendered, its tests passed by visiting the hash directly, and
 * `check-actions` counted every action on it as answered — because a screen did
 * answer them. Whether a reader can *get* there is a different question, and
 * this is the file that asks it.
 *
 * ## What counts as a way in
 *
 * A `page: "x"` somewhere under src/web that is not the router or the render
 * map — that is, an actual navigation — or an entry in the sidebar. Both are
 * how a person arrives somewhere in this app.
 *
 * This does not check that the link is *visible* to the right reader; the admin
 * link is behind `useCan("MANAGE_ALL_USERS")` and should be. It checks that a
 * way in exists at all, which is the failure that actually happened.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Pages with no link, on purpose.
 *
 * Each one is a destination the app routes *to* rather than somewhere a person
 * chooses to go, so a link would be meaningless.
 */
const NO_LINK_NEEDED: Record<string, string> = {
  "not-found": "the fallback for an unknown hash — reached by getting somewhere else wrong",
}

const files: string[] = []
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.tsx?$/.test(name)) files.push(path)
  }
}
walk("src/web")

const router = readFileSync("src/web/lib/router.tsx", "utf8")
const pages = [
  ...(router.match(/export const PAGES = \[(.*?)\] as const/s)?.[1] ?? "").matchAll(/"([\w-]+)"/g),
].map((m) => m[1]!)

if (pages.length === 0) {
  console.error("check-reachable: could not read PAGES from src/web/lib/router.tsx")
  process.exit(1)
}

const sidebar = readFileSync("src/web/components/sidebar.tsx", "utf8")

/** Files that describe the route table rather than navigate within it. */
const NOT_A_LINK = new Set(["src/web/lib/router.tsx", "src/web/main.tsx"])

const problems: string[] = []
for (const page of pages) {
  if (page in NO_LINK_NEEDED) continue

  const inNav = new RegExp(`id: "${page}"`).test(sidebar)
  const linkedFrom = files.filter(
    (f) => !NOT_A_LINK.has(f) && new RegExp(`page: "${page}"`).test(readFileSync(f, "utf8")),
  )

  if (!inNav && linkedFrom.length === 0) {
    problems.push(
      `${page} is a route and nothing navigates to it — no sidebar entry and no ` +
        `\`page: "${page}"\` outside the router. It can only be reached by typing ` +
        `the address. Add a way in, or a NO_LINK_NEEDED entry saying why there is none.`,
    )
  }
}

for (const page of Object.keys(NO_LINK_NEEDED)) {
  if (!pages.includes(page)) {
    problems.push(`${page} is in NO_LINK_NEEDED and is not a route any more — delete the entry`)
  }
}

if (problems.length) {
  console.error(
    `check-reachable: ${problems.length} problem(s) across ${pages.length} routes:\n` +
      problems.map((p) => `  ${p}`).join("\n"),
  )
  process.exit(1)
}

console.log(
  `check-reachable: ${pages.length} routes, every one reachable by clicking ` +
    `(${Object.keys(NO_LINK_NEEDED).length} deliberately not linked)`,
)
