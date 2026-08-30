/**
 * Events.
 *
 * One definition per operation yields the handler, the OpenAPI path, and the
 * client's types. There is no route block, no response-status table, no
 * hand-written client interface and no fetch wrapper — those were four places
 * to edit for one change, and they are gone.
 *
 * Reads go through `db.query` with the relations declared in app-schema, so
 * the organizer join is a `with:` rather than a leftJoin plus a hand-picked
 * column list.
 */

import { ORPCError } from "@orpc/server"
import { and, count, eq, inArray } from "drizzle-orm"
import * as schema from "../db/schema"
import type { ApiEvent } from "../domain/api"
import { clean, pivot } from "../domain/names"
import { z } from "zod"
import { CreateEventInput, EventSchema, UpdateEventInput } from "../domain/api"
import { ERRORS } from "./errors"
import { authed, authedRoute, can, found, openTo, requireAction, viewer, viewerTimezone, type Db, type SessionUser } from "./base"

const IdInput = z.object({ id: z.string() })

/**
 * The things an event *is*, counted from the tables that hold them.
 *
 * The event page's hero used to render `—` for teams, `—` for courts and
 * "Venue TBC" for the location, on events that had all three. The model has
 * `eventTeam`, `eventVenue`, `division` and `subscription`; the API returned
 * none of them, so the GUI could not express what the database plainly said.
 *
 * **One query per fact for the whole page, not per event.** A list of a dozen
 * events was already paying two `can` lookups each; four more apiece would have
 * been fifty-odd round trips to render a page of headings. These group by
 * `event_id` and are joined in memory, so the cost is four queries whether the
 * list holds one event or a hundred.
 */
interface EventFacts {
  teamCount: number
  venueCount: number
  followerCount: number
  gameCount: number
  playedCount: number
  /** The primary venue's names, or the first one, or null where none is set. */
  venueNames: Record<string, string> | null
  /** Every division teams have entered in, deduplicated. */
  divisionNames: Record<string, string>[]
}

const EMPTY: EventFacts = {
  teamCount: 0,
  venueCount: 0,
  followerCount: 0,
  gameCount: 0,
  playedCount: 0,
  venueNames: null,
  divisionNames: [],
}

async function factsFor(db: Db, eventIds: string[]): Promise<Map<string, EventFacts>> {
  const facts = new Map<string, EventFacts>()
  if (eventIds.length === 0) return facts
  for (const id of eventIds) facts.set(id, { ...EMPTY, divisionNames: [] })
  const at = (id: string) => facts.get(id)!

  const [teams, venues, followers, games] = await Promise.all([
    db
      .select({
        eventId: schema.eventTeam.eventId,
        teamId: schema.eventTeam.teamId,
        divisionId: schema.eventTeam.divisionId,
        divisionNames: schema.division.names,
      })
      .from(schema.eventTeam)
      .innerJoin(schema.division, eq(schema.division.id, schema.eventTeam.divisionId))
      .where(inArray(schema.eventTeam.eventId, eventIds))
      .all(),
    db
      .select({
        eventId: schema.eventVenue.eventId,
        isPrimary: schema.eventVenue.isPrimary,
        names: schema.venue.names,
      })
      .from(schema.eventVenue)
      .innerJoin(schema.venue, eq(schema.venue.id, schema.eventVenue.venueId))
      .where(inArray(schema.eventVenue.eventId, eventIds))
      .all(),
    db
      .select({ objectId: schema.subscription.objectId, n: count() })
      .from(schema.subscription)
      .where(
        and(
          eq(schema.subscription.objectTypeCode, "EVENT"),
          inArray(schema.subscription.objectId, eventIds),
        ),
      )
      .groupBy(schema.subscription.objectId)
      .all(),
    db
      .select({
        eventId: schema.game.eventId,
        statusCode: schema.game.statusCode,
        n: count(),
      })
      .from(schema.game)
      .where(inArray(schema.game.eventId, eventIds))
      .groupBy(schema.game.eventId, schema.game.statusCode)
      .all(),
  ])

  // A team entered in two divisions is one team. The unique index is on
  // (event, team, division), so counting rows would say otherwise.
  const seenTeams = new Set<string>()
  const seenDivisions = new Set<string>()
  for (const row of teams) {
    const f = at(row.eventId)
    if (!seenTeams.has(`${row.eventId}|${row.teamId}`)) {
      seenTeams.add(`${row.eventId}|${row.teamId}`)
      f.teamCount += 1
    }
    if (!seenDivisions.has(`${row.eventId}|${row.divisionId}`)) {
      seenDivisions.add(`${row.eventId}|${row.divisionId}`)
      f.divisionNames.push(row.divisionNames as Record<string, string>)
    }
  }

  for (const row of venues) {
    const f = at(row.eventId)
    f.venueCount += 1
    // The primary one wins; otherwise the first seen, so a single unflagged
    // venue still names the place rather than reading "Venue TBC".
    if (row.isPrimary || !f.venueNames) f.venueNames = row.names as Record<string, string>
  }

  for (const row of followers) at(row.objectId).followerCount = row.n

  for (const row of games) {
    const f = at(row.eventId)
    f.gameCount += row.n
    // Played means finished. A game in progress is not a result yet, which is
    // the distinction "3 / 12 played" is making.
    if (row.statusCode === "FINISHED") f.playedCount += row.n
  }

  return facts
}

