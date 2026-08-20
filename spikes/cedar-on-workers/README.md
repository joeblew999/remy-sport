# cedar-on-workers spike

NOT USING THIS BECAUSE we have beter auth with RBAC.

Goal: verify `@cedar-policy/cedar-wasm` runs on Cloudflare Workers and correctly evaluates a slice of remy-sport's real `permissions.csv` policy. Settles the only unknown left in the Cedar-vs-OpenFGA evaluation for ADR-002.

## What it tests

A real slice of `remy-sport-biz/data/seed/permissions.csv`:

```
EDIT_EVENT,OWNER
EDIT_EVENT,CO_ORGANIZER
EDIT_EVENT,PLATFORM_ADMIN
DELETE_EVENT,OWNER
DELETE_EVENT,PLATFORM_ADMIN
```

Modeled in Cedar as two `permit` policies, with four sample users (alice=OWNER, bob=CO_ORG, carol=PLATFORM_ADMIN, dave=unrelated) on one event (`evt_001`).

## Run

```sh
bun install
bun run dev    # wrangler dev on :8788
bun run size   # wrangler deploy --dry-run, report bundle size
```

Five scenarios, all return the expected decision:

| Principal | Action | Resource | Expected | Result |
|---|---|---|---|---|
| alice (OWNER) | EDIT_EVENT | evt_001 | allow | allow (policy0) |
| bob (CO_ORG) | EDIT_EVENT | evt_001 | allow | allow (policy0) |
| carol (ADMIN) | DELETE_EVENT | evt_001 | allow | allow (policy1) |
| bob (CO_ORG) | DELETE_EVENT | evt_001 | deny | deny |
| dave (none) | EDIT_EVENT | evt_001 | deny | deny |

## Measured

### Run 1: hardcoded entities, 2 policies

- **Bundle**: 4272 KiB raw / **1431 KiB gzipped**.
- **Cold start** (first req after init): ~5 ms on localhost.
- **Warm avg**: ~2.7 ms / req on localhost.
- **WASM init**: lazy on first request via `@cedar-policy/cedar-wasm/web` + explicit `init(wasmModule)`.

### Run 2: codegen + full 186-permission policy set + local D1 + two loading patterns

Codegen (`bun scripts/regen-cedar.ts`) reads the real `remy-sport-biz/data/seed/*.csv` and emits `src/generated/policies.ts`: **186 CSV permission rows → 69 grouped Cedar `permit` policies**, 12.5 KB of source.

- **Bundle**: 4289 KiB raw / **1434 KiB gzipped** — full policy set adds **+3 KiB compressed** over Run 1. Still well under Workers free tier (3 MB).

Loading patterns compared, side-by-side against local D1 (Wrangler local mode) with seeded users/events/teams:

| Pattern | Load step | Total per check | Notes |
|---|---:|---:|---|
| **D1-per-check** (`/check/d1`) | ~1.3 ms | **~2.8 ms** | Fresh D1 `batch()` every call. No cache. Always consistent. |
| **Isolate-cache MISS** (`/check/cached`, cold) | ~3 ms | **~5 ms** | First hit per (principal, resource) — D1 batch + bookkeeping overhead. Slightly slower than naive D1. |
| **Isolate-cache HIT** (`/check/cached`, warm) | ~0.03 ms | **~1.2 ms** | Subsequent reqs for same (principal, resource). Cedar eval cost dominates. |

Localhost numbers are an underestimate of the production gap. Real Workers + D1 same-region is ~5–10 ms per batch (network to colo replica), so the cache pattern's win on warm paths gets wider in prod (~10× speedup on hot reads) while staying ~equal on cold reads.

Correctness verified on six scenarios across Event and Team resources:

| Principal | Action | Resource | Expected | D1 result | Cached result |
|---|---|---|---|---|---|
| alice (OWNER) | EDIT_EVENT | evt_001 | allow | ✓ allow | ✓ allow |
| bob (CO_ORG) | EDIT_EVENT | evt_001 | allow | ✓ allow | ✓ allow |
| carol (ADMIN) | DELETE_EVENT | evt_001 | allow | ✓ allow | ✓ allow |
| dave (none) | EDIT_EVENT | evt_001 | deny | ✓ deny | ✓ deny |
| frank (HEAD_COACH) | MANAGE_ROSTER | team_001 | allow | ✓ allow | ✓ allow |
| dave (none) | MANAGE_ROSTER | team_001 | deny | ✓ deny | ✓ deny |

### How to reproduce Run 2

