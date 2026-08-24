# Project Context

<!-- This is the main agent context file (AGENTS.md, the open standard). CLAUDE.md and GEMINI.md are aliases that point here. CONTEXT.md was the previous name and has been removed. -->

## Companion repo

[remy-sport-biz](https://github.com/joeblew999/remy-sport-biz) is the Product Owner's source-of-truth for *what* to build (actors, event types, access matrix, roadmap, epics, stories, decisions). Cloned locally at `../remy-sport-biz/`.

**Conflict rule: biz wins unless there's an ADR in this repo.**

Check biz first for canonical domain definitions before touching `src/db/schema.ts` or `src/web/data.ts`.

## Getting Started

### Quick start (new developer)

```bash
# 1. Install mise (if not already installed)
curl https://mise.run | sh
export PATH="$HOME/.local/bin:$PATH"
eval "$(mise activate bash)"

# 2. Trust config and set up everything (deps, SPA build, migrations, Playwright)
mise trust && mise install && mise run setup

# 3. Start dev server with seeded test data
mise run dev:seed
```

That's it. The server runs on **http://localhost:8787** — the SPA is at **/app**, the auth harness at `/`, `/login` and `/dashboard`.

### Which dev server?

There are two, and only one of them is the normal choice.

| | Command | Open | Use when |
|---|---|---|---|
| **Worker** (normal) | `mise run dev:seed` | **localhost:8787/app** | Everything works: one origin serves the API and the SPA. |
| Vite (HMR only) | `mise run dev` **and** `mise run web:dev` | localhost:5175 | Editing components and you want instant reload. |

**`mise run web:dev` on its own does not work.** Vite serves the SPA and nothing else, so `/api/*` has no backend: the session never resolves, sign-in 404s, and every page renders empty — which looks like a broken SPA rather than a missing API. `src/web/vite.config.ts` proxies `/api` to `localhost:8787`, so the Worker still has to be running in another terminal.

### AI agent sessions

The SessionStart hook (`.claude/hooks/session-start.sh`) automatically runs steps 1-2 above. After that, run `mise run dev:seed` when you need the server, or `mise run dev` if seeding is not needed.

### Notes
- If `jq` install fails due to GitHub API rate limits, retry with `GITHUB_TOKEN="" mise install jq`
- Run `mise run test` to verify all tests pass (starts its own server, no need for `mise run dev`)
- `mise run seed` can be run separately against an already-running dev server
- Playwright is installed via curl (proxy-safe) with version auto-detected from `node_modules/playwright-core/browsers.json`
- `setup` owns `web:build`. `dist/web` is gitignored and the `[assets]` binding points at it, so without a build `wrangler dev` refuses to start ("the directory specified by the `assets.directory` field ... does not exist"). Every local task routes through `setup`, and `web:build` declares `sources`/`outputs`, so it is a no-op once `dist/web` is current.

## Stack

### Frameworks & Libraries
- **Hono** — web framework (ultrafast, Web Standards based)
- **Zod** — schema validation
- **OpenAPI** — API specification via `@hono/zod-openapi`
- **MCP** — model context protocol
- **Better Auth** — authentication (with plugins for 2FA, organizations, roles, etc.)
- **Drizzle ORM** — database ORM for D1
- **React 19 + Vite** — the product frontend (`src/web/`), see [ADR 008](docs/dev/adr/008-frontend-is-the-react-spa.md)
- **DaisyUI v5** — UI components via CDN (no build step), used by the auth harness only
- **Tailwind CSS 4** — utility CSS via CDN, used by the auth harness only
- **Playwright** — end-to-end testing
- ~~**Datastar** / **Lit**~~ — proposed in ADR 004, **superseded** by ADR 008. Never implemented; do not add either.

### Runtime & Infrastructure
- **Cloudflare Workers** — serverless compute
- **Cloudflare D1** — SQL database
- **Cloudflare R2** — object storage
- **Browser** — client-side runtime

### Tooling
- **bun** — package manager and runtime
- **mise** — task runner and tool version manager

### Dependencies

```bash
mise run deps:outdated   # show what is behind
mise run deps:update     # update within package.json semver ranges, then typecheck
```

`deps:update` only moves within existing ranges, so it cannot silently cross a major boundary — widening a range is a deliberate edit. Always follow with `mise run test`.

**`better-auth` is on 1.7.1.** It was pinned to `~1.4.18` for a while over two blockers, both now resolved — the note is kept because the way it was resolved is not guessable:

**The CLI was renamed.** `@better-auth/cli` is frozen at 1.4.22 and always will be; the package moved to plain **`auth`**, which versions in lockstep with core. The old blocker was that `@better-auth/cli` bundles its own `@better-auth/core`, so installing it beside `better-auth@1.7.1` hoisted core 1.4.22 against a 1.7.1 runtime. Checking `@better-auth/cli` versions makes the upgrade look permanently blocked — it is the wrong package to check. Verify the tree with `bun pm why @better-auth/core`: there must be exactly one, matching `better-auth`.

**`account.issuer` needed a backfill.** 1.7 matches `sign-in/email` on `account.issuer === createLocalAccountIssuer("credential")`, so before [migration 0007](src/db/migrations/0007_account_issuer.sql) every sign-in failed with `User not found` while `/api/seed` still reported the users as existing. All rows here are credential rows and take `local:credential`; a social provider would need its own issuer branch added to that migration.

`deps:outdated` cannot see either of these — a rename looks like an abandoned package, and a required backfill looks like a normal minor bump.

## Three access-control scopes, and two tables called "team"

See [ADR 009](docs/dev/adr/009-full-organization-adoption.md). Both pairs are easy to conflate and each conflation has already caused a bug.

**Roles.** Three scopes, three controllers — [access-control.ts](src/auth/access-control.ts) (domain: event, team, player), [org-access-control.ts](src/auth/org-access-control.ts) (organization, member, invitation) and [admin-access-control.ts](src/auth/admin-access-control.ts) (user, session).

**Never pass the platform `ac`/`roles` to a Better Auth plugin.** Supplying custom roles *replaces* the plugin's own, and this has now broken twice: `organization()` made `"owner"` — the role `createOrganization` actually writes — resolve to nothing (ADR 009), and `admin()` left the seeded admin unable to call any admin endpoint (ADR 013). Both were invisible until something called those endpoints.

**Do not merge the statement sets to "fix" it.** The admin plugin declares `user` and `session`, and both names are already taken by the domain model — where `session` means a *camp session*, not an auth session. Merging would make "may define a camp session" and "may revoke someone's login" the same permission.

**Teams.** `team` is a roster of players (domain, migration 0006). `org_team` is a group of *users who log in* (the plugin, migration 0008). Rosters cannot move into `org_team_member` — its `user_id` is a non-null FK, and biz makes `players.user_id` nullable because minors usually have no account.

**Authorizing a write needs both questions.** `requirePermission` asks whether this actor type may do this at all; `requireOrgMember` asks whether they stand in the right relation to *this* object. See `src/routes/teams.ts` for the composition. Check the biz access matrix before adding either — it is the source of truth for who may do what, and it is what makes team delete platform-admin-only.

## Sign-in is passwordless

See [ADR 012](docs/dev/adr/012-passwordless-email-otp.md). Email OTP is the **only** way in — `emailAndPassword` is off, `POST /api/auth/sign-in/email` 400s, and there are no passwords in the seed. Sign-up is not a separate act: an address that receives a code gets an account, defaulted to `spectator`.

Both GUIs run the same two steps against the same endpoints — `email-otp/send-verification-otp`, then `sign-in/email-otp`. The SPA has session state ([lib/session.tsx](src/web/lib/session.tsx)) and its own login screen; it no longer hands users to the harness.

**Tests never post a password.** Use [tests/helpers/auth.ts](tests/helpers/auth.ts). The six seeded `@remy.dev` actors sign in with a fixed code (`TEST_OTP`); everyone else gets a real emailed one read from the dev outbox. Codes are single-use, so the suite runs `workers: 1` — two parallel tests signing in as the same actor consume each other's code.

`TEST_OTP` must be unset in production before the platform has real users.

## Email

See [ADR 010](docs/dev/adr/010-outbound-email.md). Cloudflare Email Service via the `[[send_email]]` binding, behind a `Mailer` seam in [mail/mailer.ts](src/mail/mailer.ts).

`MAIL_TRANSPORT` picks the transport and **defaults to `outbox`**, which captures messages in the Worker isolate instead of sending. Production sets `cloudflare` in `wrangler.toml`; `.dev.vars` overrides it back to `outbox` locally. Tests assert on real message content through `/api/dev/outbox`, which 404s whenever the real transport is active — mail bodies carry invitation links and password-reset tokens, so that route must never exist in production. Mail specs skip themselves when `BASE_URL` is set, because `test:deployed` reruns the suite against production where that route is gone.

Build links in emails from `BETTER_AUTH_URL`, never from the request origin: an email outlives its request, and the origin can be localhost or a preview host. This is the one place that rule is inverted relative to `trustedOrigins`.

Sending to people outside the account needs the Workers **Paid** plan *and* the sending domain onboarded to Email Service. Neither is checkable from the repo.

## Controlled vocabularies

See [ADR 015](docs/dev/adr/015-reference-vocabularies.md). Age groups, genders, org types, event types/formats and provinces are **tables** (`age_group`, `gender`, …), seeded from `remy-sport-biz/data/seed/*.jsonl` and served at `/api/reference` with Thai names. `team.age_group_code` and `gender_code` are foreign keys — the database rejects an unknown code, not just the API.

Route files still declare `z.enum([...])`, because a TEXT column cannot express a vocabulary to the type system and bad input should fail at the boundary. That copy is checked by `tests/reference.spec.ts`, so a change upstream fails a test rather than drifting.

Do not use `drizzle-zod` to derive the domain route schemas: `createInsertSchema` on a TEXT column yields `z.string()` and would accept `"U99"`. It is used for `/api/reference`, where the response genuinely is the table.

## Sessions and devices

See [ADR 014](docs/dev/adr/014-session-and-device-management.md). Device management is Better Auth **core** — `/list-sessions`, `/revoke-session`, `/revoke-other-sessions` — not the `multiSession` plugin, which is account *switching* and answers a different question.

Sessions last 30 days (ADR 012), so being able to end one matters. `/api/dev/prune-sessions` keeps local session counts sane; without it they accumulate one per sign-in, and past ~100 rows `list-sessions` stops returning the newest — which breaks anything that needs to identify the *current* session.

## Web GUIs — there are two, deliberately

`src/views/` is the **admin console** (ADR 013), not a demo harness: account list, role assignment, ban, and impersonation via the admin plugin. Impersonation — not the dev "sign in as" row — is the right way to view the platform as someone else; it keeps your admin identity and records `session.impersonated_by`.

See [ADR 008](docs/dev/adr/008-frontend-is-the-react-spa.md). Read it before
adding any user-facing feature, so it lands in the right one.

| | `src/web/` — **the product** | `src/views/` — **auth harness** |
|---|---|---|
| Stack | React 19 + Vite, hash routing, EN/TH | Hono template literals, DaisyUI/Tailwind via CDN |
| Served at | `/app` (Worker `[assets]` binding) | `/`, `/login`, `/dashboard` |
| Pages | discover, event, team, bracket, live, profile | home, login, dashboard, versions |
| Data | events + teams from the API; brackets/live/rosters/standings/feed still fixtures (`src/web/data.ts`) | real D1, real Better Auth sessions |
| Also ships as | Tauri desktop + iOS | — |
| New features? | **yes, here** | no — harness only |

`src/views/` stays because it is the only place authorization is exercised
end to end against real data, and `tests/authz.spec.ts` drives it for all six
roles. It is not the product UI.

`src/web/` is the product per [biz decision-003](https://github.com/joeblew999/remy-sport-biz/blob/main/decisions/decision-003-frontend-targets.md).
Events and teams are wired to the API; the other five accessors in
[`src/web/lib/data.tsx`](src/web/lib/data.tsx) still return fixtures because no
endpoint backs them. Adding one? Follow the pattern events and teams set —
endpoint, then a fetch in `lib/api.ts`, then delete the fixture. ADR 008 tracks
what is left and in what order.

Two rules that came out of doing the first two:

- **Never invent a value for a field with no table.** Render a placeholder
  (`—`, "Venue TBC") and note it in ADR 008. Where a fixture-backed section sits
  next to real data, label it `SAMPLE DATA` — unlabelled placeholder numbers
  beside real ones get read as real.
- **Derive, don't store, anything that is a function of other columns.** Event
  status/day/month come from the date window in `lib/api.ts`; a stored `status`
  would be wrong the moment an event started.

**Schema changes go through biz first.** The canonical model lives in
[remy-sport-biz/data/seed/schema.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/seed/schema.md)
with fixtures in `data/seed/*.jsonl`. `event` follows it as of migration 0005
and `team` as of 0006; match it rather than inventing a shape.

**The organising body is Better Auth's `organization` table**, not a separate
`orgs` table — biz's `orgs` and Better Auth's organizations are the same noun.
Its canonical columns (`name_th`, `org_type_code`, `city`, `province_code`) are
declared as `additionalFields` in `src/auth.config.ts` so the generated schema
carries them. Adding such a column in SQL alone recreates the 0003 drift bug.

## Database schema

**`src/db/auth-schema.ts` is generated. Never edit it.**

```bash
mise run auth:schema:generate   # regenerate from src/auth.config.ts
mise run auth:schema:check      # fail if it is stale (runs in the deploy pipeline)
```

| File | Owner |
|---|---|
| `src/db/auth-schema.ts` | **generated** by the Better Auth CLI |
| `src/db/app-schema.ts` | hand-written application tables (`event`) |
| `src/db/schema.ts` | re-exports both; the only import site |
| `src/auth.config.ts` | schema-shaping auth options, read by both runtime and CLI |

Adding a Better Auth plugin or an extra user field changes the schema. Regenerate, then create a migration for the delta with `mise run cf:d1:migrations:create`.

This split exists because the hand-maintained schema drifted: the admin plugin's `session.impersonated_by` column was never declared or migrated. Nothing failed while schema and database were wrong in the *same* way — the moment the schema became correct, every sign-in 500'd with `table session has no column named impersonated_by`. Migration `0003` fixes it; `auth:schema:check` in the deploy pipeline stops it recurring.

### Key Details
- MCP server runs on Cloudflare
- Better Auth handles all authentication and authorisation, backed by D1 via Drizzle adapter
- Better Auth uses email+password (no domain/email service needed for dev)
- Hono serves both browser and Cloudflare targets
- Versioned deployments to Cloudflare (Workers Versions & Gradual Rollouts)

### Better Auth Plugins (available)
- 2FA — two-factor authentication
- Admin — admin management
- Anonymous — anonymous users
- API Key — API key auth
- Bearer Token — token-based API auth
- Captcha — captcha verification
- Email OTP — one-time password via email
- Generic OAuth — any OAuth provider
- Have I Been Pwned — compromised password checks
- JWT — JWT token auth
- Magic Link — passwordless auth
- MCP — model context protocol provider
- Multi Session — concurrent sessions
- OAuth 2.1 Provider — act as OAuth provider
- OIDC Provider — OpenID Connect provider
- One Tap — one-tap sign in
- One-Time Token — single-use tokens
- Organization — org/team management
- Passkey — passkey auth
- Phone Number — phone-based auth
- SSO — enterprise single sign-on
- Username — username-based auth
- Stripe / Polar / Dodo / Creem / Autumn — payment integrations
- SCIM — cross-domain identity management
- SIWE — Sign In With Ethereum

## ADRs (Architectural Decision Records)
- All ADRs live in `docs/dev/adr/` with the naming convention `NNN-short-title.md` (e.g. `001-deployment-versioning.md`)
- ADRs document **plans before implementation** — write the ADR first, get approval, then implement
- ADR format: **Status** (proposed/accepted/implemented), **Context** (why), **Decision** (what), **Implementation** (how, with concrete steps and file paths), **Consequences** (trade-offs)
- ADRs **must include mise task definitions** — every feature needs tasks for running, seeding, testing, deploying, etc. If a feature adds new workflows, the ADR must specify the exact task names and what they do
- Reference ADRs from AGENTS.md when they affect conventions or architecture

## Conventions
- All plan and architectural decision files go in `docs/dev/adr/`
- Always use `mise run` commands to run things (e.g. `mise run dev`, `mise run test`, `mise run deploy`) — both AI agents and humans use the same mise tasks so we dogfood our own tooling
- Never run raw `bun`, `bunx wrangler`, or other commands directly when a mise task exists for it
- Mise tasks must be **idempotent** where possible — tasks should skip when inputs haven't changed
- Mise tasks must work **without requiring user args** — use env vars with defaults or auto-detection instead of positional args
- Continuously refactor mise tasks, code, and this AGENTS.md as you work — keep everything clean and up to date
- Always use well-known `autocomplete` attributes on form fields (`email`, `name`, `current-password`, `new-password`, etc.) so browser autofill and password managers work correctly
- Run `mise run test` after changes to verify everything still works

## Deployment

Deployed at **https://remy.ubuntusoftware.net** (custom domain, bound via `[[routes]] custom_domain = true` in `wrangler.toml`). See [ADR 006](docs/dev/adr/006-environment-provisioning.md).

```bash
mise run deploy             # check → test → bootstrap → deploy → wait → migrate → seed → test:deployed
```

Rebuilding a wiped environment:

```bash
mise run cf:login           # only if not authenticated
mise run cf:env:bootstrap   # provision D1 + R2 + BETTER_AUTH_SECRET (idempotent)
mise run deploy
```

### Project-scoped Cloudflare state

`mise.toml` redirects wrangler's global state into this repo:

| Var | Effect |
|---|---|
| `WRANGLER_LOG_PATH` | logs land in `.wrangler/logs/`, not `~/Library/Preferences/.wrangler/logs` |
| `WRANGLER_CACHE_DIR` | cache in `.wrangler/cache/` |
| `CLOUDFLARE_ACCOUNT_ID` | pins the account, whatever the ambient credential allows |
| `PLAYWRIGHT_BROWSERS_PATH` | browsers in `.playwright/`, same path on every OS |
| `GEM_HOME` + `RUBY_BIN` | CocoaPods in `.gem/`, on mise's Ruby — nothing in Homebrew |

Nothing this project needs is installed globally any more. `.wrangler/`, `.playwright/` and `.gem/` are all gitignored.

Two mise limitations worth knowing, both verified on 2026.8.9, because they look like config mistakes:

- **`_.path` entries are appended after `/usr/bin`**, so they cannot shadow a system binary. The iOS tasks prepend `$RUBY_BIN` themselves; without it `ruby` is macOS's 2.6 and CocoaPods 1.17 refuses to run (`ffi requires Ruby version >= 3.0`).
- **The `gem:` backend builds against whatever Ruby is on PATH**, not the one in `[tools]` — `mise exec ruby@3.4.9 -- sh -c 'command -v ruby'` still returns `/usr/bin/ruby`. So `gem:cocoapods` cannot be a `[tools]` entry; `tauri:ios:deps` installs into `GEM_HOME` instead.
- Per-task `tools = {}` is silently ignored, so tools cannot be scoped to a single task.

This matters for more than tidiness. When the original worker, D1 and R2 were deleted, the trail sat in 369 global logs belonging to ~40 other projects, under global retention that had already aged out the months in question — which is why the ADR 006 postscript can prove *what* happened but not *who*. With logs scoped here, that investigation is `grep .wrangler/logs`.

**What scoping cannot do:** Cloudflare resources live in one flat account namespace. mise is a local tool with no authority over what exists in Cloudflare, so no config here prevents a credential with delete rights from removing `remy-sport-db`. The control for that is a least-privilege API token (Cloudflare-side); mise can hold it via `CLOUDFLARE_API_TOKEN`, but cannot enforce it.

Notes worth knowing before debugging a deploy:

- **The dev tasks pass `--host localhost`, and must keep doing so.** With a `[[routes]]` block present, plain `wrangler dev` *simulates* that route: `c.req.url`, `Host`, `Origin` and `Referer` all arrive as `http://remy.ubuntusoftware.net` rather than localhost. Browsers cope (wrangler rewrites request and Origin consistently), but anything scripted against the local API then needs to send a hostname it is not actually talking to. The flag is on `dev`, `dev:seed`, `dev:ensure`, `dev:remote` and the Playwright `webServer` — drop it from one and only that path behaves differently.
- **`src/auth.ts` derives `trustedOrigins` from the request** rather than hardcoding a host. That is what makes auth correct on localhost, on workers.dev and in production, and it is independent of the flag above — don't replace it with a fixed list.
- **There is one environment.** `cf:deploy:staging` and `cf:deploy:production` used to exist, passing `--env staging` / `--env production` to wrangler while `wrangler.toml` declared no such environments. Wrangler only *warns* about that and proceeds, so they would have deployed a second worker (`remy-sport-staging`) bound to the **production** D1 and R2. Both tasks are deleted. A real staging environment needs its own database, secrets and migrations — give it an ADR, not a flag.
- **A first deploy is not instantly reachable.** DNS propagation and edge-certificate issuance take minutes, which is what `cf:wait` covers. A machine that queried the hostname before it existed may hold a negative DNS cache entry for several minutes longer.
- **`database_id` is written by `cf:d1:ensure`**, never by hand. If `wrangler.toml` changes after a bootstrap, that is expected — review and commit it.

## Tauri (desktop + iOS)

```bash
mise run tauri:build      # macOS .app + .dmg
mise run dev              # in one terminal — the desktop/iOS shells need it
mise run tauri:dev        # desktop, against the local Worker
mise run tauri:ios:dev    # Simulator, against the local Worker
```

`tauri.conf.json` points `devUrl` at `http://localhost:8787/app`, so the shells load the SPA from the running Worker and the same relative `/api/*` calls work as on the web. `tauri:dev` and `tauri:ios:dev` check for that Worker and say so plainly instead of opening a blank window.

`tauri.conf.json` already runs `mise run web:build` via `beforeDevCommand`/`beforeBuildCommand`, so the Tauri tasks deliberately do **not** list `web:build` in `depends` — doing both rebuilt the SPA twice per invocation.

`tauri:ios:init` installs CocoaPods itself via `tauri:ios:deps` (Tauri otherwise falls back to `gem install`, which needs sudo and fails unattended), and skips once the project exists. The generated `src-tauri/gen/apple` project is committed; `gen/schemas` is not.

`tauri info` should report only two notices, both upstream: `wry` and `tao` show as outdated because `tauri` 2.11.5 — the latest release — pins them. Nothing else should be flagged; if `@tauri-apps/plugin-log` reports "not installed", the SPA's log forwarding in `src/web/main.tsx` has lost its dependency.

## Seed Users (dev/test only)
| Role | Email | Password |
|---|---|---|
| Admin | `admin@remy.dev` | `admin1234!` |
| Organizer | `organizer@remy.dev` | `organizer1!` |
| Coach | `coach@remy.dev` | `coach12345!` |
| Player | `player@remy.dev` | `player1234!` |
| Spectator | `spectator@remy.dev` | `spectator1!` |
| Referee | `referee@remy.dev` | `referee1234!` |

Seeded via `mise run seed` (local) or `mise run seed:remote` (deployed). See ADR 002.

## Dev Docs (`docs/dev/`)
- [docs/dev/README.md](docs/dev/README.md) — entry point for all dev docs
- [docs/dev/roadmap.md](docs/dev/roadmap.md) — phased feature roadmap with provenance from competitor research
- [docs/dev/sites.md](docs/dev/sites.md) — competitive research (feature extraction from 5 basketball/sports platforms)
- [docs/dev/adr/](docs/dev/adr/) — architectural decision records

## User Docs (in the biz repo)

Moved out of this repo by commit `a7222e4` — they live in [remy-sport-biz](https://github.com/joeblew999/remy-sport-biz), which is the source of truth for domain definitions. Cloned locally at `../remy-sport-biz/`.

- [README.md](https://github.com/joeblew999/remy-sport-biz/blob/main/README.md) — entry point for the biz repo
- [data/access/matrix.md](https://github.com/joeblew999/remy-sport-biz/blob/main/data/access/matrix.md) — **primary reference**: full Actor × Feature × Event Type access matrix (W/R)
- [process/roadmap/roadmap.md](https://github.com/joeblew999/remy-sport-biz/blob/main/process/roadmap/roadmap.md) — user-facing feature roadmap
- [domain/actors.md](https://github.com/joeblew999/remy-sport-biz/blob/main/domain/actors.md) — actor/user type definitions
- [domain/event-types.md](https://github.com/joeblew999/remy-sport-biz/blob/main/domain/event-types.md) — event type definitions (Tournament, League, Camp/Clinic, Showcase)

## References
- https://hono.dev/llms.txt
- https://www.better-auth.com/llms.txt
- https://hono.dev/examples/better-auth-on-cloudflare
