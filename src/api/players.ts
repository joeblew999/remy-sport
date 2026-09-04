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

import { ORPCError } from "@orpc/server"
import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema"
import { GUARDIAN_TYPE_CODES, POSITION_CODES, type GuardianTypeCode } from "../domain/vocabularies"
import { authed, authedRoute, canFor, checkedInHandler, requireAction, stricterThanModel, found } from "./base"
import { CreatePlayerInput, SignUpPlayerInput, canSchema } from "../domain/api"
import { clean } from "../domain/names"
import { grant, objectsHeldBy } from "./relations"

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
          /** The model's answers, per player — not assumed from being on this list. */
          can: canSchema("PLAYER"),
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

    const [players, guardianships, spells, can] = await Promise.all([
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
        /**
         * Most recent spell first, because a player can hold two at once.
         *
         * `ply_001` is on Assumption's U16 and U18 sides — a child playing up
         * an age group, which is real — so "where is my child playing" has more
         * than one answer and this picked whichever row came back first. It
         * happened to agree with the latest `from_date`; now it says so.
         */
        .orderBy(desc(schema.playerTeam.fromDate))
        .all(),
      canFor(context.db, "PLAYER", context.user, ids),
    ])

    const today = new Date().toISOString().slice(0, 10)
    const guardianOf = new Map(guardianships.map((g) => [g.playerId, g.guardianTypeCode]))
    /**
     * The most recent current spell, and the first row wins.
     *
     * `new Map(entries)` keeps the **last** entry for a repeated key, so pairing
     * it with "newest first" would have selected the oldest — which is the trap
     * this is written out to avoid. A player can hold two spells at once
     * (`ply_001` is on Assumption's U16 and U18 sides, a child playing up an age
     * group), so which one is picked is a real decision and not a formality.
     */
    const teamOf = new Map<string, (typeof spells)[number]>()
    for (const spell of spells) {
      if (spell.toDate && spell.toDate < today) continue
      if (!teamOf.has(spell.playerId)) teamOf.set(spell.playerId, spell)
    }

    return {
      players: players.map((p) => ({
        playerId: p.id,
        names: p.names as Record<string, string>,
        jerseyNumber: p.jerseyNumber,
        positionCode: p.positionCode,
        guardianTypeCode: (guardianOf.get(p.id) ?? null) as GuardianTypeCode | null,
        teamId: teamOf.get(p.id)?.teamId ?? null,
        teamNames: (teamOf.get(p.id)?.teamNames as Record<string, string>) ?? null,
        can: can.get(p.id)!,
      })),
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
/** The row every create returns, so a page can render it without a round trip. */
const PlayerRow = z.object({
  playerId: z.string(),
  names: z.record(z.string(), z.string()),
  dob: z.string(),
  jerseyNumber: z.number().int(),
  positionCode: z.string(),
})

/** `ply_` plus a short random suffix, like every other id this app mints. */
const newPlayerId = () => `ply_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`

const playerRow = (input: z.infer<typeof CreatePlayerInput>) => {
  const names = clean(input.names)
  return {
    id: newPlayerId(),
    // Null: a child has no account. The column is nullable precisely so a
    // player can exist before — or without — a user ever signing in as them,
    // which is the ordinary case for a minor.
    userId: null,
    names,
    dob: input.dob,
    jerseyNumber: input.jerseyNumber,
    positionCode: input.positionCode,
  }
}

/**
 * A coach adding a player to the pool.
 *
 * `CREATE_PLAYER` is a PLATFORM action — the PO grants it to ANY_COACH,
 * ANY_PLAYER and PLATFORM_ADMIN, with no relation to an object, because the
 * player does not exist yet. Same shape as `CREATE_TEAM`.
 *
 * No guardian row and no team: this creates the person, and putting them in a
 * squad is `MANAGE_ROSTER` on a team the coach holds. Doing both here would
 * make one action stand for two the model keeps apart.
 */
export const create = authed
  .route({
    method: "POST",
    path: "/players",
    summary: "Create a player",
    successStatus: 201,
    ...authedRoute,
  })
  .input(CreatePlayerInput)
  .output(PlayerRow)
  .use(requireAction("CREATE_PLAYER"))
  .handler(async ({ context, input }) => {
    const row = playerRow(input)
    await context.db.insert(schema.player).values(row)
    return { playerId: row.id, ...row }
  })

/**
 * A guardian signing up their own child.
 *
 * `SIGN_UP_PLAYER_AS_GUARDIAN` is granted to ANY_SIGNED_IN, which is the model
 * saying any parent may do this — and it is deliberately *not* `CREATE_PLAYER`,
 * which is a coach's action. Two actions, two procedures.
 *
 * **The guardian row is written with the player, not after it.** Every later
 * action on that child is scoped by the GUARDIAN relation:
 * `EDIT_PLAYER_PROFILE`, `REGISTER_PLAYER_FOR_EVENT`, and `players.mine` itself,
 * which resolves through `objectsHeldBy("GUARDIAN")`. A player created without
 * the link belongs to nobody, cannot be found by the parent who just created
 * them, and can never be edited — a row only an admin could clean up. The same
 * reasoning makes a team's creator its head coach in `teams.create`.
 */
export const signUpAsGuardian = authed
  .route({
    method: "POST",
    path: "/players/mine",
    summary: "Sign up a child you are guardian to",
    successStatus: 201,
    ...authedRoute,
  })
  .input(SignUpPlayerInput)
  .output(PlayerRow.extend({ guardianTypeCode: z.string() }))
  .use(requireAction("SIGN_UP_PLAYER_AS_GUARDIAN"))
  .handler(async ({ context, input }) => {
    const row = playerRow(input)
    await context.db.insert(schema.player).values(row)
    await grant(context.db, "GUARDIAN", row.id, context.user.id, {
      guardian_type_code: input.guardianTypeCode,
    })
    return { playerId: row.id, ...row, guardianTypeCode: input.guardianTypeCode }
  })

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

export const remove = authed
  .route({ method: "DELETE", path: "/players/{id}", summary: "Delete a player", ...authedRoute })
  .input(z.object({ id: z.string() }))
  .output(z.object({ deleted: z.string() }))
  /**
   * `DELETE_PLAYER` is PLATFORM_ADMIN and nobody else — not a guardian, not a
   * coach, not the player themselves. The PO's grant, and the reason is that
   * these rows are minors: a person removing a child from the platform is doing
   * something a coach should not be able to do on a whim.
   */
  .use(requireAction("DELETE_PLAYER"))
  .handler(async ({ context, input }) => {
    /**
     * The rows that point at this player, first.
     *
     * Four tables carry a non-null FK to `player.id` and none is declared
     * ON DELETE CASCADE, so the delete fails at the database rather than
     * orphaning anything. Exactly the shape `teams.remove` deals with, and for
     * the same reason — see the note there, which was written after a create
     * that made a dependent row from birth turned this from theory into a
     * failing test.
     */
    await context.db.batch([
      context.db.delete(schema.guardian).where(eq(schema.guardian.playerId, input.id)),
      context.db.delete(schema.playerTeam).where(eq(schema.playerTeam.playerId, input.id)),
      context.db.delete(schema.eventPlayer).where(eq(schema.eventPlayer.playerId, input.id)),
      context.db
        .delete(schema.sessionAttendance)
        .where(eq(schema.sessionAttendance.playerId, input.id)),
    ])

    const res = await context.db.delete(schema.player).where(eq(schema.player.id, input.id))
    // `requireAction` has already 404'd a missing id — it resolves the table
    // from the action's object type — so zero changes here means the row went
    // between the two. Still a 404 to the caller.
    if (res.meta.changes === 0) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return { deleted: input.id }
  })

/**
 * One player, as a page shows them.
 *
 * `VIEW_PLAYER` is granted to PUBLIC and there was no way to look at a player.
 * The model has five object types and the app had a page for four — a player was
 * a row in somebody else's roster and nothing else. So `FOLLOW_PLAYER` had a
 * button that was never rendered, `RECEIVE_PLAYER_NOTIFICATIONS` had nothing to
 * attach to, and `VIEW_PLAYER` was answered only for a guardian looking at their
 * own child.
 *
 * ## Behind a session, which is stricter than the model
 *
 * The same decision `domain.ts` already made for every player list, and for the
 * same reason in its own words: "these rows name minors, so a session is
 * required". A public page naming a child, their school and their fixtures is
 * not what PUBLIC is for here, whatever the matrix says. Declared as `stricter`
 * so the gap between this and the model is visible to `check-authz` rather than
 * hidden in a handler.
 *
 * ## What it does not return
 *
 * No guardians. `domain.ts` deliberately does not expose that table at all —
 * who is responsible for a child is not part of looking at a player, and a page
 * is exactly where it would leak.
 *
 * ## Where they have played, which `mine` deliberately does not answer
 *
 * `players.mine` keeps the current spell and says why: a guardian's dashboard
 * asks "where is my child playing", and a list of every team they ever played
 * for answers a different question. That reasoning is about *that list* and it
 * still holds there.
 *
 * This is that other question. A player's own page is where "where have they
 * played" belongs, and `playerTeam` has carried `fromDate` and `toDate` since
 * the fixtures were written — `ply_002` left `team_001` on 2026-03-31 and no
 * screen has ever been able to say so. Ending a spell is not deleting one:
 * that is the whole reason the roster's button says "remove from squad" rather
 * than "delete", and until now the distinction was invisible to everybody
 * except the person who wrote it.
 */
export const get = authed
  .route({ method: "GET", path: "/players/{id}", summary: "One player" })
  .input(z.object({ id: z.string() }))
  .output(
    PlayerRow.extend({
      /** The team they play for now, if any — names for the reader's locale. */
      teamId: z.string().nullable(),
      teamNames: z.record(z.string(), z.string()).nullable(),
      /**
       * Spells that have ended, most recent first.
       *
       * `toDate` is never null here — that is what makes a spell past — so the
       * page can render the date without deciding whether one exists.
       */
      past: z.array(
        z.object({
          teamId: z.string(),
          teamNames: z.record(z.string(), z.string()),
          fromDate: z.string(),
          toDate: z.string(),
        }),
      ),
      /** The model's answers, so the page never works them out from a role. */
      can: canSchema("PLAYER"),
    }),
  )
  .use(
    stricterThanModel(
      "VIEW_PLAYER",
      "the model grants this to PUBLIC; this row names a minor, their school and " +
        "their fixtures, so a session is required — the same line domain.ts draws " +
        "for every player list",
    ),
  )
  .handler(async ({ context, input }) => {
    const [row] = await context.db
      .select({
        id: schema.player.id,
        names: schema.player.names,
        dob: schema.player.dob,
        jerseyNumber: schema.player.jerseyNumber,
        positionCode: schema.player.positionCode,
      })
      .from(schema.player)
      .where(eq(schema.player.id, input.id))
    found(row)

    const today = new Date().toISOString().slice(0, 10)
    const spells = await context.db
      .select({
        teamId: schema.team.id,
        teamNames: schema.team.names,
        fromDate: schema.playerTeam.fromDate,
        toDate: schema.playerTeam.toDate,
      })
      .from(schema.playerTeam)
      .innerJoin(schema.team, eq(schema.team.id, schema.playerTeam.teamId))
      .where(eq(schema.playerTeam.playerId, input.id))
      .all()
    const current = spells.find((s) => !s.toDate || s.toDate >= today)
    /**
     * Ended, most recent first. `toDate` in the past is the whole definition,
     * and the same comparison that decides `current` decides this — one rule,
     * so a spell cannot be both or neither.
     */
    const past = spells
      .filter((s): s is typeof s & { toDate: string } => Boolean(s.toDate && s.toDate < today))
      .sort((a, b) => b.toDate.localeCompare(a.toDate))

    return {
      playerId: row.id,
      names: row.names as Record<string, string>,
      dob: row.dob,
      jerseyNumber: row.jerseyNumber,
      positionCode: row.positionCode,
      teamId: current?.teamId ?? null,
      teamNames: (current?.teamNames as Record<string, string>) ?? null,
      past: past.map((s) => ({
        teamId: s.teamId,
        teamNames: s.teamNames as Record<string, string>,
        fromDate: s.fromDate,
        toDate: s.toDate,
      })),
      can: (await canFor(context.db, "PLAYER", context.user, [row.id])).get(row.id)!,
    }
  })
