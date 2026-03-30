# Project Context

<!-- This is the main agent context file. CLAUDE.md and GEMINI.md are aliases that point here. -->

## Claude Code Bootstrap (run at session start)

When starting a new session, run these commands in order to get the project running:

```bash
# 1. Install mise (if not already installed)
curl https://mise.run | sh
export PATH="$HOME/.local/bin:$PATH"
eval "$(mise activate bash)"

# 2. Trust the project config
mise trust

# 3. Install deps + apply local D1 migrations
mise run setup

# 4. Start dev server (runs on http://localhost:8787)
mise run dev
```

**Notes:**
- If `jq` install fails due to GitHub API rate limits, retry with `GITHUB_TOKEN="" mise install jq`
- Playwright browser download may fail in cloud environments (DNS blocks to `storage.googleapis.com`). API tests will still pass; browser tests will be skipped.
- After the dev server is running, seed dev users with `mise run seed`
- Run `mise run test` to verify — expect API tests to pass; browser tests require Playwright chromium installed locally (`bun x playwright install --with-deps chromium`)

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
- Reference ADRs from CONTEXT.md when they affect conventions or architecture

## Conventions
- All plan and architectural decision files go in `docs/dev/adr/`
- Always use `mise run` commands to run things (e.g. `mise run dev`, `mise run test`, `mise run deploy`) — both AI agents and humans use the same mise tasks so we dogfood our own tooling
- Never run raw `bun`, `bunx wrangler`, or other commands directly when a mise task exists for it
- Mise tasks must be **idempotent** where possible — tasks should skip when inputs haven't changed
- Mise tasks must work **without requiring user args** — use env vars with defaults or auto-detection instead of positional args
- Continuously refactor mise tasks, code, and this CONTEXT.md as you work — keep everything clean and up to date
- Always use well-known `autocomplete` attributes on form fields (`email`, `name`, `current-password`, `new-password`, etc.) so browser autofill and password managers work correctly
- Run `mise run test` after changes to verify everything still works

## Seed Users (dev/test only)
| Role | Email | Password |
|---|---|---|
| Admin | `admin@remy.dev` | `admin1234!` |
| User | `user@remy.dev` | `user12345!` |

Seeded via `mise run seed` (local) or `mise run seed:remote` (deployed). See ADR 002.

## Dev Docs (`docs/dev/`)
- [docs/dev/README.md](docs/dev/README.md) — entry point for all dev docs
- [docs/dev/roadmap.md](docs/dev/roadmap.md) — phased feature roadmap with provenance from competitor research
- [docs/dev/sites.md](docs/dev/sites.md) — competitive research (feature extraction from 5 basketball/sports platforms)
- [docs/dev/adr/](docs/dev/adr/) — architectural decision records

## User Docs (`docs/user/`)
- [docs/user/README.md](docs/user/README.md) — entry point for all user docs
- [docs/user/matrix.md](docs/user/matrix.md) — **primary reference**: full Actor × Feature × Event Type access matrix (W/R)
- [docs/user/roadmap.md](docs/user/roadmap.md) — user-facing feature roadmap
- [docs/user/actors.md](docs/user/actors.md) — actor/user type definitions
- [docs/user/event-types.md](docs/user/event-types.md) — event type definitions (Tournament, League, Camp/Clinic, Showcase)

## References
- https://hono.dev/llms.txt
- https://www.better-auth.com/llms.txt
- https://hono.dev/examples/better-auth-on-cloudflare