function load(db: Db) {
  return db.query.event.findMany({
    with: { organizer: { columns: { name: true } } },
    orderBy: (event, { asc, sql }) => [sql`${event.startDate} IS NULL`, asc(event.startDate)],
  })
}

/**
 * The stored row, as the contract declares it.
 *
 * The two casts are the price of `type_code`/`format_code` being TEXT columns: the
 * database cannot express a vocabulary to the type system, so the enum lives
 * at the boundary. Values are constrained on the way in by the input schemas
 * and by the foreign keys migration 0009 added.
 */
async function serialize(
  db: Db,
  user: SessionUser | null,
  row: typeof schema.event.$inferSelect & { organizer?: { name: string } | null },
  facts: EventFacts = EMPTY,
): Promise<ApiEvent> {
  const { organizer, createdAt, updatedAt, typeCode, formatCode, ...rest } = row
  return {
    ...rest,
    typeCode,
    formatCode,
    organizerName: organizer?.name ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    // One `can` per event, the same honest cost games pays for a per-game
    // permission. A list of a few dozen is a few dozen extra reads; a season of
    // thousands would not be, and the fix then is to answer it in one query —
    // the relations are all derivable in SQL — not to move the decision into
    // the client.
    canEdit: await can(db, "EDIT_EVENT", user, row.id),
    // Not the same grant, and deliberately asked separately — see the note on
    // the schema field.
    canInviteCoOrganizer: await can(db, "INVITE_CO_ORGANIZER", user, row.id),
    // Nor this one: OWNER and PLATFORM_ADMIN, where EDIT_EVENT also admits
    // CO_ORGANIZER.
    canDelete: await can(db, "DELETE_EVENT", user, row.id),
    ...facts,
  }
}

export const list = viewer
  .use(openTo("BROWSE_EVENTS"))
  .route({ method: "GET", path: "/events", summary: "List all events" })
  /**
   * `canCreate` sits on the list rather than on an event, because the thing it
   * describes has no event yet: `CREATE_EVENT` is a PLATFORM action, granted to
   * ANY_ORGANIZER and PLATFORM_ADMIN with no object to be in a relation to.
   *
   * Same shape as `orgs.get`'s `canCreateTeam`, and here for the same reason —
   * the admin console decided this from a role table copied into the client,
   * which is a second answer to a question the model already answers.
   */
  .output(z.object({ events: z.array(EventSchema), canCreate: z.boolean() }))
  .handler(async ({ context }) => {
    const rows = await load(context.db)
    const facts = await factsFor(
      context.db,
      rows.map((r) => r.id),
    )
    return {
      events: await Promise.all(
        rows.map((row) => serialize(context.db, context.user, row, facts.get(row.id))),
      ),
      canCreate: await can(context.db, "CREATE_EVENT", context.user, null),
    }
  })

