# ADR 015: Controlled vocabularies become tables, and Zod 4 arrives with them

**Status:** Accepted (2026-08-24) — **§3 and §4 overtaken.** The route files this ADR names (`src/routes/teams.ts`, `src/routes/*.ts`) became oRPC procedures under `src/api/` in `c4d326a`. More substantively, §4's conclusion — that the enums must stay hand-written at the boundary because `createInsertSchema` on a `TEXT` column yields `z.string()` — is true of the columns *as they were declared*, not of drizzle-zod. The columns now declare `text(…, { enum: … })` against the generated code tuples, which narrows `$inferSelect` to the literal union and makes `createInsertSchema` produce a real enum — so the vocabulary is enforced by the type system, and the four casts this ADR's approach required are gone. The *request* schemas in `src/domain/api.ts` are still hand-written, because `names` and the date regex are refinements no column expresses. §1, §2 and §5 stand unchanged; §2's foreign keys are still the only thing constraining the database itself.

## Context

`age_group_code`, `gender_code`, `org_type_code`, event type and format, and `province_code` were plain `TEXT` columns, validated only by Zod enums hand-written in `src/routes/*.ts`. Two problems, and the second is the one that matters.

The database accepted anything. `"U99"` was a valid `age_group_code` as far as SQLite was concerned, so a bad value could arrive from the seed route, a migration, or any future writer that did not pass through those two route files. Validation existed at exactly one door of several.

And the vocabularies are not ours. They live in `remy-sport-biz/data/seed/*.jsonl`, which AGENTS.md names as the source of truth. A hand-copied enum is a fork of the PO's data with nothing checking the copy — the enums also lacked the Thai names entirely, so a bilingual product could only ever render codes.

This was surfaced while evaluating a proposal to adopt `drizzle-zod` and derive validation from the tables. That could not have worked as proposed: `createInsertSchema` on a `text("age_group_code")` column yields `z.string()`, so deriving would have *replaced* a working enum with something that accepts `"U99"`. Reference tables first, derivation second.

## Decision

### 1. Six reference tables, seeded from biz

[Migration 0009](../../../src/db/migrations/0009_reference_vocabularies.sql) creates `age_group`, `gender`, `org_type`, `event_type`, `event_format` and `province`, with codes and both names copied verbatim from the biz fixtures. They are seeded in the migration rather than through `/api/seed`, because the foreign keys have to be satisfiable the moment they exist.

`sort` is carried because age order is not code order — sorting `age_group` by code gives `OPEN, SENIOR, U10, U12…`, which is useless in a dropdown.

Two deliberate deltas, both recorded in the migration:

- **`event_type` codes stay lowercase**, unlike the biz fixtures. Migration 0005 already recorded why: this repo's published OpenAPI enum is lowercase, and changing it would break clients for no gain. The mapping is one-to-one.
- **`province` holds the PO's 15-province starter set, not all 77.** The fixture is explicitly a starter set the PO extends as the pilot expands; seeding all 77 would invent Thai names the PO has not curated.

### 2. Foreign keys, which required rebuilding `team`

SQLite cannot add a constraint to an existing table, so `team` is rebuilt with `age_group_code` and `gender_code` as foreign keys. The copy filters to rows whose codes are in the vocabulary, and the row count was checked before and after (7 → 7) rather than assumed — a rebuild is the wrong place to discover a violating row.

Verified that the constraint actually bites, rather than trusting that SQLite would enforce it: inserting `age_group_code = 'U99'` directly now fails with `SQLITE_CONSTRAINT_FOREIGNKEY`, and nothing lands.

`event` and `organization` are deliberately left alone. `organization` is Better Auth's table, and rebuilding it would put this migration in the path of a future generated schema; `event.province_code` is nullable free text on rows that predate the province list.

### 3. `/api/reference`, with drizzle-zod where it earns its place

The vocabularies are now served, with Thai names, so the SPA stops needing its own copies. The response schemas are **derived from the tables** with `createSelectSchema`: the response *is* the table, so a column added to `age_group` cannot be silently missing from the API.

It is deliberately not used for the domain routes. `/api/teams` returns joined organisation columns that are not on `team` at all, and validates codes as enums a `TEXT` column cannot express. Derivation there would weaken both.

### 4. The enums stay, and are now checked

`src/routes/teams.ts` still declares `z.enum([...])`, because a `TEXT` column cannot express a vocabulary to the type system and the API should reject bad input at the boundary rather than surfacing a foreign-key error. The difference is that the copy is now checked: [reference.test.ts](../../../tests/worker/reference.test.ts) asserts the served vocabularies match the PO's lists exactly, so a change upstream fails a test instead of drifting silently.

### 5. Zod 4

`zod` was pinned at `^3.25.76` while better-auth carried its own nested Zod 4. Bumping zod alone would have failed: `@hono/zod-openapi@0.18.4` declares a hard `zod: 3.*` peer and is load-bearing — four source files use `OpenAPIHono`/`createRoute`, and the Worker serves `/openapi.json` and `/doc`. `@hono/zod-openapi@1.6.1` requires Zod 4, so the two moved together. `bun pm why zod` now reports a single `zod@4.4.3`.

No call sites changed. The v3→v4 breaks concentrate in error handling (`.errors` → `.issues`, `ZodError` shape) and options like `invalid_type_error`; this codebase uses none of them. Verified beyond the type-checker, because a 0.18→1.6 major is exactly where a generated spec degrades quietly: `/doc` renders, `/openapi.json` lists every path, and request bodies are still rejected against their schemas.

`@hono/zod-validator` was **not** added: it is already in the tree as a dependency of `@hono/zod-openapi`, which uses it internally. `createRoute` plus `c.req.valid("json")` already validates every request body — adding it explicitly would put a second validation layer on routes that already reject bad input.

## Consequences

**Positive**

- The vocabulary is enforced by the database, not only by two route files.
- Thai names are available to the API and the SPA for the first time.
- A change to the PO's vocabularies now fails a test instead of drifting.
- One Zod, on the current major.

**Negative**

- Vocabulary values are duplicated between the biz JSONL and migration 0009. The test asserts they agree, but nothing regenerates one from the other — a change upstream means editing a migration by hand.
- `event.type`, `event.format` and `province_code` are still unconstrained columns; only `team` got foreign keys. The remaining tables need the same rebuild treatment.
- Six more tables in a schema that is already large.

**Follow-ups**

- Constrain `event.type`/`event.format` and the `province_code` columns the same way.
- The SPA still hardcodes some labels; `/api/reference` exists now but nothing consumes it yet.
- No rate limiting on `send-verification-otp`; `TEST_OTP` must be unset before real users.
