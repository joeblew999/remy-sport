# ADR 008: The React SPA is the frontend; the server-rendered views are an auth harness

**Status:** Accepted (2026-08-21) — step 1 done, step 2 and 3 in progress (events + teams wired); see [Path to wiring](#path-to-wiring). **Its central decision is being superseded in part:** "there are two GUIs, deliberately" is on the way out — `src/views/` goes once the SPA absorbs the admin console. That `src/web/` is the product frontend, which is this ADR's actual thesis, stands. Two mechanical details also aged out in `c4d326a`: the route files named below are now oRPC procedures under `src/api/`, and the hand-rolled fetch hooks are TanStack Query.

## Context

*Describes the state of the repo when this ADR was written, before the changes
under [Path to wiring](#path-to-wiring) landed.*

The repo contained two web GUIs and a proposal for a third. Nothing said which
one was the product, so all three read as live options.

### GUI 1 — server-rendered Hono views ([src/views/](../../../src/views/), ~400 lines)

`home`, `login`, `dashboard`, `versions`. DaisyUI v5 + Tailwind 4 from a CDN, no
build step. Everything here is real: Better Auth sessions, real D1 `event` rows,
real permission enforcement via `require-permission.ts` (deleted in ADR 020; now [`src/api/base.ts`](../../../src/api/base.ts)), <!-- docs-check-ignore -->
and a dev role-switcher covering all six actors.

It is a demo harness for ADR 005/007 — it proves auth and authorization work
end to end. It is not the product UI and was never designed to be: no brackets,
no live scores, no teams, no i18n.

### GUI 2 — React SPA ([src/web/](../../../src/web/), ~2,500 lines)

`discover`, `event`, `team`, `bracket`, `live`, `profile`. Vite, hash routing,
EN/TH switching, sized for a Tauri webview. This is the product design.

It makes **no network calls at all**:

```
$ grep -rn "fetch(|/api/|useQuery|axios" src/web/
(none)
```

Every page reads hardcoded fixtures from [src/web/data.ts](../../../src/web/data.ts)
— `TEAMS`, `EVENTS`, `BRACKET`, `LIVE_GAME`, `ROSTER`, `STANDINGS`, `FEED`. There
is no auth in it either; it never learns who the viewer is.

### GUI 3 — Datastar + Lit (proposed once, never built)

Argued for reactivity "without a heavy client framework (no React/Vue/Svelte
bundle)" and mapped Datastar/Lit onto the same roadmap phases GUI 2 already
mocks — brackets, score entry, live scores. It directly contradicts GUI 2.
Neither library was ever added to `package.json`.

## Decision

**GUI 2, the React SPA, is the frontend.** This is not a new decision — it
restates one already made and records it where the code can see it.

[biz decision-003](https://github.com/joeblew999/remy-sport-biz/blob/main/decisions/decision-003-frontend-targets.md)
("Frontend targets: single React codebase for Web + Tauri Desktop + Tauri
Mobile", **Accepted 2026-04-29**) settles it:

> The current Cloudflare Pages prototype **IS** the future production web build
> […] The hooks in `app/lib/data.jsx` (currently mocking) **will swap to
> react-query against the Workers API**.

[AGENTS.md](../../../AGENTS.md)'s conflict rule is "biz wins unless there's an
ADR in this repo". That proposal never got past *Proposed*, so it never overrode
anything. Its ADR was deleted in ADR 020 — it described a UI that never existed,
which in an agent-read repo is a liability with no upside.

Consequences for each GUI:

- **GUI 2 is the product surface.** All new user-facing feature work goes here.
- **GUI 1 stays, scoped as a harness.** It is the only place auth and
  authorization are exercised against real data, and the Playwright suite leans
  on it heavily ([authz.spec.ts](../../../tests/authz.spec.ts) alone drives the
  dashboard for all six roles). Deleting it would delete that coverage. It gets
  no new product features.
- **GUI 3 is dead.** Do not add Datastar or Lit.

## The gap this exposes

Naming the SPA as the frontend does not make it a frontend. It is a design
mockup, and the backend cannot currently feed it.

**The API has exactly one resource.** [src/api/events.ts](../../../src/api/events.ts) (this was `src/routes/events.ts` when the ADR was written; the link tracks the file, the sentence records the state at the time)
serves `GET/POST /api/events`, `GET/PUT/DELETE /api/events/{id}`. That is the
whole application surface — plus Better Auth's routes.

**Of the SPA's eight data accessors, seven have no backing at all:**

| [lib/data.tsx](../../../src/web/lib/data.tsx) accessor | Backing endpoint | Backing table |
|---|---|---|
| `useEvents` / `useEvent` | `/api/events` | `event` |
| `useTeams` / `useTeam` | — | — |
| `useBracket` | — | — |
| `useLiveGame` | — | — |
| `useRoster` | — | — |
| `useStandings` | — | — |
| `useFeed` | — | — |

**And the one that is backed does not match.** The SPA's `Event` carries 17
fields; [app-schema.ts](../../../src/db/app-schema.ts)'s `event` table has 7,
of which 3 overlap:

| SPA `Event` | D1 `event` |
|---|---|
| `id`, `type` | `id`, `type` |
| `title` | `name` |
| `div`, `loc`, `city`, `day`, `mo`, `date`, `status`, `statusLabel`, `teams`, `courts`, `games`, `gamesPlayed`, `organizer` | *(no column)* |
| *(not modelled)* | `description`, `createdBy`, `createdAt`, `updatedAt` |

So wiring `useEvents` to `/api/events` today would trade a coherent mockup for
event cards with no venue, no city, no dates and no status. That is a
regression, not progress — which is why this ADR records the gap instead of
quietly half-wiring it.

**There is a third data model, and it is the canonical one.** The biz repo
already specifies the full schema in
[data/seed/schema.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/seed/schema.md),
with seed fixtures in `data/seed/*.jsonl` — `users`, `orgs`, `venues`, `teams`,
`players`, `events`, `divisions`, plus joins and controlled vocabularies
(`TOURNAMENT`/`LEAGUE`/`CAMP`/`SHOWCASE`, `U10`…`SENIOR`, `M`/`F`/`COED`).
Canonical `events` is:

```
id (evt_)  name_en  name_th  type_code  format_code  organizer_user_id
org_id  start_date  end_date  city  province_code  is_fiba_certified
```

AGENTS.md already says to check biz before touching `src/db/schema.ts` or
`src/web/data.ts`. Neither the D1 table nor the SPA fixtures follow it, and they
do not agree with each other either. Three shapes for one noun.

## Path to wiring

Ordered, because each step needs the one before it.

### 1. Reconcile the schema against biz — **done**

[Migration 0005](../../../src/db/migrations/0005_event_canonical_fields.sql) adds
the canonical columns to `event`: `name_th`, `format`, `start_date`, `end_date`,
`city`, `province_code`, `is_fiba_certified`.

**Additive on purpose.** Every existing column stays, so the five endpoints, the
seed route, the auth harness and `tests/authz.spec.ts` needed no changes. Two
name deltas from canonical remain deliberately (`name` for `name_en`,
`created_by` for `organizer_user_id`), as does the lowercase `type` vocabulary;
the migration header records why. `org_id` is omitted — canonical points it at
an `orgs` table this repo does not have, and Better Auth's `organization` table
is a different concept (membership, not the organising body).

Display-only fields are **derived, not stored**. `status`, `statusLabel`, `day`
and `mo` are computed in [lib/api.ts](../../../src/web/lib/api.ts) from the date
window. A stored `status` column would be wrong the moment an event started.

### 2. Add the missing tables and endpoints — **teams done**

Roadmap order: `teams` and `players` (Phase 2), brackets/standings (Phase 3),
live (Phase 6). Seed fixtures are copied from `data/seed/*.jsonl` so local data
is the PO's, not invented.

[Migration 0006](../../../src/db/migrations/0006_orgs_and_teams.sql) adds
`team` (canonical `teams`: `name`, `name_th`, `org_id`, `age_group_code`,
`gender_code`) and read-only `GET /api/teams` + `/api/teams/{id}`.

**`team.org_id` points at Better Auth's `organization`, not a second orgs
table.** The school a coach is a member of is the school its teams play for —
one noun. Modelling biz's `orgs` separately would leave two org tables to keep
in step by hand, and ADR 007 already wired the organization plugin precisely
because biz says role assignment runs through it.

The canonical `orgs` columns (`name_th`, `org_type_code`, `city`,
`province_code`) are therefore declared as organization **`additionalFields`**
in [auth.config.ts](../../../src/auth.config.ts), regenerated into
`auth-schema.ts`, and migrated. Adding them in SQL alone would have reproduced
the 0003 incident — a column the ORM cannot see. `auth:schema:check` guards the
pair.

Writes are deliberately absent: nothing creates or edits a team yet, and the
biz access matrix puts that on the Coach, a flow that does not exist. Add them
with the flow that exercises them.

**Name collision — resolved in [ADR 009](009-full-organization-adoption.md).**
The organization plugin has a built-in teams feature that generates its own
`team` table meaning "a subgroup of members within an organization" — a
different noun from ours, which is a roster of players. ADR 009 enabled that
feature with `schema: { team: { modelName: "orgTeam" } }`, so both tables now
exist side by side and rosters stay here. The two cannot be merged: the
plugin's `org_team_member.user_id` is a non-null FK to `user`, while biz makes
`players.user_id` nullable because minors usually have no account.

ADR 009 also delivered the write path this section defers, once org membership
gave it something to authorize against.

### 3. Swap the accessors — **events and teams done, five to go**

`useEvents`/`useEvent` fetch `/api/events`; `useTeams`/`useTeam` fetch
`/api/teams`. All four return `Async<T> = { data, loading, error }` rather than
a bare value — the call-sites did need to change after all, because a fetch has
render states a module constant does not. `EVENTS` and `TEAMS` are deleted from
`src/web/data.ts`; the remaining fixtures each leave the same way.

`GET /api/events` also grew an `organizerName`, left-joined from `created_by`,
and orders `start_date IS NULL` first so undated rows do not bury real ones.

The team page needed more than an accessor swap: it was hardcoded to
"Saint Gabriel's College" and never read the `id` from its own route, so
`#/team/team_002` and `#/team` rendered identically. It now takes the id
`main.tsx` was already parsing but not passing.

Still on fixtures: `useBracket`, `useLiveGame`, `useRoster`, `useStandings`,
`useFeed`.

Fields with no backing table render as explicit placeholders rather than
invented values — `Event.div` (canonical `divisions`), `Event.loc` (canonical
`venues`), the `teams`/`courts`/`games`/`gamesPlayed` counts, and `Team.record`
(needs a games table). Where fixture-backed sections sit next to real data — the
team page's roster and schedule — they are labelled **SAMPLE DATA**, because
unlabelled placeholder numbers beside real ones get read as real.

`Team.short` is derived from the org name's initials: canonical has no
short-code column, and inventing one in the API would have put a field in the
schema the PO never defined.

### 4. Wire session state into the SPA — *not started*

So it can tell an organizer from a spectator. GUI 1 already proves the server
side works.

## Consequences

**Positive**

- One frontend, named, with the contradicting proposal closed out.
- The mock-data state is now documented rather than discovered by whoever next
  wonders why `/app` never changes.
- Wiring has a defined target (the biz schema) instead of inviting a fourth
  invented shape.

**Negative**

- Two UI stacks stay in the tree — template literals + DaisyUI/CDN for the
  harness, React + Vite for the product. Accepted deliberately: the harness is
  where authorization is tested, and porting that coverage to the SPA is work
  with no product payoff.
- `/app` still ships fixtures for brackets, live games, rosters, standings and
  the feed until step 3 finishes. Events and teams are live against D1.
- `organization` now carries domain columns Better Auth does not use itself.
  The coupling is deliberate (one org noun) but it does mean a future Better
  Auth upgrade that reshapes that table touches domain data —
  `auth:schema:check` in the deploy pipeline is what catches it.
- The SPA's event rows now show `—` for division and "Venue TBC" for venue,
  where the fixtures showed plausible-looking values. That is a visible
  downgrade and an intentional one: the old values were invented, and inventing
  them again in the API would have made the gap harder to see, not smaller.

**Follow-ups noted while writing this**

- `CLAUDE-DESIGN.md`, cited by biz decision-003 as "the prototype's project
  contract", does not exist in this repo. Either restore it or drop the
  reference from biz.
- biz decision-003 describes the web target as deploying to Cloudflare Pages via
  `mise run design:deploy`. That is superseded — [cf:deploy](../../../mise.toml)
  ships the SPA same-origin from the Worker's `[assets]` binding, and
  `web:deploy` is marked LEGACY. Worth correcting in biz.
