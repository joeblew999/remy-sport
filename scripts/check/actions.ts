/**
 * Every action the model grants must have a screen, or a written reason.
 *
 * ## Why this exists
 *
 * "The GUI covers 48 of the 76 actions" was true, useful, and produced by a
 * person reading code and judging — twice, weeks apart, by re-deriving the whole
 * thing from scratch. Nobody else could check it, and the number went stale the
 * moment the Product Owner added a grant. `docs/plan-missing-product.md` names
 * this file as its own successor for exactly that reason.
 *
 * `ops coverage gui` already measures whether the SPA *calls* each procedure and
 * *names* each output field. That is a different question and it cannot answer
 * this one: the court board answers three actions through `games.list`, and the
 * sign-up screen answers five while deriving them from `GRANTS` — so neither
 * ever writes the action's name, and a grep for the codes reports 37 actions
 * missing that are demonstrably built.
 *
 * ## How a screen says so
 *
 * A JSDoc tag next to the component:
 *
 *     /** @answers VIEW_COURT_STATUS_BOARD, VIEW_COURT_ASSIGNMENTS *\/
 *
 * A comment rather than code, because the alternative is a runtime export that
 * does nothing, ships in the bundle, and that `knip` then reports as unused. It
 * lives beside the screen so it moves with it and is deleted with it — a central
 * map would keep claiming a screen that no longer exists.
 *
 * A comment can lie, and this does not stop it. What it stops is the thing that
 * actually happened: the model growing a grant that no screen renders, and
 * nobody noticing for weeks.
 *
 * ## The two ways an action can have no screen
 *
 * **`BLOCKED`** — the model does not carry what a screen would need. There is no
 * bracket table, nothing records what a player did, no listing has a moderation
 * state. Each entry names the model change it waits on.
 *
 * **`NOT_BUILT`** — buildable today, and nobody has. No model change, no
 * decision needed, only somebody to do it.
 *
 * Two lists rather than one, because collapsing them lets "we cannot" hide work
 * that is really "we have not" — and that difference is the honest half of a
 * coverage number. Deleting a reason to make this pass is visible in review,
 * which is the point; the same shape as `check-authz`'s escape hatches, which
 * also carry their justification in the string.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { ACTION, GRANTS } from "../../src/domain/vocabularies"

/**
 * Actions with no screen, and the model change each one waits on.
 *
 * Written by hand on purpose: every entry is a decision that the product does
 * not do something, and a decision belongs in a place a reviewer sees. The
 * reasons are the ones recorded in docs/plan-missing-product.md, which measured
 * each against the schema rather than assuming.
 */
const BLOCKED: Record<string, string> = {
  VIEW_BRACKET: "no bracket table — a knockout draw is structure the schema does not have",
  GENERATE_BRACKETS: "no bracket table",
  AI_BRACKET_SUGGESTIONS: "no bracket table, and no decision that the AI actions are real",
  VIEW_PLAYER_STATS: "scores are per team (homeScore, awayScore); nothing records what a player did",
  AI_CREATE_EVENT: "nothing behind it — the profile page's own note records the button that did nothing",
  AI_QA: "nothing behind it",
  VIEW_RANKINGS_HISTORY:
    "PLATFORM-scoped: rankings across events over time. Standings are per event and division, " +
    "so there is no cross-event ranking to have a history of",
  MODERATE_LISTINGS:
    "no listing entity, no event status vocabulary, and no moderation state on any table — " +
    "building it means inventing both the noun and the verb",
}

/**
 * Granted, buildable today, and nobody has built it.
 *
 * A different thing from `BLOCKED`, and worth keeping separate: these need no
 * model change and no decision from the Product Owner — only somebody to do
 * them. Collapsing the two lists would let "we cannot" hide work that is really
 * "we have not", which is the honest half of a coverage number.
 */
const NOT_BUILT: Record<string, string> = {
  BROWSE_TEAMS:
    "there is no teams directory. `teams.list` exists and only the admin console reads it; " +
    "Discover browses events only",
  CREATE_USER_ACCOUNT:
    "sign-up is self-serve, so nobody has needed an admin to make an account for someone else",
}

/** Every `@answers` tag under src/web, and the file that carries it. */
function declared(): Map<string, string[]> {
  const found = new Map<string, string[]>()

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      if (!/\.tsx?$/.test(name)) continue
      const src = readFileSync(path, "utf8")
      // One tag, one line: `@answers CODE, CODE, CODE`. Anything after a
      // closing `*/` on the same line is not swallowed.
      for (const [, list] of src.matchAll(/@answers\s+([A-Z0-9_,\s]+?)(?:\*\/|\n)/g)) {
        for (const code of list.split(/[,\s]+/).filter(Boolean)) {
          found.set(code, [...(found.get(code) ?? []), path])
        }
      }
    }
  }

  walk("src/web")
  return found
}

const answers = declared()
const granted = ACTION.filter((a) => a.code in GRANTS).map((a) => a.code)
const problems: string[] = []

for (const [code, files] of answers) {
  if (!granted.includes(code)) {
    problems.push(
      `${files[0]} declares @answers ${code}, which the model does not grant — ` +
        `a screen claiming an action that was renamed or removed upstream`,
    )
  }
  for (const [list, name] of [
    [BLOCKED, "BLOCKED"],
    [NOT_BUILT, "NOT_BUILT"],
  ] as const) {
    if (code in list) {
      problems.push(
        `${code} is listed in ${name} and ${files[0]} says it answers it — ` +
          `if it is built, delete the ${name} entry`,
      )
    }
  }
}

const unaccounted = granted.filter(
  (code) => !answers.has(code) && !(code in BLOCKED) && !(code in NOT_BUILT),
)
for (const code of unaccounted) {
  const grants = GRANTS[code as keyof typeof GRANTS] as readonly { relation: string }[]
  const who = [...new Set(grants.map((g) => g.relation))].join(", ")
  problems.push(
    `${code} is granted to ${who} and no screen answers it — ` +
      `add an @answers tag to the screen that does, a NOT_BUILT entry if it is buildable ` +
      `and nobody has, or a BLOCKED entry naming the model change it waits on`,
  )
}

for (const [list, name] of [
  [BLOCKED, "BLOCKED"],
  [NOT_BUILT, "NOT_BUILT"],
] as const) {
  for (const code of Object.keys(list)) {
    if (!granted.includes(code)) {
      problems.push(`${code} is in ${name} and the model no longer grants it — delete the entry`)
    }
  }
}

if (problems.length) {
  console.error(
    `check-actions: ${problems.length} problem(s) across ${granted.length} granted actions:\n` +
      problems.map((p) => `  ${p}`).join("\n"),
  )
  process.exit(1)
}

console.log(
  `check-actions: ${granted.length} actions granted, ${answers.size} answered by a screen, ` +
    `${Object.keys(NOT_BUILT).length} buildable and unbuilt, ` +
    `${Object.keys(BLOCKED).length} at the model boundary`,
)
