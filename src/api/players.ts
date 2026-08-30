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

import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema"
import { GUARDIAN_TYPE_CODES, POSITION_CODES, type GuardianTypeCode } from "../domain/vocabularies"
import { authed, authedRoute, can, checkedInHandler, requireAction , found } from "./base"
import { clean } from "../domain/names"
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

/**
 * Change a player's profile.
 *
 * `EDIT_PLAYER_PROFILE` is granted to SELF, GUARDIAN, HEAD_COACH,
 * ASSISTANT_COACH and PLATFORM_ADMIN — so a parent may correct their child's
 * jersey number and a coach may set the position they actually play. The action
 * has existed since the fixtures were written and there was no procedure behind
 * it at all, so none of those people could change anything.
 *
 * ## What is not editable, and why
 *
 * **`dob`.** It decides which age group a player is eligible for, which decides
 * which events a team can enter them in. Letting a guardian edit it from a
 * profile form makes the eligibility rules advisory — and the honest way to
 * correct a birth date is a request to somebody who can check it, not a text
 * box. The model has no action for it, which is the PO saying the same thing.
 *
 * **`userId`.** Linking a player row to a sign-in is an identity claim, not a
 * profile edit. It is how a person would attach themselves to a child's record.
 */
export const update = authed
  .route({ method: "PUT", path: "/players/{id}", summary: "Update a player's profile", ...authedRoute })
  .input(
    z.object({
      id: z.string(),
      names: z.record(z.string(), z.string()).optional(),
      // A squad number, not an arbitrary integer. FIBA allows 0-99 and the
      // column is a plain integer, so this is the only place the rule exists.
      jerseyNumber: z.number().int().min(0).max(99).optional(),
      positionCode: z.enum(POSITION_CODES).optional(),
    }),
  )
  .output(
    z.object({
      playerId: z.string(),
      names: z.record(z.string(), z.string()),
      jerseyNumber: z.number().int(),
      positionCode: z.string(),
    }),
  )
  .use(requireAction("EDIT_PLAYER_PROFILE"))
  .handler(async ({ context, input }) => {
    const { id, names, ...columns } = input
    await context.db
      .update(schema.player)
      /**
       * `names` only — `player` has no `name` pivot column.
       *
       * `event`, `team` and `org` all carry one, so writing `name: pivot(names)`
       * here looked right and typechecked, because drizzle's `.set()` accepts
       * keys the table does not have. It would have failed at the database
       * instead. Worth stating: a convention that holds for three tables out of
       * four is exactly the kind that gets applied to the fourth by habit.
       */
      .set({ ...columns, ...(names ? { names: clean(names) } : {}) })
      .where(eq(schema.player.id, id))

    const row = found(await context.db
      .select({
        id: schema.player.id,
        names: schema.player.names,
        jerseyNumber: schema.player.jerseyNumber,
        positionCode: schema.player.positionCode,
      })
      .from(schema.player)
      .where(eq(schema.player.id, id))
      .get())
    return { playerId: row.id, names: row.names as Record<string, string>, jerseyNumber: row.jerseyNumber, positionCode: row.positionCode }
  })

/**
 * Enter a player into an event, or take them out again.
 *
 * The third grant a guardian holds and the third with no procedure behind it.
 * `eventPlayer` is the only table in the model that had neither an API nor a
 * screen.
 *
 * ## The grant is conditional, and that is the whole point
 *
 * `REGISTER_PLAYER_FOR_EVENT` is granted to SELF and GUARDIAN **only for CAMP
 * and SHOWCASE**. A tournament or a league is entered by a *team*: a parent
 * cannot put their child into the Bangkok Schools League, because the league
 * plays teams and the team's coach enters it. A camp takes individuals.
 *
 * That distinction lives in the PO's model and nothing here restates it. What
 * this file must do is give the resolver the event to narrow against —
 * `eventFrom` — because a PLAYER has no event parent to derive one from. Without
 * it every `eventTypes` grant is skipped and the action denies everybody, which
 * is the failure `eventIdFor` was written about.
 */
const RegistrationInput = z.object({ playerId: z.string(), eventId: z.string() })

export const registerForEvent = authed
  .route({
    method: "POST",
    path: "/events/{eventId}/players",
    summary: "Enter a player into an event",
    successStatus: 201,
    ...authedRoute,
  })
  .input(RegistrationInput)
  .output(z.object({ eventId: z.string(), playerId: z.string(), registeredAt: z.string() }))
  .use(
    requireAction(
      "REGISTER_PLAYER_FOR_EVENT",
      (i: { playerId: string }) => i.playerId,
      (i: { eventId: string }) => i.eventId,
    ),
  )
  .handler(async ({ context, input }) => {
    const registeredAt = new Date().toISOString().slice(0, 10)
    // Idempotent: the unique index is on (event, player), so pressing twice is
    // a no-op rather than a second row or a 500.
    await context.db
      .insert(schema.eventPlayer)
      .values({ eventId: input.eventId, playerId: input.playerId, registeredAt })
      .onConflictDoNothing()
    return { eventId: input.eventId, playerId: input.playerId, registeredAt }
  })

export const withdrawFromEvent = authed
  .route({
    method: "DELETE",
    path: "/events/{eventId}/players/{playerId}",
    summary: "Take a player out of an event",
    ...authedRoute,
  })
  .input(RegistrationInput)
  .output(z.object({ withdrawn: z.boolean() }))
  // The same grant. Whoever may enter a child may take them out again —
  // there is no separate withdraw action, and inventing one here would be this
  // file deciding something the PO has not.
  .use(
    requireAction(
      "REGISTER_PLAYER_FOR_EVENT",
      (i: { playerId: string }) => i.playerId,
      (i: { eventId: string }) => i.eventId,
    ),
  )
  .handler(async ({ context, input }) => {
    const res = await context.db
      .delete(schema.eventPlayer)
      .where(
        and(
          eq(schema.eventPlayer.eventId, input.eventId),
          eq(schema.eventPlayer.playerId, input.playerId),
        ),
      )
    // Not an error when there was nothing to remove: the caller wanted the
    // player out of the event and the player is out of the event.
    return { withdrawn: res.meta.changes > 0 }
  })