export const get = viewer
  .use(openTo("VIEW_EVENT"))
  .route({ method: "GET", path: "/events/{id}", summary: "Get one event" })
  .input(IdInput)
  .output(EventSchema)
  .handler(async ({ context, input }) => {
    const row = found(
      await context.db.query.event.findFirst({
        where: (event, { eq: is }) => is(event.id, input.id),
        with: { organizer: { columns: { name: true } } },
      }),
    )
    const facts = await factsFor(context.db, [row.id])
    return serialize(context.db, context.user, row, facts.get(row.id))
  })

/**
 * ISO day strings compare correctly as plain strings.
 *
 * Takes the error factory rather than throwing its own, because a defined error
 * belongs to the procedure that declared it — that is what puts the code in the
 * contract and lets the page render the sentence in the reader's language.
 */
function assertDateOrder(
  raise: () => Error,
  start?: string | null,
  end?: string | null,
) {
  if (start && end && end < start) throw raise()
}

export const create = authed
  .route({ method: "POST", path: "/events", summary: "Create an event", successStatus: 201, ...authedRoute })
  .input(CreateEventInput)
  .output(EventSchema)
  .use(requireAction("CREATE_EVENT"))
  .errors({ BAD_DATE_RANGE: ERRORS.BAD_DATE_RANGE })
  .handler(async ({ context, input, errors }) => {
    assertDateOrder(errors.BAD_DATE_RANGE, input.startDate, input.endDate)
    const now = new Date()
    const names = clean(input.names)
    const row = {
      ...input,
      id: crypto.randomUUID(),
      names,
      name: pivot(names)!, // the input schema guarantees one
      formatCode: input.formatCode ?? "5x5",
      description: input.description ?? null,
      // A single-day event needs only startDate; end defaults to the same day.
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? input.startDate ?? null,
      cityCode: input.cityCode ?? null,
      provinceCode: input.provinceCode ?? null,
      // The organiser's own zone unless they say otherwise — someone in Bangkok
      // scheduling a Bangkok tournament should not have to fill this in. Null
      // where the edge did not say, which the schedule renders as "no venue
      // clock" rather than as a zone nobody chose.
      timezone: input.timezone ?? viewerTimezone(context.request),
      isFibaCertified: input.isFibaCertified ?? false,
      // Whose event this is, as a person. `orgId` stays null here: creating an
      // event does not make it the creator's school's, and nothing in the input
      // says which organisation it belongs to. The fixtures set it where the PO
      // says an org runs the event.
      orgId: null,
      organizerUserId: context.user.id,
      createdAt: now,
      updatedAt: now,
    }
    await context.db.insert(schema.event).values(row)
    // The creator is the organizer, so the display name needs no round trip.
    return serialize(context.db, context.user, {
      ...row,
      organizer: context.user.name ? { name: context.user.name } : null,
    })
  })

