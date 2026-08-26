# ADR 020: Keeping the map honest — dead-code and documentation checks

**Status:** Implemented (2026-08-26)

## Context

Reviewing this repo against a migration brief surfaced what looked like accumulated technical debt. It was not. Dating it settled the question:

```
c4d326a  2026-08-25  oRPC the whole API      ← the day before the review
21213e6  2026-08-25  Languages are rows      ← same day
bc96121  2026-03-30  ADR index last updated  ← five months
```

Almost everything found was one day old — the wake of two commits, not yet settled. The code was in good shape. The *notes about the code* were not, and that turned out to matter more than usual here.

### The failure worth naming

AGENTS.md described a `translation` table keyed `(table_name, record_key, field_name, locale_code)`, and pointed at `src/domain/localized.ts` for reading and writing it. Neither ever existed.

`git log -S` puts that text in `21213e6` — **the same commit whose migration 0010 states, at length, that a JSON column on the row was chosen instead.** The design changed during implementation, for good reasons that are well documented in the migration. The prose was written from the plan going in, not the result coming out. It was never stale. It was wrong on arrival.

And it propagated. The migration brief that prompted this review instructed, emphatically, that a `localized()` helper joining that table must be preserved and not replaced. Whoever wrote the brief read AGENTS.md and believed it. Without a check against the actual schema, the next session's work would have been rebuilding something the previous session had deliberately removed.

That is the specific risk in an agent-driven repo: `CLAUDE.md` points every session at `AGENTS.md`, so a wrong note there does not merely mislead a reader — it becomes wrong work.

### Hand-grepping is not a substitute

Dead code from the same migration was found by grep, and the grep was wrong twice in one session:

- A search for `views/versions` missed `import { versionsWidget } from "./versions"` and pronounced a live file dead. A draft ADR carried that error until a tool contradicted it.
- The same pattern bug earlier reported `lib/api.ts` and `lib/localizer.ts` as unimported when both are live.

Meanwhile `src/web/components/crest.tsx` — which a draft ADR argued at some length should be *kept* — turned out to have no importers at all. Every crest on screen comes from `.crest` rules in `styles.css`; the component was a dead duplicate nobody had noticed.

Three findings, two of them wrong, in the category a tool does perfectly.

## Decision

Three checks and a tool, all matching the shape this repo already uses for generated files (`auth:schema:check`, `domain:check`): compare an artifact against its source of truth and fail on drift. Here the artifacts are dead code, documented paths, and the rules AGENTS.md itself states. A fourth thing — prose that is wrong while every path in it resolves — cannot be automated at all, and is a convention instead.

The framing that matters: **an agent has no memory to contradict a stale rule with.** A human reading "there is a `translation` table" thinks *that's not right, I remember*. An agent believes it and builds on it. So in a repo built this way, the documentation's accuracy is load-bearing in a way it never is otherwise, and the load-bearing parts should fail rather than merely be written.

### 1. `check:dead` — unreachable files and undeclared imports

`knip`, configured in [`knip.jsonc`](../../../knip.jsonc), run as `--include files,unlisted`.

**`files`** catches orphans. It found the three Hono middlewares the oRPC migration replaced (`require-permission.ts`, `owned-by.ts`, `event-type.ts` — the last already recorded in ADR 005 as "built but never called") plus `crest.tsx`. All four are deleted.

**`unlisted`** catches an import that resolves only because it happens to be somebody else's transitive dependency. It found one: `openapi-types`, imported by `src/domain/contract.ts` and absent from `package.json`. Now declared. That would have broken the day its parent dropped it, with a stack trace pointing nowhere useful.

**Unused *exports* are reported but not enforced**, and that restraint is the point. That report is ~35 entries here, most of them deliberate — access-control roles declared as a complete set, drizzle relation objects, schemas kept beside the ones in use. A check that is mostly false positives gets ignored, and the one real finding gets ignored with it. `bun x knip` gives the full report when someone wants to work through it.

### 2. `check:docs` — every documented path resolves

[`scripts/docs-check.ts`](../../../scripts/docs-check.ts) extracts file paths from markdown links and from backticked prose, resolves them against the tree, and fails on a miss. 226 paths currently checked.

Two design decisions do the real work:

