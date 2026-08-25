/**
 * The API router — the single source the whole stack reads.
 *
 * From this one object oRPC derives the HTTP handlers, the OpenAPI document,
 * and the client's types. Nothing is written twice: there is no route table,
 * no response-status block, no hand-written client interface, and no fetch
 * wrapper.
 */

import * as events from "./events"
import * as teams from "./teams"
import * as reference from "./reference"
import * as health from "./health"

export const router = {
  events: {
    list: events.list,
    get: events.get,
    create: events.create,
    update: events.update,
    delete: events.remove,
  },
  teams: {
    list: teams.list,
    get: teams.get,
    create: teams.create,
    update: teams.update,
    delete: teams.remove,
  },
  reference: { list: reference.list },
  health: { get: health.get },
}

export type Router = typeof router
