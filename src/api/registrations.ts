/**
 * Registration and rosters — putting teams into events, and players into teams.
 *
 * The gap between having an event and having anyone in it. The tables have
 * existed and been readable all along; nothing could write one.
 *
 * **Registration is an action about a pair**, and that is the thing to
 * understand here. "May this coach register this team for this event" is two
 * questions of two different objects: are you this team's coach, and is this
 * event one you may enter. The Product Owner's model scopes the relation to the
 * TEAM and narrows the grant by the event's subtype, so `requireAction` is given
 * both — the team as the object, the event as the context.
 *
 * It said EVENT until 2026-08-27, which meant `HEAD_COACH` was resolved as
 * `team_coaches.team_id = <an event id>`. That matches nothing, so it failed
 * closed: no coach could register a team, and only a platform admin could.
 */

import { ORPCError } from "@orpc/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema"
import { authed, authedRoute, can, requireAction, viewer } from "./base"

/** ISO day. The fixtures record registration and roster dates, not timestamps. */
const today = () => new Date().toISOString().slice(0, 10)

const RegisterTeamInput = z.object({
  /** The object the permission is about. */
  teamId: z.string(),
  /** The event being entered — what narrows the grant by subtype. */
  eventId: z.string(),
  /**
   * Required, because `eventTeam.division_id` is NOT NULL: a team enters a
   * division, not an event in general. The composite key is
   * (event, team, division), so a club fielding one squad in two divisions is
   * two registrations, which is the right shape.
   */
  divisionId: z.string(),
})

export const registerTeam = authed
  .route({
    method: "POST",
    path: "/events/{eventId}/teams",
    summary: "Enter a team into an event",
    successStatus: 201,
    ...authedRoute,
  })
  .input(RegisterTeamInput)
  .output(z.object({ eventId: z.string(), teamId: z.string(), divisionId: z.string() }))
  .use(
    requireAction(
      "REGISTER_TEAM_FOR_EVENT",
      (i: { teamId: string }) => i.teamId,
      (i: { eventId: string }) => i.eventId,
    ),
  )
  .handler(async ({ context, input }) => {
    const event = await context.db
      .select({ id: schema.event.id })
      .from(schema.event)
      .where(eq(schema.event.id, input.eventId))
      .get()
    // The permission check proved the *team* exists; the event is the other half
    // of the pair and is checked here.
    if (!event) throw new ORPCError("NOT_FOUND", { message: "Unknown event" })

    /**
     * A team must match the division it enters.
     *
     * The foreign keys prove the division exists and the team exists; nothing in
     * the database stops a U18 girls' team being entered into U16 boys. That is
     * not a permission question — the coach is entitled to register — it is an
     * integrity one, and the only place it can be asked is here.
     */
    const division = await context.db
      .select({
        ageGroupCode: schema.division.ageGroupCode,
        genderCode: schema.division.genderCode,
      })
      .from(schema.division)
      .where(eq(schema.division.id, input.divisionId))
      .get()
    if (!division) throw new ORPCError("NOT_FOUND", { message: "Unknown division" })

    const team = await context.db
      .select({
        ageGroupCode: schema.team.ageGroupCode,
        genderCode: schema.team.genderCode,
      })
      .from(schema.team)
      .where(eq(schema.team.id, input.teamId))
      .get()
    if (
      team &&
      (team.ageGroupCode !== division.ageGroupCode || team.genderCode !== division.genderCode)
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: `This team is ${team.ageGroupCode} ${team.genderCode}; that division is ${division.ageGroupCode} ${division.genderCode}`,
      })
    }

    // Entering twice is not an error and must not duplicate: a coach pressing
    // the button again means the same thing they meant the first time.
    await context.db
      .insert(schema.eventTeam)
      .values({
        eventId: input.eventId,
        teamId: input.teamId,
        divisionId: input.divisionId,
        registeredAt: today(),
      })
      .onConflictDoNothing()

    return { eventId: input.eventId, teamId: input.teamId, divisionId: input.divisionId }
  })

export const withdrawTeam = authed
  .route({
    method: "DELETE",
    path: "/events/{eventId}/teams/{teamId}",
    summary: "Withdraw a team from an event",
    ...authedRoute,
  })
  .input(z.object({ teamId: z.string(), eventId: z.string() }))
  .output(z.object({ withdrawn: z.string() }))
  .use(
    requireAction(
      "REGISTER_TEAM_FOR_EVENT",
      (i: { teamId: string }) => i.teamId,
      (i: { eventId: string }) => i.eventId,
    ),
  )
  .handler(async ({ context, input }) => {
    const res = await context.db
      .delete(schema.eventTeam)
      .where(
        and(
          eq(schema.eventTeam.eventId, input.eventId),
          eq(schema.eventTeam.teamId, input.teamId),
        ),
      )
    if (res.meta.changes === 0) throw new ORPCError("NOT_FOUND", { message: "Not registered" })
    return { withdrawn: input.teamId }
  })

