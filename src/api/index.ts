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
import * as standings from "./standings"
import * as teams from "./teams"
import * as reference from "./reference"
import * as health from "./health"
import * as domain from "./domain"

export const router = {
  events: {
    list: events.list,
    get: events.get,
    create: events.create,
    update: events.update,
    delete: events.remove,
    addCoOrganizer: events.addCoOrganizer,
    acceptCoOrganizerInvite: events.acceptCoOrganizerInvite,
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
    enterScore: games.enterScore,
    setStatus: games.setStatus,
  },
  teams: {
    list: teams.list,
    get: teams.get,
    create: teams.create,
    update: teams.update,
    delete: teams.remove,
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
  players: domain.players,
  playerTeams: domain.playerTeams,
  teamCoaches: domain.teamCoaches,
  eventPlayers: domain.eventPlayers,
}

export type Router = typeof router
