/**
 * Every grant in the model can be answered, and no write is open to everyone.
 *
 * Two questions about the model alone. (Whether every table the model names
 * exists in the schema was the third, and is a compile error now — see
 * `FIXTURE_TABLE` in src/domain/vocabularies.ts and the `satisfies` in
 * src/db/schema.ts.)
 */
import { ACTION, GRANTS, RELATION } from "../../src/domain/vocabularies"
import { rule } from "./helpers"

const problems: string[] = []

/**
 * A grant must be answerable: the relation has to be about the object the action
 * acts on.
 *
 * `can()` resolves a relation against the action's object id. If the two
 * disagree — an EVENT action granted to a TEAM relation — the lookup becomes
 * `team_coaches.team_id = <an event id>`, matches nothing, and denies everyone.
 * It fails *closed*, so it does not throw, does not log, and looks exactly like
 * a deliberate policy. Nothing surfaced it three separate times:
 *
 *   ENTER_SCORES              EVENT, granted to referee relations   (fixed: GAME)
 *   REGISTER_TEAM_FOR_EVENT   EVENT, granted to coach relations     (fixed: TEAM)
 *   REGISTER_PLAYER_FOR_EVENT EVENT, granted to player relations    (fixed: PLAYER)
 *
 * PLATFORM relations are exempt: a role comparison and `PUBLIC` need no object,
 * so they apply to an action of any type.
 */
for (const [action, grants] of Object.entries(GRANTS)) {
  const a = ACTION.find((x) => x.code === action)
  if (!a || a.objectTypeCode === "PLATFORM") continue

  for (const g of grants as ReadonlyArray<{ relation: string }>) {
    const r = RELATION.find((x) => x.code === g.relation)
    if (!r) {
      problems.push(`action ${action} is granted to '${g.relation}', which is not a relation`)
      continue
    }
    if (r.objectTypeCode === "PLATFORM") continue
    if (r.objectTypeCode !== a.objectTypeCode) {
      problems.push(
        `action ${action} acts on ${a.objectTypeCode} but is granted to ${g.relation}, ` +
          `which is about ${r.objectTypeCode} — that grant can never resolve`,
      )
    }
  }
}

/**
 * Nothing that writes may be granted to everyone.
 *
 * `PUBLIC` includes anonymous visitors, so it is right for reads — a spectator
 * looking up a score needs no account — and never right for a write. Classified
 * by the verb the action code starts with, which is what those codes encode.
 *
 * This passes today and is here to keep passing. It exists because I reported a
 * public `CREATE_PLAYER` that did not exist, from a grep whose context spilled
 * into the next action's grants: the question deserves an answer that is checked
 * rather than read.
 */
const WRITES =
  /^(CREATE|EDIT|DELETE|REGISTER|ENTER|CONFIRM|RECORD|MANAGE|GENERATE|INVITE|REMOVE|ACCEPT|ASSIGN|SET|APPROVE|MODERATE|BAN|IMPERSONATE|WITHDRAW)/

for (const [action, grants] of Object.entries(GRANTS)) {
  if (!WRITES.test(action)) continue
  for (const g of grants as ReadonlyArray<{ relation: string }>) {
    // `ANY_SIGNED_IN` is deliberately allowed: the three actions using it are
    // "manage your OWN notification channels / preferences" and "accept an
    // invitation addressed to you". The scoping is in the resource, not the
    // relation, and the handler enforces it — tests/worker/write.test.ts asserts
    // you cannot accept an invitation you were never sent.
    if (g.relation === "PUBLIC") {
      problems.push(`action ${action} writes but is granted to PUBLIC — anyone, signed out, could do it`)
    }
  }
}

rule(
  "every grant resolves, and nothing that writes is granted to PUBLIC",
  problems,
  `check-grants: ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join("\n"),
  `check-grants: every grant resolves, no write is public`,
)
