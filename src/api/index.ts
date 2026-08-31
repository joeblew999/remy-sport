/**
 * The API router — the single source the whole stack reads.
 *
 * From this one object oRPC derives the HTTP handlers, the OpenAPI document,
 * and the client's types. Nothing is written twice: there is no route table,
 * no response-status block, no hand-written client interface, and no fetch
 * wrapper.
 */

import * as events from "./events"
import * as games from "./games"
import * as orgs from "./orgs"
import * as registrations from "./registrations"
import * as standings from "./standings"
import * as teams from "./teams"
import * as admin from "./admin"
import * as reference from "./reference"
import * as health from "./health"
import * as domain from "./domain"
import * as moq from "./moq"
import * as notifications from "./notifications"
import * as playersApi from "./players"

export const router = {
  /**
   * Push, following, and muting. See src/api/notifications.ts for why these
   * are three separate ideas rather than one "notifications on" switch.
   */
  notifications: {
    key: notifications.key,
    subscribe: notifications.subscribe,
    unsubscribe: notifications.unsubscribe,
    devices: notifications.devices,
    follow: notifications.follow,
    unfollow: notifications.unfollow,
    following: notifications.following,
    setPreference: notifications.setPreference,
    sendTest: notifications.sendTest,
  },
  moq: {
    config: moq.config,
  },
  events: {
    list: events.list,
    mine: events.mine,
    setDivisions: events.setDivisions,
    /**
     * A camp's timetable. `DEFINE_SESSION_SCHEDULE` is the model's answer for
     * CAMP events the way MANAGE_FIXTURES is for tournaments and leagues, and it
     * had no endpoint — a camp organiser could watch children register and then
     * had no way to say when to turn up.
     */
    sessions: events.sessions,
    addSession: events.addSession,
    removeSession: events.removeSession,
    /**
     * The register. Granted more widely than the timetable — a camp's coaches
     * carry it, and the model says so.
     */
    attendance: events.attendance,
    recordAttendance: events.recordAttendance,
    get: events.get,
    create: events.create,
    update: events.update,
    delete: events.remove,
    addCoOrganizer: events.addCoOrganizer,
    invitations: events.invitations,
    acceptCoOrganizerInvite: events.acceptCoOrganizerInvite,
    entries: registrations.eventTeams,
    registerTeam: registrations.registerTeam,
    withdrawTeam: registrations.withdrawTeam,
  },
  orgs: {
    list: orgs.list,
    get: orgs.get,
    update: orgs.update,
    members: orgs.members,
    addMember: orgs.addMember,
    removeMember: orgs.removeMember,
  },
  games: {
    list: games.list,
    get: games.get,
    create: games.create,
    generateFixtures: games.generateFixtures,
    update: games.update,
    assignVenue: games.assignVenue,
    delete: games.remove,
    enterScore: games.enterScore,
    setStatus: games.setStatus,
    startBroadcast: games.startBroadcast,
    stopBroadcast: games.stopBroadcast,
    assignReferee: games.assignReferee,
    unassignReferee: games.unassignReferee,
  },
  teams: {
    list: teams.list,
    get: teams.get,
    create: teams.create,
    update: teams.update,
    delete: teams.remove,
    roster: registrations.roster,
    addPlayer: registrations.addPlayer,
    removePlayer: registrations.removePlayer,
  },
  standings: { list: standings.list },
  reference: { list: reference.list },
  health: { get: health.get },

  // The Product Owner's domain model. One generic implementation serves all of
  // them — see src/api/domain.ts for why, and the contract for which.
  divisions: domain.divisions,
  venues: domain.venues,
  eventTeams: domain.eventTeams,
  eventVenues: domain.eventVenues,
  players: {
    ...domain.players,
    /**
     * Whose players they are — the guardians table, which nothing read until
     * 2026-08-30. See src/api/players.ts.
     */
    mine: playersApi.mine,
    /**
     * Two ways a player comes into existence, because the model has two
     * actions: `CREATE_PLAYER` for a coach adding to the pool, and
     * `SIGN_UP_PLAYER_AS_GUARDIAN` for a parent registering their own child.
     * Until 2026-08-31 there were none, and every player on the platform came
     * from the seed.
     */
    create: playersApi.create,
    signUpAsGuardian: playersApi.signUpAsGuardian,
    update: playersApi.update,
    registerForEvent: playersApi.registerForEvent,
    withdrawFromEvent: playersApi.withdrawFromEvent,
  },
  /**
   * Platform administration. `APPROVE_REFEREE` is the first of the model's four
   * Admin actions to exist — a referee could sign up, sign in, and wait forever.
   */
  admin: { approveReferee: admin.approveReferee },
  playerTeams: domain.playerTeams,
  teamCoaches: domain.teamCoaches,
  eventPlayers: domain.eventPlayers,
}

export type Router = typeof router
