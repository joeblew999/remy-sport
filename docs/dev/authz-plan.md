# Authorization: compile it from the PO's data

**A work list, not a decision record.** Delete it when the work is done. The JSONL
in remy-sport-biz is the source of truth — every number and verdict below was
read from the data, and where the data disagreed with a markdown file, the data
won.

## The situation in one line

Everything else in this app is compiled from the PO's fixtures — vocabularies,
entities, join tables, the Drizzle schema, migration DDL, the seed.
**Authorization was the one place it was not.** `scripts/domain-generate.ts` had
never read `permissions.jsonl`, so 186 machine-readable grants sat unused while a
hand-written access controller restated a fraction of them.

**Phases 3, 4 and 5 are done.** The grants compile, the relations resolve
themselves from their own structured derivation, and `requireAction` replaced
`requirePermission` + `requireOwner` + `requireOrgMember`. `access-control.ts`
and `require-org-member.ts` are deleted — 157 lines of hand-written policy for
166 lines of one generic query builder that does not grow with the matrix.

| | PO's model | This repo |
|---|---|---|
| Actions | 69 in `actions.jsonl` | compiled |
| Relations | 19 in `relations.jsonl` | compiled, resolved from structured `derived_from` |
| Grants | 186 in `permissions.jsonl` | compiled to 124 entries |
| Wired | — | 6 of 69 — the rest cost one line each |

At 6 of 69 that has already produced two over-permissions. The remaining 63 are
the reason to fix it now: each one written by hand is another chance to invent a
relation the model does not have, which is exactly how `requireOrgMember` came
about.

## Calls made

**1. No external authorization engine.** Overrules decision-002, which delegates
enforcement to SpiceDB / OpenFGA / Permify. None runs in a Worker, but the
stronger objection is architectural: those engines want tuples *copied out of D1*
into a separate store and re-synced "at deploy time and on data change". That
sync is a drift surface — the disease this whole exercise cures. Deriving
relations from the live tables at check time has none, and a 186-row policy with
five resolver shapes does not need a distributed tuple store. The Zanzibar
*model* from decision-002 is good and stays. The engine choice goes.

**2. `ORG` is real — complete it.** Changelog entry 17 says org-as-tenant was
rejected, "no `ORG_ADMIN`/`ORG_MEMBER` relations". But `object_types.jsonl`
declares `ORG`, and decision-002 names it as something that gets authorised on.
Data outranks prose. The app already needed it enough to invent it: schools are
the organising unit, and `team_coaches` only ever scopes to a single team.

**3. `DIVISION` is dead — delete it.** Declared as an object type with zero
relations and zero actions. `MANAGE_DIVISIONS` is an **EVENT** action granted via
`OWNER`, `CO_ORGANIZER` and `PLATFORM_ADMIN` across three event subtypes.
Divisions are managed entirely through their event; nothing will ever hold a
relation to one.

**4. The `reference/` vs `authorization/` folder split stays.** An earlier draft
of this plan proposed moving `actions`, `relations` and `object_types` into
`authorization/`. Do not. The folder *is* the localisation contract and
`validate-seed.nu` enforces it: `reference/` means keyed by `code` with
translatable `*_en` pivots, `authorization/` means untranslatable tuples. Those
three files are in `reference/` because "Head Coach" and "Owner" get translated
into Thai. The rule is executable, which is why it is trustworthy. The confusion
is real; the cure is one line of documentation, not relocation.

## Phase 1 — Untangle "relation" from "relationship" · biz + app

> **Unblocked 2026-08-27.** This was parked because renaming a vocabulary
> rewrote migrations production had already applied. drizzle-kit owns schema
> deltas now (`mise run db:generate`) and prompts on a rename, so the rename can
> finally be expressed. The `links/` folder rename is already done; what is left
> is `relationships.jsonl` → `guardian_types.jsonl` and the `GUARDIAN` →
> `LEGAL_GUARDIAN` code, both of which need `db:generate` run in a terminal.


- **biz** `reference/relationships.jsonl` → `reference/guardian_types.jsonl`
- **biz** column `guardians.relationship_code` → `guardian_type_code`
- **biz** value `GUARDIAN` → `LEGAL_GUARDIAN`, so it stops colliding with the
  `GUARDIAN` access relation
- **biz** update `schema.md`, the FK declarations `validate-seed.nu` reads, and
  the `translations.jsonl` keys
- **app** regenerate — the `relationship` table becomes `guardianType` — and
  write the rename migration