```sh
bun install
bun scripts/regen-cedar.ts                                  # regenerate policies
bunx wrangler d1 execute DB --local --file=migrations/0001_init.sql   # seed local D1
bun run dev                                                  # wrangler dev on :8788
# in another shell:
curl "http://localhost:8788/check/d1?p=alice&a=EDIT_EVENT&rt=Event&r=evt_001"
curl "http://localhost:8788/check/cached?p=alice&a=EDIT_EVENT&rt=Event&r=evt_001"
```

## Gotcha that cost time

Default `@cedar-policy/cedar-wasm` import (bundler target) crashes Workers with `wasm2.__wbindgen_start is not a function`. Use the `/web` subpackage with explicit init and a `.wasm` module import — this is the Workers-friendly pattern.

```ts
import init, { isAuthorized, getCedarVersion } from "@cedar-policy/cedar-wasm/web";
// @ts-ignore — wrangler bundles .wasm as WebAssembly.Module
import wasmModule from "@cedar-policy/cedar-wasm/web/cedar_wasm_bg.wasm";

await init(wasmModule);
```

## Conclusion

Cedar runs on Cloudflare Workers, correctly evaluates the full 186-permission policy set generated from remy-sport's real CSVs, and fits comfortably under bundle limits. Both loading patterns work; cache-with-D1 is meaningfully faster on warm reads but adds invalidation complexity that the spike does not solve. The "Cedar on Workers is unverified" caveat from the ADR-002 reopening conversation is retired.

Open question is now narrower: **which loading pattern**, not whether Cedar works at all.

## What this spike does NOT prove

- Performance at full policy size (69 actions × 19 relations × 186 permissions). Spike used 2 policies.
- A working **entity-loading pattern for Workers** (entities are hardcoded). See section below — there is more than one option and the right pick is not yet decided.
- Cold-start time when WASM is loaded from R2/Workers cache for the first time in a fresh isolate (this spike is localhost; real cold start needs measuring on prod).
- Bundle size with the full generated policy set — should still fit but check after codegen.

## Open question: entity loading on Workers

Cedar is stateless — it evaluates against an `Entities` collection you hand it at check time. The collection has to come from somewhere. The canonical Cedar pattern (per [cedar-examples/tinytodo](https://github.com/cedar-policy/cedar-examples/blob/main/tinytodo/src/entitystore.rs)) is **"entities live in process memory; mutate them in-place when data changes; pass the store to every check."** That assumes a single long-lived process — which Workers isolates are not (they're ephemeral, non-shared, multi-region).

So tinytodo's pattern doesn't translate 1:1. The real options for remy-sport are:

| Pattern | State lives in | Cost per check | Notes |
|---|---|---|---|
| **D1 per-check slicing** | D1 only | 1 D1 batch (~3–8 ms) | Simplest. Always consistent. Workers' natural shape. |
| **Isolate-scope cache + D1 backing** | Module vars + D1 | 0 ms warm, D1 batch on cold/expired | Closest Workers equivalent of tinytodo's in-memory store. Needs invalidation strategy. |
| **Durable Object as EntityStore** | DO storage | ~5–30 ms DO call | Single source of truth across isolates; adds a hop. |
| **KV as EntityStore** | KV | ~10 ms read, eventual consistency | Cheap reads, weak consistency, slow writes. |
| **Workers Cache API + D1** | per-colo edge cache + D1 | 0 ms hit, D1 batch on miss | Per-colo, not global. Good for read-heavy hot resources. |

**This spike does not pick a winner.** Doing so requires a follow-up spike with at least two patterns side-by-side on realistic data (the 186-permission generated policy set + a representative slice of seed data).

## TODO — follow-up spikes / reviews

- **[cedar-policy/authorization-for-expressjs](https://github.com/cedar-policy/authorization-for-expressjs)** — official AWS/Cedar TS authorization middleware. Read before finalising the Hono middleware shape; their middleware exposes the canonical "build request from req → load entities → check → 403 or next" pipeline. Adapt the *shape*, don't depend on the package — it assumes Express.
- **Better Auth → Cedar integration spike** — separate spike. Wire `auth.api.getSession({ headers })` into a Hono middleware so the Cedar `principal` is derived from the Better Auth session, not a query param. Cedar `context` would carry session metadata (MFA state, session age, etc.). Touches the real remy-sport auth setup, not just Cedar — keep it as its own spike when the cache pattern lands.

## Earlier guidance to ignore

An earlier write-up in conversation framed "D1 batch per check" as **the** pattern. That was based on Cedar being stateless without checking what cedar-examples actually does. The canonical pattern is in-memory entity store; the Workers translation is open. Treat the table above as the menu, not D1-per-check as the answer.
