/**
 * Organisations — schools, clubs and federations.
 *
 * Reading is public; the three writes are granted to `ORG_OWNER`, `ORG_ADMIN`
 * and `PLATFORM_ADMIN`. Those relations derive from the membership table, so who
 * may edit a school is a fact about its staff rather than a rule in this file.
 *
 * There is no accept step for a membership, deliberately: the Product Owner
 * models `INVITE_ORG_MEMBER` and `REMOVE_ORG_MEMBER` and no accept action, so
 * being invited to a school *is* being in it. A co-organizer invitation has an
 * accept because the model has one for that.
 */

import { ORPCError } from "@orpc/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema"
import { OrgSchema, UpdateOrgInput } from "../domain/api"
import { clean } from "../domain/names"
import { ORG_ROLE_CODES, STORED_ORG_ROLE } from "../domain/vocabularies"
import { authed, authedRoute, pub, requireAction } from "./base"

const IdInput = z.object({ id: z.string() })

export const list = pub
  .route({ method: "GET", path: "/orgs", summary: "List organisations" })
  .output(z.object({ orgs: z.array(OrgSchema) }))
  .handler(async ({ context }) => ({
    orgs: await context.db.query.org.findMany({ orderBy: (o, { asc }) => [asc(o.slug)] }),
  }))

export const get = pub
  .route({ method: "GET", path: "/orgs/{id}", summary: "Get one organisation" })
  .input(IdInput)
  .output(OrgSchema)
  .handler(async ({ context, input }) => {
    const row = await context.db.query.org.findFirst({ where: (o, { eq: is }) => is(o.id, input.id) })
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return row
  })

export const update = authed
  .route({ method: "PUT", path: "/orgs/{id}", summary: "Edit an organisation profile", ...authedRoute })
  .input(IdInput.extend(UpdateOrgInput.shape))
  .output(OrgSchema)
  .use(requireAction("EDIT_ORG_PROFILE"))
  .handler(async ({ context, input }) => {
    const { id, names, ...columns } = input
    await context.db
      .update(schema.org)
      .set({ ...columns, ...(names ? { names: clean(names) } : {}) })
      .where(eq(schema.org.id, id))

    const row = await context.db.query.org.findFirst({ where: (o, { eq: is }) => is(o.id, id) })
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return row
  })

/**
 * Membership rows live in Better Auth's `member` table, which is where the
 * `ORG_OWNER`/`ORG_ADMIN` relations derive from — so this writes the tuple those
 * relations read, and the role has to be stored the way that library stores it.
 */
export const addMember = authed
  .route({
    method: "POST",
    path: "/orgs/{id}/members",
    summary: "Add someone to an organisation",
    successStatus: 201,
    ...authedRoute,
  })
  .input(IdInput.extend({ userId: z.string(), orgRoleCode: z.enum(ORG_ROLE_CODES).optional() }))
  .output(z.object({ orgId: z.string(), userId: z.string(), role: z.string() }))
  .use(requireAction("INVITE_ORG_MEMBER"))
  .handler(async ({ context, input }) => {
    const person = await context.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, input.userId))
      .get()
    if (!person) throw new ORPCError("NOT_FOUND", { message: "Unknown user" })

    // The PO says ADMIN; the column holds admin. One mapping, generated.
    const role = STORED_ORG_ROLE[input.orgRoleCode ?? "MEMBER"]
    await context.db
      .insert(schema.member)
      .values({
        id: `mem_${input.id}_${input.userId}`,
        organizationId: input.id,
        userId: input.userId,
        role,
        createdAt: new Date(),
      })
      .onConflictDoNothing()

    return { orgId: input.id, userId: input.userId, role }
  })

export const removeMember = authed
  .route({
    method: "DELETE",
    path: "/orgs/{id}/members/{userId}",
    summary: "Remove someone from an organisation",
    ...authedRoute,
  })
  .input(IdInput.extend({ userId: z.string() }))
  .output(z.object({ removed: z.string() }))
  .use(requireAction("REMOVE_ORG_MEMBER"))
  .handler(async ({ context, input }) => {
    const res = await context.db
      .delete(schema.member)
      .where(
        and(eq(schema.member.organizationId, input.id), eq(schema.member.userId, input.userId)),
      )
    if (res.meta.changes === 0) throw new ORPCError("NOT_FOUND", { message: "Not a member" })
    return { removed: input.userId }
  })