**Why first.** "Relation" does three jobs today: the `relationships/` folder, the
family-tie vocabulary, and the access-control relations — two of them files one
letter apart in the same directory. It has already produced `relation` and
`relationship` as adjacent tables in
[src/db/vocabularies-schema.ts](../../src/db/vocabularies-schema.ts). Phase 3
turns this vocabulary into compiled API surface, so fix the names before they set.

## Phase 2 — Make `derived_from` executable · biz

- **biz** replace the free-text `derived_from` with a structured object across all
  19 relations — `via` plus its parameters
- **biz** have `regenerate-matrix.nu` emit the readable sentence *from* the
  structure, so there is one source rather than two
- **biz** teach `validate-seed.nu` to check the shape is known and that the tables
  and columns it names exist
- **biz** update the `relations.jsonl` column spec in `schema.md`

**Why.** A human reads `team_coaches where coach_role_code=HEAD` perfectly; a
generator cannot execute it. Structuring it is what turns 19 hand-written
resolvers into five shapes with parameters. `matrix.md` is already generated from
the JSONL, so generating the prose follows the established pattern.

## Phase 3 — Compile the grants · app

- **app** teach `scripts/domain-generate.ts` to read `permissions.jsonl` — today
  it has not one reference to it
- **app** emit an action → allowed-relations lookup, plus typed `ACTION_CODES` and
  `RELATION_CODES`
- **app** carry `event_type_code` scoping through, so a grant can apply to
  tournaments but not camps
- **app** add a staleness gate beside `check:seed`, so an upstream edit that skips
  regeneration fails the build

## Phase 4 — Write the five resolvers · app

| Shape | Relations |
|---|---|
| column | `OWNER`, `SELF` |
| join | `CO_ORGANIZER`, `GUARDIAN` |
| join + filter | the three coach roles, the three follower types |
| join + active window | `TEAM_PLAYER` — the only one needing a date comparison |
| user role / constant | the six `ANY_*`, plus `ANY_SIGNED_IN` and `PUBLIC` |

Plus an assertion in `mise run check` that every upstream relation maps to a known
shape.

**Why five.** Fourteen of the nineteen relations are one shape with different
parameters — the six `ANY_*` are literally `users where role_code = X` across the
roles already in `roles.jsonl`. After this, a new relation upstream costs no code
at all unless it introduces a genuinely new shape, and the check says so if it
does.

### Where Better Auth meets this

Two fields, and nothing else.

```
requireAction("EDIT_TEAM_PROFILE", input => input.id)
        │
        ├─ GRANTS["EDIT_TEAM_PROFILE"]        <- generated from permissions.jsonl
        │     = [HEAD_COACH, TEAM_MANAGER, PLATFORM_ADMIN]
        │
        ├─ context.user                        <- Better Auth. { id, role }
        │
        └─ try each granted relation until one says yes:
             PLATFORM_ADMIN -> user.role === "admin"
             HEAD_COACH     -> SELECT 1 FROM teamCoach
                               WHERE team_id = ? AND user_id = <user.id>
                                 AND coach_role_code = 'HEAD'
             TEAM_MANAGER   -> same, 'MANAGER'
           none match -> FORBIDDEN
```

`user.id` is the join key in every object-scoped resolver; `user.role` is the
whole of every platform-scoped one. Better Auth supplies those two, and everything
after is this database and the PO's tables.

**This is only a one-column join because of migration 0015.** Users carry their
fixture ids now, so `team_coaches.user_id` from the PO's fixtures joins straight to
Better Auth's `user.id`. Before that, all nineteen resolvers would have had to go
through the `biz_id` bridge.

Three details:

- **Casing.** The PO's role codes are `COACH`; `user.role` holds `coach`, because
  `scripts/seed-sql.ts` lowercases on the way in. Emit the comparison in one
  canonical form and assert it in `mise run check`, or `ANY_COACH` silently
  matches nobody. Fails closed, so it surfaces as mysterious 403s.
- **Impersonation.** Better Auth swaps `context.user` for the impersonated user,
  so authorization evaluates as them — which is the point.
  `session.impersonatedBy` remains available for auditing.
- **`activeOrganizationId`.** For the ORG relations in phase 7, resolve membership
  from the `member` table by user id, never from the session. The session's active
  org is a UI convenience and can be switched or stale.

## Phase 5 — Swap the enforcement seam · app

- **app** introduce `requireAction(actionCode, objectResolver)` in place of
  `requirePermission` + `requireOwner` / `requireOrgMember`
- **app** convert the 6 call sites in [src/api/events.ts](../../src/api/events.ts)
  and [src/api/teams.ts](../../src/api/teams.ts)
