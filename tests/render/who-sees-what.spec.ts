import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { apiMine } from "../helpers/api-fixtures"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { granted, platformGranted, projectRoster, projectTeam, type Held } from "../helpers/projections"
import { ACTION, GRANTS } from "../../src/domain/vocabularies"

/**
 * Who sees what: the screen checked against the model, for every relation.
 *
 * The GUI hides itself by who you are, and "who you are" looked like every
 * seeded person times every object times every screen — too many to walk,
 * and walking is how the 2026-09-06 GUI walk found a visitor offered "Manage
 * squad": by pressing Sign out on the right page by luck. This is the same
 * question asked properly. See docs/2026-09-06-02-who-sees-what.md.
 *
 * ## Relations, not people
 *
 * The model grants each action to relations on one kind of object, so a team
 * page has one case per relation the model names for a team, plus a visitor
 * and a signed-in stranger. Each case is one projection —
 * `projectTeam(id, ["HEAD_COACH"])` — whose `can` is the model's own answer,
 * proven equal to the server's by tests/worker/projection-equivalence.test.ts.
 * No server, no sign-in, and no list of expectations written by hand: the
 * relations come from GRANTS and the answers from the projection.
 *
 * ## What is asserted, and the data-state limit
 *
 * Every control that performs a model action carries `data-action`. Two
 * things must hold, and they are not the same:
 *
 * 1. **Never offered when refused.** Whatever the state of the data, a case
 *    is never shown a control for an action the model does not grant it.
 *    This holds in every case unconditionally.
 * 2. **Offered when granted.** For each action a control on this screen
 *    names, every relation the model grants it to is offered it. Data state
 *    can legitimately hide a granted control — a follower is offered
 *    Unfollow, not Follow, though the model grants both — so a control whose
 *    offer depends on state says so in STATEFUL below, with the state that
 *    shows it, and is checked in that state. Anything not listed there is
 *    expected in every case that holds the relation.
 *
 * That is the answer to "there are data permutations too": the permission
 * half is finite (relations × screens) and the state half is declared per
 * control, on the seeded object whose state shows it. What this does not do
 * is enumerate every state a control can be hidden in; that is product
 * logic, and each such rule has its own spec.
 *
 * ## The table
 *
 * The run prints the matrix it checked, one line per case, so an agent that
 * changes this page can read what every reader is offered without opening a
 * browser as any of them.
 */

const TEAM = "team_001"

/** A relation as a case: the reader holds exactly this on the team. */
type Case = { name: string; held: Held }

/**
 * Relations the model names for actions on a team, straight off GRANTS —
 * including PLATFORM_ADMIN, which the projections accept as a relation like
 * any other. PUBLIC and ANY_SIGNED_IN are not relations a reader holds; they
 * are the visitor and the stranger, listed first.
 */
/** The model's grants for one action: who may, as relations. */
const grantsOf = (action: string): readonly { relation: string }[] =>
  (GRANTS as unknown as Record<string, readonly { relation: string }[]>)[action] ?? []

const teamActions = ACTION.filter((a) => a.objectTypeCode === "TEAM").map((a) => a.code)
const relations = [
  ...new Set(teamActions.flatMap((a) => grantsOf(a).map((g) => g.relation))),
].filter((r) => r !== "PUBLIC" && r !== "ANY_SIGNED_IN")

const CASES: Case[] = [
  { name: "visitor", held: null },
  { name: "signed in, no relation", held: [] },
  ...relations.map((r) => ({ name: r, held: [r] as unknown as Held })),
]

/** The case a grant's relation names, for the second assertion. */
const caseFor = (relation: string): Case | undefined =>
  relation === "PUBLIC"
    ? CASES[0]
    : relation === "ANY_SIGNED_IN"
      ? CASES[1]
      : CASES.find((c) => c.name === relation)

/**
 * Controls whose offer depends on state, with the relation whose seeded state
 * shows them. Unfollow exists only while following, and following is what
 * FOLLOWER_TEAM means — so it is checked there and nowhere else.
 */
const STATEFUL: Record<string, string> = {
  UNFOLLOW_TEAM: "FOLLOWER_TEAM",
}

/** Seed the cache as this reader would find it, and open the team page. */
async function open(page: Parameters<typeof seedCache>[0], held: Held) {
  const signedIn = held !== null
  const follows = held?.includes("FOLLOWER_TEAM" as never) ?? false
  await seedCache(page, [
    ...(signedIn ? [sessionFor("COACH")] : []),
    entry(orpc.me.mine, undefined, apiMine([], held ?? [])),
    entry(orpc.teams.get, { id: TEAM }, projectTeam(TEAM, held)),
    entry(orpc.teams.roster, { teamId: TEAM }, projectRoster(TEAM, { signedIn })),
    entry(orpc.games.list, { teamId: TEAM }, { viewerTimezone: null, games: [] }),
    entry(orpc.notifications.following, undefined, {
      following: follows ? [{ objectTypeCode: "TEAM", objectId: TEAM }] : [],
      muted: [],
    } as never),
  ])
  await visit(page, "team", { id: TEAM })
  await expect(page.getByTestId("team-name")).toBeVisible()
  const offered = await page.locator("[data-action]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-action")!),
  )
  return new Set(offered)
}

test("the team page offers each relation exactly what the model grants it", async ({ page }) => {
  expect(relations.length, "the model names relations on a team").toBeGreaterThan(3)

  const offeredBy = new Map<string, Set<string>>()
  for (const c of CASES) offeredBy.set(c.name, await open(page, c.held))

  const answered = [...new Set([...offeredBy.values()].flatMap((s) => [...s]))].sort()
  const table = CASES.map((c) => {
    const offered = [...offeredBy.get(c.name)!].sort().join(" ") || "—"
    return `  ${c.name.padEnd(24)} ${offered}`
  })
  console.log(`who-sees-what · team/${TEAM}\n  ${"case".padEnd(24)} offered\n${table.join("\n")}`)

  const wrong: string[] = []
  for (const c of CASES) {
    const can = { ...platformGranted(c.held), ...granted("TEAM", c.held) } as Record<string, boolean>
    for (const action of offeredBy.get(c.name)!) {
      if (!can[action]) wrong.push(`${c.name}: ${action} offered, not granted`)
    }
  }
  for (const action of answered) {
    for (const { relation } of grantsOf(action)) {
      const c = caseFor(relation)
      if (!c) continue
      if (action in STATEFUL && c.name !== STATEFUL[action]) continue
      if (!offeredBy.get(c.name)!.has(action)) wrong.push(`${c.name}: ${action} granted, not offered`)
    }
  }
  expect(wrong, "where the screen and the model disagree").toEqual([])
})
