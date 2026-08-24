import { createAccessControl } from "better-auth/plugins/access"
import {
  defaultStatements,
  ownerAc,
  adminAc,
  memberAc,
} from "better-auth/plugins/organization/access"

/**
 * Access control for **organization scope**, separate from the platform-scope
 * model in [access-control.ts](./access-control.ts).
 *
 * Two different questions, two different vocabularies:
 *
 * - Platform scope asks "what kind of actor is this person" — organizer, coach,
 *   referee. Exactly one per user, fixed by the biz actor model.
 * - Organization scope asks "what is this person's standing inside this one
 *   org" — owner, admin, member. Orthogonal: a coach can be an owner of their
 *   school and not a member of any other.
 *
 * ADR 007 said these were distinct and then passed the platform roles to the
 * organization plugin anyway, which quietly made them the same thing. That was
 * a live bug rather than a stylistic issue: `createOrganization` writes
 * `member.role = "owner"` (its `creatorRole` default), and "owner" is not one
 * of the six domain roles — so every org-scoped permission check for the person
 * who created the org resolved to no role at all and denied. It went unnoticed
 * only because nothing called an org-scoped check yet. ADR 009 records it.
 *
 * The statements below are Better Auth's own org statements — `organization`,
 * `member`, `invitation`, `team`, `ac`. Note `team` here means the plugin's
 * org_team (a group of members), not the domain roster table; the two share a
 * word and nothing else, which is the same collision the modelName rename
 * handles at the table level.
 *
 * `ac` is the statement dynamic access control uses to bound runtime-created
 * roles: a custom org role can only ever grant a subset of these.
 */
export const orgAc = createAccessControl({ ...defaultStatements })

export const orgOwner = orgAc.newRole({ ...ownerAc.statements })
export const orgAdmin = orgAc.newRole({ ...adminAc.statements })
export const orgMember = orgAc.newRole({ ...memberAc.statements })

export const orgRoles = {
  owner: orgOwner,
  admin: orgAdmin,
  member: orgMember,
}
