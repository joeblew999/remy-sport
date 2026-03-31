# ADR 005: API & Authorization

**Status:** Implemented

## Context

The platform has six actor types (Organizer, Coach, Player, Spectator, Referee, Admin) and four event types (Tournament, League, Camp/Clinic, Showcase). The full access matrix is defined in [docs/user/matrix.md](../../user/matrix.md).

API generation and authorization are combined in this ADR because in this stack they are inseparable. `createRoute()` from `@hono/zod-openapi` is the single declaration point for:

- The API contract (Zod schemas, request/response shapes)
- The OpenAPI spec (auto-generated, served as JSON + Swagger UI)
- The security scheme (Session or ApiKey, documented in the spec)
- The authorization middleware (role, ownership, event type — enforced at runtime)

Splitting API and authorization across two ADRs would create constant cross-referencing with no benefit.

## Libraries

| Library | GitHub | Role in this ADR |
|---|---|---|
| Better Auth | [better-auth/better-auth](https://github.com/better-auth/better-auth) | Auth, roles, permissions, API keys |
| Hono | [honojs/hono](https://github.com/honojs/hono) | Middleware stack, route guards |
| @hono/zod-openapi | [honojs/middleware](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) | API generation, security scheme declaration |
| Drizzle ORM | [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) | D1 queries for ownership + event type checks |
| Zod | [colinhacks/zod](https://github.com/colinhacks/zod) | Request/response schema validation |

## Code generation pipeline

```
Zod schemas (source of truth for data shapes)
    │
    └── createRoute()  ←─ security schemes + authz middleware declared here
            │
            ▼
    OpenAPI spec (generated at runtime by @hono/zod-openapi)
            │
    ┌───────┼───────────────┐
    ▼       ▼               ▼
Swagger UI  TypeScript      MCP tools
(/doc)      client SDK      (ADR 003)
            (hey-api /
            openapi-ts)

Drizzle schema (source of truth for DB)
    │
    └── drizzle-kit generate → SQL migrations → D1
            ▲
    Better Auth (writes its own tables via Drizzle adapter)
```

**What is generated:**

| Source | Generates | Tool |
|---|---|---|
| `createAccessControl()` | Typed `Resource` and `Action` types | Better Auth |
| `createRoute()` + Zod schemas | OpenAPI spec JSON | `@hono/zod-openapi` |
| `createRoute()` + `security:` | Security schemes in spec | `@hono/zod-openapi` |
| `createRoute()` + `responses:` | 403/422 documented in spec | `@hono/zod-openapi` |
| OpenAPI spec | TypeScript client SDK | `hey-api` / `openapi-typescript` |
| OpenAPI spec | MCP tools | ADR 003 |
| Drizzle schema | SQL migrations | `drizzle-kit generate` |

**What is NOT generated (written by hand):**
- `ownedBy()` middleware — custom D1 ownership query
- `requireEventType()` middleware — custom D1 event type query
- Role definitions — hand-written using `ac.newRole()`

## Capability gap analysis

| Requirement | Better Auth | Custom |
|---|---|---|
| Authentication (who you are) | ✓ Core | |
| Platform admin role | ✓ [Admin plugin](https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/plugins/admin) | |
| Org-level roles (Organizer, Coach) | ✓ [Organization plugin](https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/plugins/organization) | |
| Custom resource/action permissions | ✓ `createAccessControl()` | |
| Server-side permission check | ✓ `auth.api.hasPermission()` | |
| API key access with scopes | ✓ [API Key plugin](https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/plugins/api-key) | |
| Bearer token (non-browser clients) | ✓ [Bearer plugin](https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/plugins/bearer) | |
| OpenAPI security scheme declaration | ✓ `createRoute({ security })` | |
| Per-route middleware in OpenAPI routes | ✓ `createRoute({ middleware })` | |
| Resource ownership ("own event only") | ✗ | D1 query + middleware |
| Event-type-specific rules | ✗ | D1 query + middleware |
| Referee scoped to specific match | ✗ | Join table + middleware |
| Audit logging | ✗ | Future ADR |

## Decision

### Step 1 — App setup: security schemes + session middleware

```ts
// src/app.ts
import { OpenAPIHono } from '@hono/zod-openapi'

export const app = new OpenAPIHono()

// Register security schemes — appear in OpenAPI spec and Swagger UI
app.openAPIRegistry.registerComponent('securitySchemes', 'Session', {
  type: 'http',
  scheme: 'bearer',
  description: 'Better Auth session token (browser)',
})
app.openAPIRegistry.registerComponent('securitySchemes', 'ApiKey', {
  type: 'apiKey',
  in: 'header',
  name: 'x-api-key',
  description: 'Better Auth API key (integrations, MCP)',
})

// Global session middleware — runs before all routes
// Resolves session from cookie, bearer token, or API key transparently
app.use('*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set('user', session?.user ?? null)
  c.set('session', session?.session ?? null)
  await next()
})

// Serve OpenAPI spec and Swagger UI
app.doc('/openapi.json', { openapi: '3.0.0', info: { title: 'Remy Sport API', version: '1.0.0' } })
app.get('/doc', swaggerUI({ url: '/openapi.json' }))
```

### Step 2 — Access control schema (Better Auth)

Single source of truth for all role permissions.

```ts
// src/auth/access-control.gen.ts (generated from docs/matrix.json)
import { createAccessControl } from 'better-auth/plugins/access'

export const ac = createAccessControl({
  event:      ['create', 'read', 'update', 'delete'],
  team:       ['create', 'read', 'update', 'delete'],
  player:     ['create', 'read', 'update'],
  roster:     ['manage'],
  score:      ['enter', 'read'],
  bracket:    ['generate', 'read'],
  fixture:    ['generate', 'read'],
  session:    ['define', 'read'],       // camp sessions
  attendance: ['record', 'read'],
  court:      ['assign', 'read'],
  user:       ['manage'],               // admin only
})

export const organizer = ac.newRole('organizer', {
  event:      ['create', 'read', 'update', 'delete'],
  score:      ['enter', 'read'],
  bracket:    ['generate', 'read'],
  fixture:    ['generate', 'read'],
  session:    ['define', 'read'],
  attendance: ['record', 'read'],
  court:      ['assign', 'read'],
  team:       ['read'],
  player:     ['read'],
})

export const coach = ac.newRole('coach', {
  event:      ['read'],
  team:       ['create', 'read', 'update'],
  player:     ['create', 'read', 'update'],
  roster:     ['manage'],
  attendance: ['record', 'read'],
  score:      ['read'],
  bracket:    ['read'],
  fixture:    ['read'],
  session:    ['read'],
})

export const player = ac.newRole('player', {
  event:      ['read'],
  player:     ['create', 'read', 'update'],  // own profile only — enforced by ownedBy
  score:      ['read'],
  bracket:    ['read'],
  fixture:    ['read'],
  session:    ['read'],
  team:       ['read'],
})

export const spectator = ac.newRole('spectator', {
  event:      ['read'],
  score:      ['read'],
  bracket:    ['read'],
  fixture:    ['read'],
  session:    ['read'],
  team:       ['read'],
  player:     ['read'],
})

export const referee = ac.newRole('referee', {
  event:      ['read'],
  score:      ['enter', 'read'],
  bracket:    ['read'],
  fixture:    ['read'],
  court:      ['read'],
})
```

### Step 3 — Authorization middleware

```ts
// src/middleware/require-permission.ts — Layer 1: role check via Better Auth
export const requirePermission = (resource: Resource, action: Action) =>
  createMiddleware(async (c, next) => {
    const allowed = await auth.api.hasPermission({
      headers: c.req.raw.headers,
      permissions: { [resource]: [action] },
    })
    if (!allowed) return c.json({ error: 'Forbidden' }, 403)
    await next()
  })

// src/middleware/owned-by.ts — Layer 2: resource ownership (no built-in RLAC in Better Auth)
export const ownedBy = (table: Table, idParam: string) =>
  createMiddleware(async (c, next) => {
    const user = c.get('user')
    const resource = await db.select().from(table).where(eq(id, c.req.param(idParam))).get()
    if (resource.createdBy !== user?.id) return c.json({ error: 'Forbidden' }, 403)
    await next()
  })

// src/middleware/event-type.ts — Layer 3: event type scoping (not in Better Auth)
export const requireEventType = (...types: EventType[]) =>
  createMiddleware(async (c, next) => {
    const event = await db.select().from(events).where(eq(id, c.req.param('eventId'))).get()
    if (!types.includes(event.type)) return c.json({ error: 'Not applicable for this event type' }, 422)
    await next()
  })
```

### Step 4 — Route definition: API + authz in one place

```ts
// src/routes/scores.ts
const enterScoreRoute = createRoute({
  method: 'post',
  path: '/events/{eventId}/scores/{matchId}',

  // API contract — Zod schemas → OpenAPI spec
  request: {
    params: z.object({ eventId: z.string(), matchId: z.string() }),
    body: { content: { 'application/json': { schema: ScoreSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: ScoreResponseSchema } }, description: 'Score recorded' },
    403: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Forbidden' },
    422: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not applicable for this event type' },
  },

  // Security — documented in OpenAPI spec and Swagger UI
  security: [{ Session: [] }, { ApiKey: [] }],

  // Authorization — enforced at runtime, three layers in order
  middleware: [
    requirePermission('score', 'enter'),                    // Layer 1: role (Better Auth)
    ownedBy(matches, 'matchId'),                            // Layer 2: ownership (custom)
    requireEventType('tournament', 'league', 'showcase'),   // Layer 3: event type (custom)
  ] as const,
})

app.openapi(enterScoreRoute, scoreHandler)
```

**Public routes** declare no `security` and no `middleware`:

```ts
const listEventsRoute = createRoute({
  method: 'get',
  path: '/events',
  responses: { 200: { ... } },
  // no security — no middleware — fully public
})
```

### Rules

- **Spectators** — read-only roles in `createAccessControl()`. Always fail `requirePermission()` on write actions. No special handling needed.
- **API keys** — `auth.api.hasPermission()` resolves permissions from session and API key transparently. Same middleware works for both.
- **Event type mismatches** — return `422` not `403`. The actor has permission; the operation doesn't apply to this event type.
- **Referee match scoping** — deferred to Phase 6. `ownedBy` will query `match_referee` join table when implemented.

## Files

```
src/
  app.ts                     — OpenAPIHono setup, security schemes, session middleware
  auth/
    access-control.gen.ts    — createAccessControl() schema and role definitions (generated)
  middleware/
    require-permission.ts    — Layer 1: Better Auth hasPermission()
    owned-by.ts              — Layer 2: resource ownership D1 query
    event-type.ts            — Layer 3: event type D1 query
  routes/
    events.ts
    teams.ts
    scores.ts
    brackets.ts
    ...
```

## Mise tasks

| Task | Purpose |
|---|---|
| `mise run seed` | Seeds admin, organizer, coach, player accounts with correct roles |
| `mise run test` | Playwright tests covering authz scenarios per actor and event type |
| `mise run dev` | Serves Swagger UI at `/doc` — security schemes and 403/422 responses visible |

## Consequences

- API contract, security documentation, and authorization enforcement are co-located in `createRoute()` — they cannot drift apart
- The OpenAPI spec is the authoritative API reference — consumed by Swagger UI, TypeScript client SDK generation, and MCP (ADR 003)
- `createAccessControl()` is the single source of truth for role permissions — typed at compile time
- API key and session auth use the same permission model and middleware — no divergence
- Resource ownership and event-type rules require two D1 queries per write request — acceptable on Cloudflare Workers
- Audit logging not covered here — separate future ADR
