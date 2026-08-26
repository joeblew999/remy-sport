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
import { eq } from "drizzle-orm"
import * as schema from "../db/schema"
import type { ApiEvent } from "../domain/api"
import { clean, pivot } from "../domain/names"
import { z } from "zod"
import { CreateEventInput, EventSchema, UpdateEventInput } from "../domain/api"
import { authed, authedRoute, pub, requireOwner, requirePermission, type Db } from "./base"

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
    throw new ORPCError("BAD_REQUEST", { message: "endDate must be on or after startDate" })
  }
}

export const create = authed
  .route({ method: "POST", path: "/events", summary: "Create an event", successStatus: 201, ...authedRoute })
  .input(CreateEventInput)
  .output(EventSchema)
  .use(requirePermission("event", "create"))
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
      createdBy: context.user.id,
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
  .use(requirePermission("event", "update"))
  .use(requireOwner())
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
  .use(requirePermission("event", "delete"))
  .use(requireOwner())
  .handler(async ({ context, input }) => {
    await context.db.delete(schema.event).where(eq(schema.event.id, input.id))
    return { deleted: true }
  })