/**
 * The roster: which players are in a team, and when.
 *
 * `MANAGE_ROSTER` is TEAM-scoped and needs no event context — a roster belongs
 * to a team all season, not to any one competition.
 *
 * `fromDate`/`toDate` are the model's own: a player's spell in a team can end,
 * and the `TEAM_PLAYER` relation reads `to_date` so a departed player stops
 * holding it. Removing someone therefore *ends* their spell rather than deleting
 * the row — the history is what makes last season's results explicable.
 */
const RosterInput = z.object({ teamId: z.string(), playerId: z.string() })

export const addPlayer = authed
  .route({
    method: "POST",
    path: "/teams/{teamId}/players",
    summary: "Add a player to a team's roster",
    successStatus: 201,
    ...authedRoute,
  })
  .input(RosterInput.extend({ fromDate: z.string().optional() }))
  .output(z.object({ teamId: z.string(), playerId: z.string(), fromDate: z.string() }))
  .use(requireAction("MANAGE_ROSTER", (i: { teamId: string }) => i.teamId))
  .handler(async ({ context, input }) => {
    const player = await context.db
      .select({ id: schema.player.id })
      .from(schema.player)
      .where(eq(schema.player.id, input.playerId))
      .get()
    if (!player) throw new ORPCError("NOT_FOUND", { message: "Unknown player" })

    const fromDate = input.fromDate ?? today()
    await context.db
      .insert(schema.playerTeam)
      .values({ teamId: input.teamId, playerId: input.playerId, fromDate, toDate: null })
      .onConflictDoNothing()

    return { teamId: input.teamId, playerId: input.playerId, fromDate }
  })

export const removePlayer = authed
  .route({
    method: "DELETE",
    path: "/teams/{teamId}/players/{playerId}",
    summary: "End a player's spell in a team",
    ...authedRoute,
  })
  .input(RosterInput)
  .output(z.object({ playerId: z.string(), toDate: z.string() }))
  .use(requireAction("MANAGE_ROSTER", (i: { teamId: string }) => i.teamId))
  .handler(async ({ context, input }) => {
    const toDate = today()
    // Ends the spell, does not delete it. A deleted row would make last
    // season's team sheet wrong retrospectively.
    const res = await context.db
      .update(schema.playerTeam)
      .set({ toDate })
      .where(
        and(
          eq(schema.playerTeam.teamId, input.teamId),
          eq(schema.playerTeam.playerId, input.playerId),
        ),
      )
    if (res.meta.changes === 0) throw new ORPCError("NOT_FOUND", { message: "Not on this roster" })
    return { playerId: input.playerId, toDate }
  })

/**
 * The current squad.
 *
 * Current, not historical: a spell with a `to_date` in the past is over, which
 * is the same condition the `TEAM_PLAYER` relation applies. Reading is public —
 * `VIEW_TEAM` is granted to `PUBLIC`, and a team sheet is the least private
 * thing a club has.
 *
 * No per-game statistics. The fixture this replaces showed points, assists and
 * rebounds per player; there is no stats table, and inventing three numbers per
 * person is exactly the thing AGENTS.md forbids. Jersey number, position and
 * date of birth are real columns and are what a roster actually is.
 */
export const roster = viewer
  .route({ method: "GET", path: "/teams/{teamId}/players", summary: "A team's current squad" })
  .input(z.object({ teamId: z.string() }))
  .output(
    z.object({
      players: z.array(
        z.object({
          playerId: z.string(),
          names: z.record(z.string(), z.string()),
          jerseyNumber: z.number().int(),
          positionCode: z.string(),
          fromDate: z.string(),
        }),
      ),
      canManage: z.boolean(),
    }),
  )
  .handler(async ({ context, input }) => {
    const day = today()
    const rows = await context.db
      .select({
        playerId: schema.player.id,
        names: schema.player.names,
        jerseyNumber: schema.player.jerseyNumber,
        positionCode: schema.player.positionCode,
        fromDate: schema.playerTeam.fromDate,
        toDate: schema.playerTeam.toDate,
      })
      .from(schema.playerTeam)
      .innerJoin(schema.player, eq(schema.player.id, schema.playerTeam.playerId))
      .where(eq(schema.playerTeam.teamId, input.teamId))
      .orderBy(schema.player.jerseyNumber)
      .all()

    return {
      players: rows
        .filter((r) => !r.toDate || r.toDate >= day)
        .map(({ toDate: _toDate, ...p }) => p),
      canManage: await can(context.db, "MANAGE_ROSTER", context.user, input.teamId),
    }
  })