- ~~**app** delete the hand-written domain controller~~ **done** <!-- docs-check-ignore -->
- **app** drop the dead `import { ac, roles }` from
  [src/auth.config.ts](../../src/auth.config.ts) — it imports both and uses
  neither, left over from the correction that stopped the platform controller
  being passed to the plugins
- **app** keep `admin-access-control.ts` and `org-access-control.ts` — they govern
  Better Auth's own endpoints, checked inside the plugin before our code runs
- **app** delete the `session` namespace-collision trap from `AGENTS.md`

**Better Auth is untouched by this.** `access-control.ts` is our file that happens
to use Better Auth's `createAccessControl` helper; its only real consumer is
`src/api/base.ts`. No plugin config, no schema, no endpoint changes. Better Auth
keeps authentication, the admin and organization plugins, and — importantly —
role *assignment*: six of the nineteen relations are `users where role_code = X`,
so the resolvers read the role it maintains. Better Auth says who you are and what
role you hold; the PO's data says what that lets you do.

**What this fixes for free.** Both over-permissions — any org member editing any
team in the org, and org admins deleting teams — disappear as a consequence
rather than as two patches. The `session` trap exists only because we
hand-authored a statement set in the plugin's namespace; generating from the PO's
action codes leaves nothing to collide.

## Phase 6 — Make the tests data-driven too · app

- **app** parameterise the worker-tier authz tests over `permissions.jsonl` rows
- **app** unit-test each resolver directly — tuple derivation is where the silent
  grant/deny bugs live, e.g. forgetting that `MANAGER` is also a coach
- **app** check that every action code named by a procedure exists upstream

Once phase 3 lands, the grant table *is* the test matrix: a policy change upstream
changes what the tests assert, with no test edit.

## Phase 7 — Complete `ORG`, delete `DIVISION` · biz + app

- **biz** add `relationships/org_members.jsonl` as the tuple source
- **biz** add `ORG_ADMIN` and `ORG_MEMBER` to `relations.jsonl`, with structured
  `derived_from`
- **biz** add the ORG-scoped actions and their grants — at minimum inviting and
  removing members, and editing the org profile
- **biz** remove `DIVISION` from `object_types.jsonl`
- **app** `MEMBERSHIPS` in [scripts/seed-sql.ts](../../scripts/seed-sql.ts) stops
  being invented locally and reads the fixture

This settles the last hand-invented data in the seed, and gives Better Auth's
organization plugin a job defined by the PO rather than by us.

## Phase 8 — Correct the decision record · biz

- **biz** strike the engine section from `decision-002`. The Zanzibar model
  stands; SpiceDB / OpenFGA / Permify do not.
- **biz** correct changelog entry 17, which says org-as-tenant was rejected while
  `object_types.jsonl` declares `ORG`
- **biz** add a short note to `schema.md`: the authorization model spans four
  files, three in `reference/` because they carry translatable labels and one in
  `authorization/` because it does not

**Why bother.** A decision doc that contradicts the data is worse than no doc — it
is what sent this investigation down two wrong paths in one afternoon. Anything
the data can state should be deleted from prose, and anything left must agree with
the data.

## Where the divergences are today

All six wired actions, checked against the grant rows.

| Action | Granted to | The app requires | Verdict |
|---|---|---|---|
| `CREATE_EVENT` | ANY_ORGANIZER, PLATFORM_ADMIN | permission only | matches |
| `EDIT_EVENT` | OWNER, CO_ORGANIZER, PLATFORM_ADMIN | permission + `requireOwner` | stricter — CO_ORGANIZER unbuilt |
| `DELETE_EVENT` | OWNER, PLATFORM_ADMIN | permission + `requireOwner` | matches |
| `CREATE_TEAM` | ANY_COACH, PLATFORM_ADMIN | permission + org membership | stricter |
| `EDIT_TEAM_PROFILE` | HEAD_COACH, TEAM_MANAGER, PLATFORM_ADMIN | any org member | **too permissive** |
| `DELETE_TEAM` | PLATFORM_ADMIN | org admins too | **too permissive** |

## Also open, not authorization

- **`INVITE_CO_ORGANIZER` is not built.** It is the only invitation the PO
  specified. `eventCoOrganizer` is seeded but has no API, route or UI. What *is*
  built is Better Auth's org invitation — which has no UI to send one.
- **shadcn/ui + Tailwind still not installed** — `src/web/styles.css` is ~1000
  hand-written lines, the largest remaining source of per-page boilerplate.
