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
import { and, eq } from "drizzle-orm"
import * as schema from "../db/schema"
import type { ApiEvent } from "../domain/api"
import { clean, pivot } from "../domain/names"
import { z } from "zod"
import { CreateEventInput, EventSchema, UpdateEventInput } from "../domain/api"
import { ERRORS } from "./errors"
import { authed, authedRoute, pub, requireAction, type Db } from "./base"

const IdInput = z.object({ id: z.string() })

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
function serialize(row: typeof schema.event.$inferSelect & {
  organizer?: { name: string } | null
}): ApiEvent {
  const { organizer, createdAt, updatedAt, typeCode, formatCode, ...rest } = row
  return {
    ...rest,
    typeCode,
    formatCode,
    organizerName: organizer?.name ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  }
}

export const list = pub
  .route({ method: "GET", path: "/events", summary: "List all events" })
  .output(z.object({ events: z.array(EventSchema) }))
  .handler(async ({ context }) => ({
  events: (await load(context.db)).map(serialize),
}))

export const get = pub
  .route({ method: "GET", path: "/events/{id}", summary: "Get one event" })
  .input(IdInput)
  .output(EventSchema)
  .handler(async ({ context, input }) => {
    const row = await context.db.query.event.findFirst({
      where: (event, { eq: is }) => is(event.id, input.id),
      with: { organizer: { columns: { name: true } } },
    })
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return serialize(row)
  })

/** ISO day strings compare correctly as plain strings. */
function assertDateOrder(start?: string | null, end?: string | null) {
  if (start && end && end < start) {
    throw new ORPCError("BAD_REQUEST", { message: ERRORS.BAD_DATE_RANGE.message })
  }
}

export const create = authed
  .route({ method: "POST", path: "/events", summary: "Create an event", successStatus: 201, ...authedRoute })
  .input(CreateEventInput)
  .output(EventSchema)
  .use(requireAction("CREATE_EVENT"))
  .handler(async ({ context, input }) => {
    assertDateOrder(input.startDate, input.endDate)
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
      isFibaCertified: input.isFibaCertified ?? false,
      organizerUserId: context.user.id,
      createdAt: now,
      updatedAt: now,
    }
    await context.db.insert(schema.event).values(row)
    // The creator is the organizer, so the display name needs no round trip.
    return serialize({ ...row, organizer: context.user.name ? { name: context.user.name } : null })
  })

export const update = authed
  .route({ method: "PUT", path: "/events/{id}", summary: "Update an event", ...authedRoute })
  .input(IdInput.extend(UpdateEventInput.shape))
  .output(EventSchema)
  .use(requireAction("EDIT_EVENT"))
  .handler(async ({ context, input }) => {
    const { id, names, ...columns } = input
    const existing = await context.db
      .select()
      .from(schema.event)
      .where(eq(schema.event.id, id))
      .get()
    if (!existing) throw new ORPCError("NOT_FOUND", { message: "Not found" })

    // Validate against the merged row, not the patch: sending only endDate must
    // still be checked against the startDate already stored.
    assertDateOrder(columns.startDate ?? existing.startDate, columns.endDate ?? existing.endDate)

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

    const row = await context.db.query.event.findFirst({
      where: (event, { eq: is }) => is(event.id, id),
      with: { organizer: { columns: { name: true } } },
    })
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return serialize(row)
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
  .input(IdInput.extend({ userId: z.string() }))
  .output(z.object({ eventId: z.string(), userId: z.string(), addedAt: z.string() }))
  .use(requireAction("INVITE_CO_ORGANIZER"))
  .errors({ UNKNOWN_USER: ERRORS.UNKNOWN_USER })
  .handler(async ({ context, input, errors }) => {
    // The FK would refuse an unknown user, but a 404 says which id was wrong.
    const invitee = await context.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, input.userId))
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
      .values({ eventId: input.id, userId: input.userId, addedAt, statusCode: "PENDING" })
      .onConflictDoNothing()

    return { eventId: input.id, userId: input.userId, addedAt }
  })

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
