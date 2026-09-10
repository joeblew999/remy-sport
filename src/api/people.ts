/**
 * The names of the people on this platform.
 *
 * Lifted out of `meetings` when the Product Owner asked whether the meeting
 * invite picker could be reused wherever a user has to be chosen. It could, and
 * the moment a second caller wanted it the name `meetings.people` was wrong: an
 * organisation adding a member is not holding a meeting.
 *
 * It returns an id and a name and nothing else — no address, no role, no
 * status. That is what a picker needs and the whole of what this exposes.
 *
 */

import { ne } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema"
import { authed, authedRoute, infrastructure } from "./base"

export const list = authed
  /**
   * Declared as infrastructure with its reason, rather than gated on an action.
   *
   * There is no narrower relation to check and it would be dishonest to invent
   * one: the Product Owner's rule for meetings is that anyone may ask anyone, so
   * "who may see the list of names" is every signed-in reader by construction.
   * Naming it here rather than borrowing `CREATE_MEETING` keeps the second
   * caller — an organisation adding a member — from being gated on an action it
   * has nothing to do with.
   */
  .use(infrastructure("the names of accounts, so any form that has to name a person can offer them; no address, role or status is returned, and the model places no restriction on who may be picked"))
  .route({ method: "GET", path: "/people", summary: "People you can choose from", ...authedRoute })
  .output(z.object({ people: z.array(z.object({ id: z.string(), name: z.string() })) }))
  .handler(async ({ context }) => {
    const rows = await context.db
      .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
      .from(schema.user)
      .where(ne(schema.user.id, context.user.id))
    return { people: rows.map((r) => ({ id: r.id, name: r.name || r.email })) }
  })
