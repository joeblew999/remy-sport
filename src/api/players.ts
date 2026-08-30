/**
 * The players you are responsible for.
 *
 * The `guardians` table has been in the model since the fixtures were written —
 * four rows, three guardian types, a `GUARDIAN` relation on PLAYER — and
 * nothing in the app has ever read it. The Product Owner grants a guardian
 * three things: `REGISTER_PLAYER_FOR_EVENT`, `EDIT_PLAYER_PROFILE` and
 * `RECEIVE_PLAYER_NOTIFICATIONS`. None was reachable from any screen, because
 * there was no screen that knew a guardian existed.
 *
 * For a youth sports platform that is close to the whole point: a parent in
 * Bangkok signing in to see which team their child is on and when they play
 * next.
 *
 * ## Why GUARDIAN and SELF, and not "whoever may edit"
 *
 * `EDIT_PLAYER_PROFILE` is granted to SELF, GUARDIAN, HEAD_COACH,
 * ASSISTANT_COACH and PLATFORM_ADMIN. Deriving this list from that action would
 * put every player a coach trains under the heading "your players", which is a
 * different relationship and a much longer list.
 *
 * The two named here are the ones that make a player *yours* rather than
 * *your responsibility at work*. That is a product judgement and it is written
 * down here rather than smuggled into a query — if the PO decides a coach's
 * squad belongs on their profile too, this is the line that changes.
 */

import { eq, inArray } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema"
import { GUARDIAN_TYPE_CODES, type GuardianTypeCode } from "../domain/vocabularies"
import { authed, authedRoute, can, checkedInHandler } from "./base"
import { objectsHeldBy } from "./relations"

/** The relations that make a player yours. See the note above. */
const MINE = ["GUARDIAN", "SELF"] as const

export const mine = authed
  .route({
    method: "GET",
    path: "/players/mine",
    summary: "Players I am guardian to, or am",
    ...authedRoute,
  })
  .output(
    z.object({
      players: z.array(
        z.object({
          playerId: z.string(),
          names: z.record(z.string(), z.string()),
          jerseyNumber: z.number().int(),
          positionCode: z.string(),
          /**
           * How you are related to them — parent, grandparent, legal guardian.
           * Null where the player *is* you, which is not a guardianship.
           */
          guardianTypeCode: z.enum(GUARDIAN_TYPE_CODES).nullable(),
          /** The team they currently play for, if any. Names, for the reader's locale. */
          teamId: z.string().nullable(),
          teamNames: z.record(z.string(), z.string()).nullable(),
          /** The model's answer, per player — not assumed from being on this list. */
          canEdit: z.boolean(),
        }),
      ),
    }),
  )
  /**
   * Declared as checked in the handler, not `requireAction`.
   *
   * There is no "list my own players" action in the model and there should not
   * be. Every row returned is one the caller holds GUARDIAN or SELF on, found
   * by asking the relation resolver which objects they hold — so the
   * authorisation *is* the query, and it is a stronger guarantee than an action
   * check on a list could give. `EDIT_PLAYER_PROFILE` is named because it is
   * the action this list exists to lead to.
   */
  .use(checkedInHandler("EDIT_PLAYER_PROFILE"))
  .handler(async ({ context }) => {
    const ids = [
      ...new Set(
        (await Promise.all(MINE.map((r) => objectsHeldBy(context.db, r, context.user.id)))).flat(),
      ),
    ]
    if (ids.length === 0) return { players: [] }

    const [players, guardianships, spells] = await Promise.all([
      context.db
        .select({
          id: schema.player.id,
          names: schema.player.names,
          jerseyNumber: schema.player.jerseyNumber,
          positionCode: schema.player.positionCode,
        })
        .from(schema.player)
        .where(inArray(schema.player.id, ids))
        .all(),
      context.db
        .select({
          playerId: schema.guardian.playerId,
          guardianTypeCode: schema.guardian.guardianTypeCode,
        })
        .from(schema.guardian)
        .where(eq(schema.guardian.userId, context.user.id))
        .all(),
      // The current spell only. A player who left a team in March is not on it
      // now, and a profile listing every team they ever played for answers a
      // different question from "where is my child playing".
      context.db
        .select({
          playerId: schema.playerTeam.playerId,
          teamId: schema.team.id,
          teamNames: schema.team.names,
          toDate: schema.playerTeam.toDate,
        })
        .from(schema.playerTeam)
        .innerJoin(schema.team, eq(schema.team.id, schema.playerTeam.teamId))
        .where(inArray(schema.playerTeam.playerId, ids))
        .all(),
    ])

    const today = new Date().toISOString().slice(0, 10)
    const guardianOf = new Map(guardianships.map((g) => [g.playerId, g.guardianTypeCode]))
    const teamOf = new Map(
      spells.filter((s) => !s.toDate || s.toDate >= today).map((s) => [s.playerId, s]),
    )

    return {
      players: await Promise.all(
        players.map(async (p) => ({
          playerId: p.id,
          names: p.names as Record<string, string>,
          jerseyNumber: p.jerseyNumber,
          positionCode: p.positionCode,
          guardianTypeCode: (guardianOf.get(p.id) ?? null) as GuardianTypeCode | null,
          teamId: teamOf.get(p.id)?.teamId ?? null,
          teamNames: (teamOf.get(p.id)?.teamNames as Record<string, string>) ?? null,
          canEdit: await can(context.db, "EDIT_PLAYER_PROFILE", context.user, p.id),
        })),
      ),
    }
  })