**ADRs are checked differently from AGENTS.md.** AGENTS.md, CLAUDE.md and README.md describe what *is*, so every path must resolve. An ADR is a dated decision record: it legitimately names files that do not exist yet — the ones it proposes — and files that no longer do. An ADR describing a UI that was never built is that ADR being *correct*. So for ADRs only markdown links are checked, because navigation has to work; paths in prose are left alone. Without that split the check produced 40+ findings, nearly all noise, and would have been switched off within a week.

**Prose shorthand resolves.** Docs write "a fetch in `lib/api.ts`" meaning `src/web/lib/api.ts`. Candidate prefixes are tried, so sentences do not have to carry full paths to pass. A path that resolves under none of them has genuinely drifted.

`<!-- docs-check-ignore -->` on a line exempts it, for the case where a doc names a path deliberately to say it is *absent*.

It immediately found four real ones, including AGENTS.md still citing `src/routes/teams.ts` for the two-question authorization pattern — that file became `src/api/teams.ts` in the oRPC migration.

### 3. `check:conventions` — the rules in AGENTS.md, made executable

The two checks above verify that *names* resolve. Neither can see a rule that has quietly stopped being true. [`scripts/check-conventions.ts`](../../../scripts/check-conventions.ts) asserts eight load-bearing claims from AGENTS.md directly against the tree:

| Claim | Enforced by |
|---|---|
| "There is no `translation` table" | no `CREATE TABLE translation` / `sqliteTable("translation")` |
| "no `nameTh` field anywhere, ever again" | current schema files only |
| "`emailAndPassword` is off" | the config block actually says `enabled: false` |
| "no passwords anywhere, including the seed" | `seed-data.ts` |
| "there is one environment" | no `[env.*]` in `wrangler.toml` |
| "the dev tasks pass `--host localhost`" | the four tasks plus the Playwright `webServer` |
| "never pass the *platform* `ac`/`roles` to a plugin" | `auth.config.ts` |
| "the `hc` client is gone" | no `hono/client` import |

Two scoping decisions carry the design, and the first was got wrong on the first run:

**Migrations are history and are not checked.** The `nameTh` rule initially failed against migrations 0005, 0006 and 0010 — 0005 and 0006 *created* the column, 0010 *dropped* it, and all three must keep saying so. Same reasoning as ADRs: append-only records are not current state. The rule checks `src/db/*schema*.ts` only.

**Comments are excluded.** The clearest statements of these rules live in `src/domain/names.ts` and `src/domain/api.ts`, and would otherwise fail the very rule they assert.

The seventh rule is the subtle one. `auth.config.ts` *does* pass `ac` and `roles` to the admin and organization plugins — their own scoped `adminAc`/`orgAc`. What must never be passed is the **platform** controller, which *replaces* the plugin's built-in roles. That is the distinction that broke twice (ADR 009, ADR 013), and it is now the difference between a passing and a failing check rather than a paragraph someone has to notice.

Verified by breaking it: adding `nameTh: text("name_th")` to `app-schema.ts` fails the check at both call sites; removing it passes.

### 4. `mise run probe` — measure instead of asserting

Pipe a snippet in, it is typechecked against the real project, and it is deleted whether it passes or not. `WEB=1` targets the SPA's tsconfig instead of the Worker's — which is usually the question, and is exactly what the contract-first question turned on.

```sh
echo 'import type { Router } from "../api/index"
      export type P = Router' | WEB=1 mise run probe
```

That one command reproduces §1's entire finding — four errors, one file — in two seconds. Every wrong belief corrected in this session died to the same technique, done by hand. Making it a task removes the excuse.

One implementation detail that cost a wrong result: the probe file must land **inside** `src/`. A root-level file is outside the tsconfig's `include`, so tsc resolves `node_modules` differently and reports phantom `Cannot find module '@orpc/server'` errors that have nothing to do with the probe.

### 5. The convention — for what no check can see

Both checks verify that names resolve. Neither can see a paragraph in which every path resolves and the meaning is wrong. The `translation` paragraph would have passed both.

So, added to AGENTS.md § Conventions:

> **If you change your mind while building, re-read this file's section on it before you commit.**

That is the whole fix for the case that actually caused harm. It is a habit, not a gate, and writing it down is the most that can be done about it — which is worth stating plainly rather than implying the tooling has it covered.

### 6. `mise run followups` — one view of the backlog

The ADRs have carried a **Follow-ups** section since 009. There are **35 items across 11 ADRs**, and no way to see them together, which is most of why the repo *felt* debt-laden. [`scripts/followups.ts`](../../../scripts/followups.ts) prints them as one list.

