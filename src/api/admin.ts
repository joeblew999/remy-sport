/**
 * What a platform administrator does to accounts.
 *
 * The model has four Admin actions and none of them existed. This is the first,
 * and it is here rather than in a `users.ts` because the other three —
 * `MANAGE_ALL_USERS`, `MODERATE_LISTINGS`, `CREATE_USER_ACCOUNT` — belong beside
 * it when they arrive.
 *
 * Account *reads* stay with Better Auth's admin plugin, which the console
 * already calls: `/api/auth/admin/list-users` returns the row including
 * `statusCode`, because auth.config.ts declares it as an additional field. This
 * file is for the decisions the Product Owner's model owns, not for restating
 * what the plugin already does.
 */

import { eq } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema"
import { authed, authedRoute, found, requireAction } from "./base"
import { ERRORS } from "./errors"
import { STORED_ROLE } from "../domain/vocabularies"

/**
 * Approving a referee who signed up and has been waiting.
 *
 * `PENDING_APPROVAL` has been a real state since migration 0008 and nothing
 * could leave it. A referee signs up, *can* sign in — that is deliberate, and
 * src/auth.config.ts says why: "a referee awaiting approval has an account and
 * needs to see that they are waiting" — and then waits forever, because
 * `APPROVE_REFEREE` was granted to PLATFORM_ADMIN and had no endpoint.
 *
 * ## Why it refuses anyone who is not a pending referee
 *
 * The model grants "approve a referee", not "set any account's status". A
 * handler taking a status would be a strictly larger power than the action it
 * is named for, and the first caller to pass DEACTIVATED would be using an
 * admin's approval right to disable somebody. The narrow version is the one the
 * model actually describes.
 *
 * Approving an already-active account is refused for the same reason rather
 * than treated as a no-op: it means the caller believed something false about
 * the account, and saying so is more useful than a silent 200.
 */
export const approveReferee = authed
  .route({
    method: "POST",
    path: "/admin/referees/{id}/approve",
    summary: "Approve a referee who is awaiting approval",
    ...authedRoute,
  })
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string(), statusCode: z.string() }))
  .errors({ UNKNOWN_USER: ERRORS.UNKNOWN_USER, NOT_A_REFEREE: ERRORS.NOT_A_REFEREE })
  // A PLATFORM action: the grant is PLATFORM_ADMIN with no relation to the
  // account, so there is no object to resolve.
  .use(requireAction("APPROVE_REFEREE"))
  .handler(async ({ context, input, errors }) => {
    const row = found(
      await context.db
        .select({ id: schema.user.id, role: schema.user.role, statusCode: schema.user.statusCode })
        .from(schema.user)
        .where(eq(schema.user.id, input.id))
        .get(),
    )

    // "Referee" is the platform role, stored as Better Auth holds it. Compared
    // through the same map the relation resolver uses rather than a literal,
    // which is what kept the two forms from drifting when this was written.
    if (row.role !== STORED_ROLE.REFEREE) throw errors.NOT_A_REFEREE()
    if (row.statusCode !== "PENDING_APPROVAL") {
      throw errors.NOT_A_REFEREE({
        message: "That account is not awaiting approval.",
      })
    }

    await context.db
      .update(schema.user)
      .set({ statusCode: "ACTIVE" })
      .where(eq(schema.user.id, input.id))

    return { id: row.id, statusCode: "ACTIVE" }
  })
