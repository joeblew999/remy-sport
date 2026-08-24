# ADR 009: Adopt the organization plugin fully — teams, dynamic roles, and object-scoped writes

**Status:** Accepted (2026-08-23)

## Context

[ADR 007](007-organizations-and-auth-hooks.md) enabled the organization plugin and landed its tables. Nothing then used them. Six months of `member`, `invitation` and `session.active_organization_id` sat in the schema with **zero references anywhere in `src/`** — created by [migration 0004](../../../src/db/migrations/0004_organizations.sql) and never read.

Meanwhile [ADR 008](008-frontend-is-the-react-spa.md) shipped `/api/teams` deliberately read-only, with this reasoning:

> Writes are deliberately absent: nothing creates or edits a team yet, and the biz access matrix puts that on the Coach, a flow that does not exist.

That was half the story. The other half is that the write could not have been authorized correctly if it had been written: `requirePermission("team", "update")` answers *"may coaches edit teams"*, which is true of every coach on the platform. It cannot answer *"may this coach edit **this** school's team"*. There was nowhere to look up the relation.

The decision here is to use the plugin for what it is actually for, rather than carry its tables as dead weight.

## Decision

**Adopt the organization plugin fully**: teams, dynamic access control, invitations, and membership as an authorization input.

### 1. Membership is the object-scoped authorization input

[require-org-member.ts](../../../src/middleware/require-org-member.ts) answers "is this user a member of *this* org, at least at this role". Team create and update now compose both checks:

```ts
middleware: [
  requirePermission("team", "create"),                 // platform: actor type
  requireOrgMember((c) => orgIdFromBody(c)),           // object: this school
]
```

Either alone is wrong. Permission alone lets any coach edit any school's roster. Membership alone lets a spectator who happens to belong to the org edit it. The refusal that was previously inexpressible — *same role, same action, different object* — is now [a test](../../../tests/org-teams.spec.ts).

`member` rows are written by Better Auth's own `createOrganization`/`addMember`, so this reads the source of truth the auth layer already maintains rather than a parallel copy (ADR 007 §3's principle, applied to reads).

**Delete is deliberately not org-scoped.** biz [data/access/matrix.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/access/matrix.md) grants `DELETE_TEAM` to `PLATFORM_ADMIN` and to nobody else. Platform admins bypass org checks by design — they are not members of every school — so an org-membership tier on that route could never fire. Adding one would be dead code that also implied org admins may delete teams, which the PO did not grant.

### 2. Organization roles get their own access controller

This is the bug the adoption uncovered.

ADR 007 said org roles were "distinct from the six domain roles" and then passed the platform `ac`/`roles` straight into `organization()`, which *replaces* `owner`/`admin`/`member` with whatever it is given. `createOrganization` writes `member.role = "owner"` — and `"owner"` was not one of the six domain roles, so it resolved to no role at all. **Every org-scoped permission check for the person who created the organization denied.**

It went unnoticed for the same reason the tables did: nothing performed an org-scoped check. The type system flagged it only when `addMember` was first called with `"admin"`, at which point the inferred role union turned out to be the six domain roles rather than the three org ones.

[org-access-control.ts](../../../src/auth/org-access-control.ts) now builds a separate controller from Better Auth's own `defaultStatements` and `ownerAc`/`adminAc`/`memberAc`. Two scopes, two vocabularies:

| | Platform scope | Organization scope |
|---|---|---|
| Question | what kind of actor is this person | what is their standing inside this one org |
| Roles | organizer, coach, referee, player, spectator, admin | owner, admin, member |
| Cardinality | exactly one per user (biz) | one per (user, org), zero or many orgs |
| Source | biz `actors.md` | Better Auth |

The regression test asks the plugin to *resolve* the owner role via `organization/has-permission`, not merely to report the stored string. That distinction matters: [organization.spec.ts](../../../tests/organization.spec.ts) already asserted `members[0].role === "owner"` and passed throughout the bug, because the string was always written correctly. Confirmed by reverting the config and watching the new test fail.

### 3. The plugin's teams are `orgTeam`, and rosters stay put

`schema: { team: { modelName: "orgTeam" }, teamMember: { modelName: "orgTeamMember" } }`.

ADR 008 flagged the name collision. The resolution is that **both tables are real, because they are different nouns**:

- **`org_team`** groups *users who log in* — staff, coaching groups, committees. Its `org_team_member.user_id` is a non-null FK to `user`.
- **`team`** is a roster of players. biz [schema.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/seed/schema.md) makes `players.user_id` **nullable**: *"Empty = minor or non-account-holder; coach manages on their behalf."*

A youth basketball roster is mostly twelve-year-olds without accounts. Putting rosters in `org_team_member` would require giving every minor a login, which the PO's model explicitly refuses. This is a foreign key against a nullable column, not a preference — no amount of adoption enthusiasm dissolves it. `org_team` also has no `age_group_code`, `gender_code` or `name_th`.

### 4. Dynamic access control is on, and is additive

`dynamicAccessControl: { enabled: true }` adds the `organization_role` table and lets an org define roles at runtime, bounded by `orgAc` — a dynamic role can only ever grant a subset of the org statements.

**This does not move authorization into Better Auth.** biz [decision-002](https://github.com/joeblew999/remy-sport-biz/blob/main/decisions/decision-002-authorisation-engine.md) (Accepted) puts object-scoped policy in a Zanzibar-style engine over PO-owned JSONL, having explicitly rejected role-mode RBAC because it *"doesn't natively express object-relation scoping"*. Dynamic org roles are still role-based and still not object-scoped, so they are not a substitute and no ADR overrides decision-002 here.

The line: **membership answers "which objects", roles answer "which verbs"**, and `requireOrgMember` is deliberately membership-scoped rather than a general relation engine. When the Zanzibar engine arrives it replaces the *role* half; the `member` table remains a tuple source for it (decision-002 already lists `team_coaches`-style joins as derived tuple sources).

## Consequences

**Positive**

- Three tables that were carried and never read are now load-bearing.
- The first object-scoped authorization in the repo, with the coach-cannot-touch-another-school case under test.
- A real authorization bug found and fixed — org creators had no org permissions.
- ADR 008's deferred team write path is delivered.

**Negative**

- Two tables whose names differ only by prefix (`team`, `org_team`). Mitigated by the rename being explicit in config and by both being documented here, but it will confuse someone.
- `organization_role` is created and nothing writes to it yet. Unlike the ADR 007 tables, this is a table the runtime will populate on demand rather than one requiring new code.
- Migration 0008 must reach remote D1 before the Worker that expects those tables. The deploy pipeline now migrates before deploying (ADR 006 §8), which is what makes that safe.
- `requireOrgMember` is a second authorization mechanism alongside `requirePermission`, and a third (Zanzibar) is planned. Two of the three are meant to be temporary; this ADR is where that is written down.

**Follow-ups**

- ~~Invitation endpoints ship with the plugin at `/api/auth/organization/*` and work, but `sendInvitationEmail` is unset because the project has **no email transport at all**.~~ **Closed by [ADR 010](010-outbound-email.md)**, which wires Cloudflare Email Service with a capturable transport for tests. Accepting an invitation is still unimplemented — the emailed link points at an SPA route that does not exist yet.
- `tests/organization.spec.ts` creates a `club-<timestamp>` org per run and never cleans up; local D1 has accumulated dozens. Same class of problem as ADR 006 §9d.
- Nothing yet sets `session.active_organization_id`, so a user in several orgs has no notion of a current one. Needed before any UI shows org-scoped data.
