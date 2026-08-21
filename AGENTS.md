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

# 2. Trust config and set up everything (deps, migrations, Playwright)
mise trust && mise install && mise run setup

# 3. Start dev server with seeded test data
mise run dev:seed
```

That's it. The server runs on http://localhost:8787 with two seeded users (see Seed Users below).

### AI agent sessions

The SessionStart hook (`.claude/hooks/session-start.sh`) automatically runs steps 1-2 above. After that, run `mise run dev:seed` when you need the server, or `mise run dev` if seeding is not needed.

### Notes
- If `jq` install fails due to GitHub API rate limits, retry with `GITHUB_TOKEN="" mise install jq`
- Run `mise run test` to verify all tests pass (starts its own server, no need for `mise run dev`)
- `mise run seed` can be run separately against an already-running dev server
- Playwright is installed via curl (proxy-safe) with version auto-detected from `node_modules/playwright-core/browsers.json`

## Stack

### Frameworks & Libraries
- **Hono** — web framework (ultrafast, Web Standards based)
- **Zod** — schema validation
- **OpenAPI** — API specification via `@hono/zod-openapi`
- **MCP** — model context protocol
- **Better Auth** — authentication (with plugins for 2FA, organizations, roles, etc.)
- **Drizzle ORM** — database ORM for D1
- **Datastar** — server-driven reactivity via SSE + `data-*` attributes (proposed, see ADR 004)
- **Lit** — Web Components for reusable UI widgets (proposed, see ADR 004)
- **DaisyUI v5** — UI components via CDN (no build step)
- **Tailwind CSS 4** — utility CSS via CDN
- **Playwright** — end-to-end testing

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

**`better-auth` is deliberately pinned to `~1.4.18`, not `^`.** Two independent reasons:

1. 1.7.x changes `sign-in/email` to match `account.issuer === createLocalAccountIssuer("credential")`, a column our schema has no way to produce — every sign-in fails with `User not found` while `/api/seed` still reports the users as existing.
2. **`@better-auth/cli` only publishes up to 1.4.22.** It bundles its own `@better-auth/core`, so installing it alongside `better-auth@1.7.1` hoists `@better-auth/core@1.4.22` against `better-auth@1.7.1`, which expects `1.7.1` — a silently broken tree. Until the CLI ships 1.7.x we cannot generate a 1.7 schema, and generating the schema is the whole point (below).

Re-check with `bun pm view @better-auth/cli versions` before attempting the upgrade.

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

This matters for more than tidiness. When the original worker, D1 and R2 were deleted, the trail sat in 369 global logs belonging to ~40 other projects, under global retention that had already aged out the months in question — which is why the ADR 006 postscript can prove *what* happened but not *who*. With logs scoped here, that investigation is `grep .wrangler/logs`.

**What scoping cannot do:** Cloudflare resources live in one flat account namespace. mise is a local tool with no authority over what exists in Cloudflare, so no config here prevents a credential with delete rights from removing `remy-sport-db`. The control for that is a least-privilege API token (Cloudflare-side); mise can hold it via `CLOUDFLARE_API_TOKEN`, but cannot enforce it.

Notes worth knowing before debugging a deploy:

- **`wrangler dev` simulates the custom domain.** With a `[[routes]]` block present, local requests reach the Worker as `http://remy.ubuntusoftware.net`, not `http://localhost:8787` — `c.req.url`, `Host`, `Origin` and `Referer` are all rewritten, keeping the **http** scheme. `src/auth.ts` therefore derives `trustedOrigins` from the request instead of hardcoding a host; don't replace that with a fixed list.
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
