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
import { ORG_ROLE_CODES } from "../domain/vocabularies"
import { ERRORS } from "./errors"
import { authed, authedRoute, can, openTo, pub, requireAction, viewer } from "./base"

const IdInput = z.object({ id: z.string() })

export const list = pub
  .use(openTo("VIEW_ORG"))
  .route({ method: "GET", path: "/orgs", summary: "List organisations" })
  .output(z.object({ orgs: z.array(OrgSchema) }))
  .handler(async ({ context }) => ({
    orgs: await context.db.query.org.findMany({ orderBy: (o, { asc }) => [asc(o.slug)] }),
  }))

/**
 * `canEdit` is the server answering "may you", so the page does not guess.
 *
 * Without it the profile form was offered to everyone and 403'd on save for
 * anyone who was not an owner or admin — a control that cannot work. The
 * alternative was for the client to check the viewer's role, which is a second
 * copy of the access matrix and the exact drift `requireAction` exists to
 * remove. `viewer` rather than `pub` because the answer depends on who asks;
 * for a stranger it is simply false.
 */
export const get = viewer
  .use(openTo("VIEW_ORG"))
  .route({ method: "GET", path: "/orgs/{id}", summary: "Get one organisation" })
  .input(IdInput)
  .output(OrgSchema.extend({ canEdit: z.boolean(), canCreateTeam: z.boolean() }))
  .handler(async ({ context, input }) => {
    const row = await context.db.query.org.findFirst({ where: (o, { eq: is }) => is(o.id, input.id) })
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return {
      ...row,
      canEdit: await can(context.db, "EDIT_ORG_PROFILE", context.user, input.id),
      /**
       * A *platform* grant, answered here because this is the page that needs
       * it.
       *
       * `CREATE_TEAM` is granted to ANY_COACH with no relation to any
       * organisation — the PO's model says a coach may create a team, full
       * stop, and the org is chosen on the form rather than earned. So the
       * object id is null and this is not "may you create a team *here*".
       *
       * It sits on the org because the only screen that creates a team is the
       * one that already knows which school it is for. A viewer-capabilities
       * endpoint would be the tidier home and would exist to answer one
       * question.
       */
      canCreateTeam: await can(context.db, "CREATE_TEAM", context.user, null),
    }
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
 * Who is in an organisation.
 *
 * Gated on `INVITE_ORG_MEMBER` rather than the public `VIEW_ORG`, and the choice
 * is worth stating because the Product Owner's model does not make it: there is
 * no `VIEW_ORG_MEMBERS` action. Reading an organisation's *profile* is public;
 * its roster is a list of people's email addresses, so it is not. The smallest
 * defensible rule that uses an action the model already defines is "whoever may
 * add and remove members may see them" — ORG_OWNER, ORG_ADMIN, PLATFORM_ADMIN.
 *
 * If the PO wants ordinary members to see each other, that is a new action in
 * the model, not a change here.
 */
export const members = authed
  .route({ method: "GET", path: "/orgs/{id}/members", summary: "List an organisation's members", ...authedRoute })
  .input(IdInput)
  .output(
    z.object({
      members: z.array(
        z.object({
          userId: z.string(),
          email: z.string(),
          name: z.string().nullable(),
          orgRoleCode: z.enum(ORG_ROLE_CODES),
        }),
      ),
    }),
  )
  .use(requireAction("INVITE_ORG_MEMBER"))
  .handler(async ({ context, input }) => ({
    members: await context.db
      .select({
        userId: schema.orgMember.userId,
        email: schema.user.email,
        name: schema.user.name,
        orgRoleCode: schema.orgMember.orgRoleCode,
      })
      .from(schema.orgMember)
      .innerJoin(schema.user, eq(schema.user.id, schema.orgMember.userId))
      .where(eq(schema.orgMember.orgId, input.id))
      .orderBy(schema.user.email)
      .all(),
  }))

/**
 * Writes the tuple the `ORG_OWNER`/`ORG_ADMIN` relations read.
 *
 * `org_member` is ours, with the Product Owner's own column names and role
 * codes. It was Better Auth's `member` table until the organization plugin was
 * removed, which is why this used to need a role-casing translation.
 *
 * Takes `email` **or** `userId`. A person adding a coach to a school knows the
 * address they signed up with, not the id — a GUI that demanded the id would
 * only be usable by someone reading the database. This is an exact-match lookup
 * by someone who already holds `INVITE_ORG_MEMBER` on this organisation, and it
 * reveals nothing the `userId` form did not: that path already answers "Unknown
 * user" for an id that does not exist.
 */
export const addMember = authed
  .route({
    method: "POST",
    path: "/orgs/{id}/members",
    summary: "Add someone to an organisation",
    successStatus: 201,
    ...authedRoute,
  })
  .input(
    IdInput.extend({
      userId: z.string().optional(),
      email: z.string().email().optional(),
      orgRoleCode: z.enum(ORG_ROLE_CODES).optional(),
    }).refine((v) => Boolean(v.userId) !== Boolean(v.email), {
      message: "Give either userId or email, not both",
    }),
  )
  .errors({ UNKNOWN_USER: ERRORS.UNKNOWN_USER })
  .output(z.object({ orgId: z.string(), userId: z.string(), role: z.enum(ORG_ROLE_CODES) }))
  .use(requireAction("INVITE_ORG_MEMBER"))
  .handler(async ({ context, input, errors }) => {
    const person = await context.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(input.userId ? eq(schema.user.id, input.userId) : eq(schema.user.email, input.email!))
      .get()
    if (!person) throw errors.UNKNOWN_USER()

    // The PO says ADMIN; the column holds admin. One mapping, generated.
    const orgRoleCode = input.orgRoleCode ?? "MEMBER"
    await context.db
      .insert(schema.orgMember)
      .values({ orgId: input.id, userId: person.id, orgRoleCode })
      .onConflictDoNothing()

    return { orgId: input.id, userId: person.id, role: orgRoleCode }
  })

export const removeMember = authed
  .route({
    method: "DELETE",
    path: "/orgs/{id}/members/{userId}",
    summary: "Remove someone from an organisation",
    ...authedRoute,
  })
  .input(IdInput.extend({ userId: z.string() }))
  .errors({ NOT_A_MEMBER: ERRORS.NOT_A_MEMBER })
  .output(z.object({ removed: z.string() }))
  .use(requireAction("REMOVE_ORG_MEMBER"))
  .handler(async ({ context, input, errors }) => {
    const res = await context.db
      .delete(schema.orgMember)
      .where(
        and(eq(schema.orgMember.orgId, input.id), eq(schema.orgMember.userId, input.userId)),
      )
    if (res.meta.changes === 0) throw errors.NOT_A_MEMBER()
    return { removed: input.userId }
  })
