# Project Context

<!-- This is the main agent context file. CLAUDE.md and GEMINI.md are aliases that point here. -->

## Stack

### Frameworks & Libraries
- **Hono** — web framework (ultrafast, Web Standards based)
- **Zod** — schema validation
- **OpenAPI** — API specification via `@hono/zod-openapi`
- **MCP** — model context protocol
- **Better Auth** — authentication (with plugins for 2FA, organizations, roles, etc.)
- **Drizzle ORM** — database ORM for D1
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
- **Taskfile** — task runner

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
- All ADRs live in `docs/adr/` with the naming convention `NNN-short-title.md` (e.g. `001-deployment-versioning.md`)
- ADRs document **plans before implementation** — write the ADR first, get approval, then implement
- ADR format: **Status** (proposed/accepted/implemented), **Context** (why), **Decision** (what), **Implementation** (how, with concrete steps and file paths), **Consequences** (trade-offs)
- ADRs **must include Taskfile changes** — every feature needs tasks for running, seeding, testing, deploying, etc. If a feature adds new workflows, the ADR must specify the exact task names and what they do
- Reference ADRs from CONTEXT.md when they affect conventions or architecture

## Conventions
- All plan and architectural decision files go in `docs/adr/`
- Always use `task` commands to run things (e.g. `task dev`, `task test`, `task deploy`) — both AI agents and humans use the same Taskfile so we dogfood our own tooling
- Never run raw `bun`, `bunx wrangler`, or other commands directly when a task exists for it
- Taskfile tasks must be **idempotent** — use `sources`/`generates` checksums so tasks skip when inputs haven't changed. Every task that can be idempotent should be (install, check, deploy, versions, etc.)
- Taskfile tasks must work **without requiring user args** — use named vars with defaults, project-level config, or auto-detection instead of CLI_ARGS
- Continuously refactor Taskfiles, code, and this CONTEXT.md as you work — keep everything clean and up to date
- Always use well-known `autocomplete` attributes on form fields (`email`, `name`, `current-password`, `new-password`, etc.) so browser autofill and password managers work correctly
- Run `task test` after changes to verify everything still works

## Seed Users (dev/test only)
| Role | Email | Password |
|---|---|---|
| Admin | `admin@remy.dev` | `admin1234!` |
| User | `user@remy.dev` | `user12345!` |

Seeded via `task seed` (local) or `task seed:remote` (deployed). See ADR 002.

## References
- https://hono.dev/llms.txt
- https://www.better-auth.com/llms.txt
- https://hono.dev/examples/better-auth-on-cloudflare
