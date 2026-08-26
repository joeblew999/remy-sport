# ADR 007: Organizations, wired access control, and database hooks

**Status:** Implemented (2026-08-20)

## Context

[remy-sport-biz/domain/actors.md](https://github.com/joeblew999/remy-sport-biz/blob/main/domain/actors.md) states:

> Role assignment is handled through Better Auth's organization and role plugins.

The biz repo is the source of truth for domain definitions and wins unless an ADR says otherwise ([AGENTS.md](../../../AGENTS.md)). Today the code does not do this. Three gaps:

### 1. The access control model is defined but never given to Better Auth

[src/auth/access-control.ts](../../../src/auth/access-control.ts) builds a full `createAccessControl` statement set and six roles (admin, organizer, coach, player, spectator, referee) matching [data/access/matrix.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/access/matrix.md).

But [src/auth.config.ts](../../../src/auth.config.ts) registers the admin plugin as bare `admin()` — no `ac`, no `roles`. Better Auth therefore runs its **default** admin/user role model and knows nothing about organizers or coaches.

The application compensates in `src/middleware/require-permission.ts` (deleted in ADR 020; the same logic now lives in [`src/api/base.ts`](../../../src/api/base.ts) as oRPC middleware), which imports `roles` directly <!-- docs-check-ignore --> and calls `roleDef.authorize(...)` itself. Authorization works, but Better Auth is not the thing enforcing it — so anything that goes through Better Auth's own APIs (`auth.api.userHasPermission`, admin endpoints, org-scoped checks) sees a different, weaker model. Two sources of truth for the same question.

### 2. No organization plugin

There is no `organization` table, no membership, no invitations. Clubs, leagues and teams are core to the domain: an Organizer runs events *for* a club, a Coach manages a team *within* one. Every event is currently owned by a bare `user.id` with no organizational scope.

### 3. Roles are assigned with raw SQL that bypasses Better Auth

[src/routes/seed.ts](../../../src/routes/seed.ts) creates users through `auth.api.signUpEmail`, then does:

```ts
await db.prepare("UPDATE user SET role = ? WHERE email = ?").bind(u.role, u.email).run()
```

with the comment "admin plugin's setRole requires an admin session". Writing directly to a Better Auth table sidesteps its hooks, validation and any future column it adds — the same class of drift that [ADR 006 §9e](006-environment-provisioning.md) removed from the schema.

## Decision

### 1. Give Better Auth the access control model

```ts
admin({ ac, roles, defaultRole: "spectator", adminRoles: ["admin"] })
```

`defaultRole: "spectator"` follows the biz model: a new account with no other designation is a follower with read access. `adminRoles: ["admin"]` tells the plugin which of our roles may use admin endpoints — without it the plugin looks for its own built-in `admin` role.

`require-permission.ts` keeps working unchanged, but it now consults the *same* role objects Better Auth holds, rather than a parallel copy.

### 2. Enable the organization plugin

```ts
organization({ ac, roles })
```

Organization membership roles are Better Auth's own (`owner`, `admin`, `member`) and are **distinct from** the six domain roles. A user has exactly one platform role (biz: "Each user has exactly one role") and may additionally be a member of organizations. Passing `ac`/`roles` lets org-scoped permission checks use the same statements.

> **Correction (2026-08-23, [ADR 009](009-full-organization-adoption.md)):** the paragraph above states the right intent, and the line of code above it did the opposite. Passing the platform `ac`/`roles` to `organization()` *replaces* `owner`/`admin`/`member` with the six domain roles, so the two were not distinct at all. `createOrganization` writes `member.role = "owner"` (its `creatorRole` default), and `"owner"` matched nothing in the domain role map — so every org-scoped permission check for the user who created the organization denied. It stayed invisible because nothing performed an org-scoped check until team writes landed. The plugin now receives its own `orgAc`/`orgRoles` from [org-access-control.ts](../../../src/auth/org-access-control.ts), which is what this section always meant.

This ADR only lands the tables and plugin. Attaching events to organizations is follow-on work and deliberately out of scope — see Consequences.

### 3. Replace the raw SQL with a database hook

```ts
databaseHooks: {
  user: {
    create: {
      before: async (user) => ({ data: { ...user, role: user.role ?? "spectator" } }),
    },
  },
}
```

Role assignment moves inside Better Auth. `seed.ts` passes the role through `signUpEmail`'s body instead of issuing an `UPDATE`, so no application code writes to a Better Auth table.

### 4. Schema regeneration

Adding the organization plugin changes the schema, which is exactly the workflow ADR 006 §9e built:

```bash
mise run auth:schema:generate
mise run cf:d1:migrations:create   # then hand-write the delta
```

`auth:schema:check` in the deploy pipeline fails if the committed schema does not match the config, so the two cannot diverge again.

### 5. Mise tasks

No new tasks. This ADR is exercised entirely by existing ones:

| Task | Role here |
|---|---|
| `auth:schema:generate` | regenerate after the plugin change |
| `auth:schema:check` | proves the committed schema matches (runs in `deploy`) |
| `cf:d1:migrations:apply` / `:remote` | apply migration `0004` |
| `test` / `test:deployed` | verify the six actors still authorize correctly |

## Consequences

**Good**

- One authorization model. Better Auth and `require-permission.ts` consult the same roles.
- Organizations exist, unblocking club/team/league work in the roadmap.
- No application code writes to Better Auth tables.
- New accounts get a sane default role instead of Better Auth's generic `user`, which matched no role in `access-control.ts` — `require-permission.ts` fell through to `403` for any user created outside the seed route.

**Costs and risks**

- **Organization tables ship empty.** Nothing creates or joins an organization yet, so `member` and `invitation` stay unused until follow-on work. Tables with no writer are a mild smell; the alternative is a second migration later.
- **`defaultRole` changes behaviour for new sign-ups.** Previously they got Better Auth's `user`, which no middleware recognised. Anyone relying on that accidental deny now gets spectator-level read access — which is the documented intent, but it is a real change.
- Event ownership stays `user.id`. Scoping events to organizations needs its own decision and a data migration.
- The organization plugin adds four tables and a `session.active_organization_id` column that are dead weight if the org model is later dropped.

**Explicitly out of scope**

- Attaching events, teams or rosters to organizations.
- Invitation email delivery (no email service is configured — see [ADR 002](002-seed-users.md)).
- Migrating the six domain roles into org-scoped roles. Biz says one platform role per user; that stands.