export const update = authed
  .route({ method: "PUT", path: "/events/{id}", summary: "Update an event", ...authedRoute })
  .input(IdInput.extend(UpdateEventInput.shape))
  .output(EventSchema)
  .use(requireAction("EDIT_EVENT"))
  .errors({ BAD_DATE_RANGE: ERRORS.BAD_DATE_RANGE })
  .handler(async ({ context, input, errors }) => {
    const { id, names, ...columns } = input
    const existing = await context.db
      .select()
      .from(schema.event)
      .where(eq(schema.event.id, id))
      .get()
    if (!existing) throw new ORPCError("NOT_FOUND", { message: "Not found" })

    // Validate against the merged row, not the patch: sending only endDate must
    // still be checked against the startDate already stored.
    assertDateOrder(
      errors.BAD_DATE_RANGE,
      columns.startDate ?? existing.startDate,
      columns.endDate ?? existing.endDate,
    )

    await context.db
      .update(schema.event)
      // The pivot moves with the names, so `name` never goes stale against
      // them — it is derived, not separately editable.
      .set({
        ...columns,
        ...(names ? { names: clean(names), name: pivot(names) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.event.id, id))

    const row = found(
      await context.db.query.event.findFirst({
        where: (event, { eq: is }) => is(event.id, id),
        with: { organizer: { columns: { name: true } } },
      }),
    )
    // With the facts, not without. `serialize` defaults them to zero, so an
    // update used to answer with `teamCount: 0` for an event with fifteen
    // teams — invisible on screen because the client refetches, and wrong in
    // the response an API consumer would read.
    const facts = await factsFor(context.db, [row.id])
    return serialize(context.db, context.user, row, facts.get(row.id))
  })

export const remove = authed
  .route({ method: "DELETE", path: "/events/{id}", summary: "Delete an event", ...authedRoute })
  .input(IdInput)
  .output(z.object({ deleted: z.boolean() }))
  .use(requireAction("DELETE_EVENT"))
  .handler(async ({ context, input }) => {
    await context.db.delete(schema.event).where(eq(schema.event.id, input.id))
    return { deleted: true }
  })

/**
 * Add a co-organizer to an event.
 *
 * `INVITE_CO_ORGANIZER` is granted to `OWNER` and `PLATFORM_ADMIN`, and the row
 * this writes *is* the `CO_ORGANIZER` relation — `event_co_organizers.user_id`
 * is what the model's `CO_ORGANIZER` derives it from. So adding one here is what makes
 * `EDIT_EVENT` reachable for anybody but the owner, which the PO's matrix has
 * always granted and this repo could not honour because nothing created the
 * tuple.
 *
 * **The PO's model also has `ACCEPT_CO_ORGANIZER_INVITE`, granted to
 * `ANY_SIGNED_IN`, and there is nothing here to accept.** `event_co_organizers`
 * carries `event_id`, `user_id` and `added_at` — no pending state, no status.
 * Either the action is vestigial or the table needs a state the fixtures do not
 * model, and that is the PO's call rather than a column to invent here. Until
 * then this adds directly, which is exactly what the data describes.
 */
export const addCoOrganizer = authed
  .route({
    method: "POST",
    path: "/events/{id}/co-organizers",
    summary: "Add a co-organizer to an event",
    successStatus: 201,
    ...authedRoute,
  })
  /**
   * By email or by id, exactly one — the same shape `orgs.addMember` takes, and
   * for the same reason.
   *
   * An id is unusable from a screen: nobody knows another person's id, and the
   * only way to offer one would be a searchable directory of everybody on the
   * platform, which is a privacy surface this product should not grow to power
   * an invite box. An email is what an organiser actually has.
   *
   * It reveals nothing the id form did not — that path already answers "Unknown
   * user" for an id that does not exist — and it is reachable only by someone
   * who already holds INVITE_CO_ORGANIZER on this event.
   */
  .input(
    IdInput.extend({
      userId: z.string().optional(),
      email: z.string().email().optional(),
    }).refine((v) => Boolean(v.userId) !== Boolean(v.email), {
      message: "Give either userId or email, not both",
    }),
  )
  .output(z.object({ eventId: z.string(), userId: z.string(), addedAt: z.string() }))
  .use(requireAction("INVITE_CO_ORGANIZER"))
  .errors({ UNKNOWN_USER: ERRORS.UNKNOWN_USER })
  .handler(async ({ context, input, errors }) => {
    // The FK would refuse an unknown user, but a 404 says which one was wrong.
    const invitee = await context.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(input.userId ? eq(schema.user.id, input.userId) : eq(schema.user.email, input.email!))
      .get()
    if (!invitee) throw errors.UNKNOWN_USER()

    const addedAt = new Date().toISOString().slice(0, 10)
    // PENDING, not ACCEPTED. CO_ORGANIZER filters on ACCEPTED, so this grants
    // nothing until the invitee takes it up — which is what the PO's separate
    // ACCEPT_CO_ORGANIZER_INVITE action is for.
    //
    // Idempotent: eventCoOrganizer_key is unique on (event_id, user_id), so
    // re-inviting is a no-op rather than a second tuple — and it must not reset
    // someone who has already accepted back to pending.
    await context.db
      .insert(schema.eventCoOrganizer)
      .values({ eventId: input.id, userId: invitee.id, addedAt, statusCode: "PENDING" })
      .onConflictDoNothing()

    return { eventId: input.id, userId: invitee.id, addedAt }
  })

/**
 * The invitations waiting for you.
 *
 * `addCoOrganizer` writes a PENDING row and `acceptCoOrganizerInvite` turns it
 * into an ACCEPTED one, and between those two there was nothing — no way for
 * the invitee to learn they had been invited. The fixtures seed a pending
 * invitation, so the state was reachable on a fresh database and unreachable
 * from the app: a person could be given an event to co-organise and never find
 * out, which makes the invite half of the feature decorative.
 *
 * Scoped to `context.user.id` in the query rather than by an object-level
 * relation, for the same reason accepting is: an invitee is by definition not
 * yet in any relation to the event. `ACCEPT_CO_ORGANIZER_INVITE` is the action
 * because this list is exactly "what may I accept" — the same permission,
 * asked in the plural.
 */
export const invitations = authed
  .route({
    method: "GET",
    path: "/events/invitations",
    summary: "Events I have been invited to co-organise",
    ...authedRoute,
  })
  .output(
    z.object({
      invitations: z.array(
        z.object({
          eventId: z.string(),
          /** The model's names, for the client to resolve to the reader's locale. */
          names: z.record(z.string(), z.string()),
          name: z.string(),
          addedAt: z.string(),
        }),
      ),
    }),
  )
  .use(requireAction("ACCEPT_CO_ORGANIZER_INVITE"))
  .handler(async ({ context }) => ({
    invitations: (
      await context.db
        .select({
          eventId: schema.eventCoOrganizer.eventId,
          names: schema.event.names,
          name: schema.event.name,
          addedAt: schema.eventCoOrganizer.addedAt,
        })
        .from(schema.eventCoOrganizer)
        .innerJoin(schema.event, eq(schema.event.id, schema.eventCoOrganizer.eventId))
        .where(
          and(
            eq(schema.eventCoOrganizer.userId, context.user.id),
            // Outstanding only. An accepted invitation is not a thing to act
            // on — it is an event that now appears under "Your events".
            eq(schema.eventCoOrganizer.statusCode, "PENDING"),
          ),
        )
        .all()
    ).map((r) => ({ ...r, names: r.names as Record<string, string> })),
  }))

/**
 * Take up an invitation to co-organise an event.
 *
 * Granted to `ANY_SIGNED_IN`, because the invitee is by definition not yet in
 * any relation to the event — that is the whole point of the pending state, and
 * why this cannot be scoped the way every other event action is. What stands in
 * for the missing relation is the row: you may only accept an invitation
 * addressed to you.
 */
export const acceptCoOrganizerInvite = authed
  .route({
    method: "POST",
    path: "/events/{id}/co-organizers/accept",
    summary: "Accept an invitation to co-organise an event",
    ...authedRoute,
  })
  .input(IdInput)
  .output(z.object({ eventId: z.string(), userId: z.string(), statusCode: z.string() }))
  .use(requireAction("ACCEPT_CO_ORGANIZER_INVITE"))
  .errors({ NO_INVITATION: ERRORS.NO_INVITATION })
  .handler(async ({ context, input, errors }) => {
    const res = await context.db
      .update(schema.eventCoOrganizer)
      .set({ statusCode: "ACCEPTED" })
      .where(
        and(
          eq(schema.eventCoOrganizer.eventId, input.id),
          eq(schema.eventCoOrganizer.userId, context.user.id),
        ),
      )
    // No invitation for this person on this event. A 404 rather than a 403:
    // there is nothing here to be forbidden from.
    if (res.meta.changes === 0) throw errors.NO_INVITATION()
    return { eventId: input.id, userId: context.user.id, statusCode: "ACCEPTED" }
  })
