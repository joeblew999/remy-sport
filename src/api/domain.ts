/**
 * The domain model's read endpoints.
 *
 * One line per resource. The route, the response schema and the query were
 * three separate things while a contract existed — `listOf()` declared the
 * shape over there, `rows()` fetched it over here, and the two had to be kept
 * in step by hand. They are one helper now, which is what the contract's
 * removal was for.
 *
 * The schema is derived from the table, so a column added upstream by
 * `mise run domain:sync` appears in the response, in the OpenAPI document
 * and in the client's types with nothing edited here.
 *
 * What is NOT shared, and stays written out one line at a time: WHICH tables
 * are served, and to whom. `pub` versus `authed` is visible per line for the
 * same reason the event and team procedures spell their middleware out —
 * "every generated table is an endpoint" is how personal data gets published by
 * accident.
 *
 * Writes are absent on purpose. These rows are the PO's fixtures, loaded by
 * /api/seed. When a feature needs to create one it gets a real endpoint with
 * the two access-control questions ADR 009 requires — exactly the kind of thing
 * a factory should not invent on anyone's behalf.
 */

import { z } from "zod"
import { FIXTURE_SCHEMAS, FIXTURE_TABLES } from "../db/fixtures-schema"
import { authed, pub } from "./base"

type Key = keyof typeof FIXTURE_SCHEMAS & keyof typeof FIXTURE_TABLES

/** A whole table, read-only: route, derived schema and query in one place. */
const listOf = <K extends Key>(builder: typeof pub | typeof authed, key: K, path: `/${string}`) => ({
  list: builder
    .route({ method: "GET", path, summary: `List ${key}` })
    .output(z.object({ items: z.array(FIXTURE_SCHEMAS[key]) }))
    .handler(async ({ context }) => ({
      items: (await context.db.select().from(FIXTURE_TABLES[key]).all()) as never,
    })),
})

// Public: the PO's reference-shaped data. Nothing here identifies a person
// beyond what a fixture list already shows on the wall of a gym.
export const divisions = listOf(pub, "divisions", "/divisions")
export const venues = listOf(pub, "venues", "/venues")
export const eventTeams = listOf(pub, "eventTeams", "/event-teams")
export const eventVenues = listOf(pub, "eventVenues", "/event-venues")

// Behind a session: these are rosters, and they name minors.
export const players = listOf(authed, "players", "/players")
export const playerTeams = listOf(authed, "playerTeams", "/player-teams")
export const teamCoaches = listOf(authed, "teamCoaches", "/team-coaches")
export const eventPlayers = listOf(authed, "eventPlayers", "/event-players")

// Deliberately NOT exposed: guardians, subscriptions, userNotificationChannels
// and userNotificationPreferences. They are about identifiable people — who a
// child's guardian is, what someone follows, which LINE account they use. Each
// needs a per-caller scope before it can be served at all, which is a feature,
// not a line in this list.