Deliberately not a generated `follow-ups.md`: a committed summary is one more artifact that can go stale, which is the exact failure this ADR exists to stop. Reading the ADRs live means it cannot disagree with them. Closing an item is deleting its bullet from the ADR that owns it, which keeps each ADR an honest record of what is still open rather than an archive of everything ever considered.

### 7. Not adopted: a "debt free" target

"Tech debt free" is not a reachable steady state — doing work generates follow-ups. The reachable target is narrower and more useful: **no gap between the map and the territory.** That is what was actually broken, and it is what these checks defend.

## Implementation

Done, in this order, with each step verified before the next:

1. `scripts/docs-check.ts`. First run: 40+ findings. Split ADRs from descriptive docs and added prefix resolution → 4 findings, all real. Fixed all four.
2. `knip` as a devDependency + `knip.jsonc`. Scoped to `files,unlisted` after the full report proved too noisy to enforce.
3. Deleted `src/middleware/{require-permission,owned-by,event-type}.ts` and `src/web/components/crest.tsx`. Declared `openapi-types`.
4. `check` rebuilt as `tsc` + `check:dead` + `check:docs`. Deleting the four files immediately broke three doc links, which `check:docs` caught on the next run — the two checks holding each other honest, on their first day.
5. `scripts/followups.ts` + `mise run followups`.
6. The convention into AGENTS.md, and the corrections to ADRs 007, 008, 017 and 019 that the checks surfaced.

Verified: `mise run check` passes all three (229 paths resolve, no unreachable files, no undeclared imports), and `mise run typecheck` is clean for both the Worker and the SPA.

### mise tasks

| Task | What it does |
|---|---|
| `mise run check` | `tsc --noEmit`, then `check:dead`, `check:docs`, `check:conventions`. The pre-commit gate. |
| `mise run check:dead` | `knip --include files,unlisted`. Unreachable files and undeclared imports. |
| `mise run check:docs` | Every path named in documentation resolves. |
| `mise run check:conventions` | The eight load-bearing rules in AGENTS.md still hold. |
| `mise run probe` | Typecheck a piped snippet against the real project, then delete it. `WEB=1` for the SPA. |
| `mise run followups` | All open follow-ups, grouped by ADR. |

`check` deliberately declares **no `sources`/`outputs`**. Dead-code and docs drift depend on files the task does not read as inputs — a deleted importer, an edited `.md` — so mise's caching would skip precisely the run that would have caught the drift. It costs about four seconds.

## Consequences

**Positive**

- The class of bug that generated wrong work — a doc naming something that does not exist — now fails a task instead of reaching the next session.
- Four dead files gone, one undeclared dependency declared, found by a tool rather than by grepping, which was demonstrably unreliable.
- The two checks catch each other's fallout: deleting code breaks the docs that cite it, and `check:docs` says so immediately.
- 35 follow-ups are visible in one place for the first time.
- Three ADRs (007, 008, 017) and one from this same session (019) were corrected by the checks on their first run — including a claim in 017 that a file should be kept which had no importers, and one in 019 that a live file was dead.

**Negative**

- `knip` is a new devDependency in the critical path of `mise run check`. A false positive after an upgrade blocks a commit until someone configures around it.
- `--include files,unlisted` means the ~35 unused exports are *known and unenforced*. That is a deliberate trade for a check people will keep running, but it is a gap, and someone will eventually be surprised that a dead export passed.
- `check:docs` is a bespoke script, so its parsing is only as good as its regexes. It will miss a path format nobody anticipated, and `<!-- docs-check-ignore -->` is available to anyone who would rather silence it than fix the doc.
- `mise run check` is four seconds slower and uncacheable, by design.
- The convention in §3 is the part that matters most and the part with no enforcement at all.

**Follow-ups**

- `@tauri-apps/api` is a declared dependency nothing imports. Left alone rather than removed, because the Tauri build could not be tested in this session — verify and drop it.
- `@tauri-apps/plugin-log` is a devDependency but is imported at runtime by `src/web/main.tsx`. Wrong section; move it.
- Work through the ~35 unused exports by hand with `bun x knip`, and consider enforcing that reporter once the real ones are cleared.
- `docs/dev/roadmap.md` still says "ADR needed: 009-live-realtime"; 009 has been taken since April and live scoring is now ADR 018.
