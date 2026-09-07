/**
 * Every action the model grants must have a screen, or a written reason.
 *
 * ## Why this exists
 *
 * "The GUI covers 48 of the 76 actions" was true, useful, and produced by a
 * person reading code and judging — twice, weeks apart, by re-deriving the whole
 * thing from scratch. Nobody else could check it, and the number went stale the
 * moment the Product Owner added a grant. This file is what replaced the
 * judgement, for exactly that reason.
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
import { BLOCKED, NOT_BUILT, declared } from "./lib/action-coverage"
import { ACTION, GRANTS } from "../../src/domain/vocabularies"
import { rule } from "./helpers"

/**
 * Actions with no screen, and the model change each one waits on.
 *
 * Written by hand on purpose: every entry is a decision that the product does
 * not do something, and a decision belongs in a place a reviewer sees. Each
 * reason was measured against the schema rather than assumed: the table or
 * column a screen would need was looked for, and is not there.
 */
const answers = declared()
const granted = ACTION.filter((a) => a.code in GRANTS).map((a) => a.code)
const problems: string[] = []

for (const [code, files] of answers) {
  if (!(granted as readonly string[]).includes(code)) {
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
    if (!(granted as readonly string[]).includes(code)) {
      problems.push(`${code} is in ${name} and the model no longer grants it — delete the entry`)
    }
  }
}

rule(
  "every action the model grants has a screen, or a written reason",
  problems,
  `check-actions: ${problems.length} problem(s) across ${granted.length} granted actions:\n` +
    problems.map((p) => `  ${p}`).join("\n"),
  `check-actions: ${granted.length} actions granted, ${answers.size} answered by a screen, ` +
    `${Object.keys(NOT_BUILT).length} buildable and unbuilt, ` +
    `${Object.keys(BLOCKED).length} at the model boundary`,
)
