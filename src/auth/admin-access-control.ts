import { createAccessControl } from "better-auth/plugins/access"
import {
  defaultStatements as adminDefaultStatements,
  adminAc as pluginAdminAc,
} from "better-auth/plugins/admin/access"

/**
 * Access control for **platform administration** — managing user accounts and
 * their sessions. A third scope, alongside the two in ADR 009.
 *
 * | Scope | Question | Vocabulary |
 * |---|---|---|
 * | Platform (access-control.ts) | what kind of actor is this? | event, team, player, score… |
 * | Organization (org-access-control.ts) | their standing in one org? | organization, member, invitation |
 * | Admin (here) | may they administer accounts? | user, session |
 *
 * ADR 007 passed the *domain* ac/roles to `admin()`, exactly as it did to
 * `organization()`, and it broke the plugin the same way ADR 009 describes:
 * supplying custom roles replaces the plugin's own, so the seeded admin held
 * none of the plugin's permissions. Every admin endpoint answered
 * "You are not allowed to list users" — which nothing noticed, because nothing
 * called one until the admin console needed them.
 *
 * Merging the two statement sets was the obvious fix and is wrong. The plugin
 * declares `user` and `session`, and **both names are already taken** in
 * access-control.ts: `user: ["manage"]` is a domain notion, and `session` there
 * means a *camp session* — a coaching event on a timetable — not an auth
 * session. Merging would quietly make "may define a camp session" and "may
 * revoke someone's login" the same permission. Separate controllers keep the
 * two vocabularies from colliding, which is the same reason `org_team` is not
 * `team`.
 */
export const adminAc = createAccessControl({ ...adminDefaultStatements })

/**
 * All six domain roles are declared, not just `admin`.
 *
 * The five without powers get explicitly empty grants rather than being
 * omitted. An omitted role does not resolve at all, and an unresolvable role is
 * a different failure from a resolvable one that denies — the first looks like
 * a configuration bug when it is really a correct refusal. This is the same
 * mistake in miniature that left `"owner"` unresolvable in ADR 009.
 */
const NO_ADMIN_POWERS = { user: [], session: [] } as const

export const adminRoles = {
  admin: adminAc.newRole({ ...pluginAdminAc.statements }),
  organizer: adminAc.newRole({ ...NO_ADMIN_POWERS }),
  coach: adminAc.newRole({ ...NO_ADMIN_POWERS }),
  player: adminAc.newRole({ ...NO_ADMIN_POWERS }),
  spectator: adminAc.newRole({ ...NO_ADMIN_POWERS }),
  referee: adminAc.newRole({ ...NO_ADMIN_POWERS }),
}
