# ADR 006: Environment Provisioning and Recovery

**Status:** Implemented (2026-08-20)

## Context

[ADR 001](001-deployment-versioning.md) documents how we *version and roll back* a deployed worker. It names the resources the project depends on — worker `remy-sport`, D1 `remy-sport-db`, R2 `remy-sport-storage`, `BETTER_AUTH_SECRET` via `wrangler secret`, `.dev.vars` for local — but it assumes they already exist. Nothing in the repo creates them.

On 2026-08-20 that gap became concrete. An audit of the Cloudflare account found:

| Resource | ADR 001 says | Reality |
|---|---|---|
| Worker `remy-sport` | deployed at `remy-sport.gedw99.workers.dev` | **does not exist** (API code 10007) |
| D1 `remy-sport-db` | bound as `DB` | **does not exist** |
| R2 `remy-sport-storage` | bound as `STORAGE` | **does not exist** |
| `.dev.vars` | "local dev uses `.dev.vars`" | **not present** |

[wrangler.toml](../../../wrangler.toml) still pins `database_id = "3bf4aa25-3250-491e-83e7-ba8dbf5562f5"`, which matches nothing in the account. Every URL on the deployed origin returns HTTP 404, and `mise run test:deployed` fails 20 tests with `SyntaxError: Unexpected token '<'` because Cloudflare's HTML 404 page arrives where JSON is expected.

Local development is unaffected — `mise run test` passes 59/59 against local D1.

Three separate problems surfaced alongside it:

1. **Recovery is a manual checklist.** `mise run cf:d1:create` prints a new `database_id` that a human must copy into `wrangler.toml` by hand. This violates [AGENTS.md](../../../AGENTS.md) — "Mise tasks must be idempotent where possible" and "must work without requiring user args".
2. **No task sets `BETTER_AUTH_SECRET`.** It is required by [src/types.ts](../../../src/types.ts), referenced by [src/auth.ts](../../../src/auth.ts), and has no task, locally or remotely.
3. **`cf:*` tasks failed confusingly on a clean checkout.** None declared `depends = ["install"]`, so `bun x wrangler` fell through to a mise shim and produced `No version is set for shim: wrangler` — an error that points at mise rather than the missing `node_modules`.

We need provisioning to be a repeatable task, not tribal knowledge, so that a wiped environment — or a new developer, or a second Cloudflare account — can be brought up with one command.

## Decision

### 1. Ensure-style tasks, not create-style

Provisioning tasks are named `*:ensure` and are **idempotent**: they check whether the resource exists and create it only if absent. Re-running is always safe. `cf:d1:create` and `cf:r2:create` remain as thin, explicit escape hatches but are no longer part of any pipeline.

### 2. `database_id` is written back automatically

`cf:d1:ensure` resolves the database's UUID from `wrangler d1 list --json` (creating it first if needed) and writes it into `wrangler.toml`. A human never copies a UUID. If the id in `wrangler.toml` already matches the account, the task is a no-op and says so.

`--json` is verified supported on wrangler 4.124.0 and returns objects keyed `uuid` / `name`, so D1 resolution parses structured output rather than scraping a table.

**R2 is not checked by listing at all.** `wrangler r2 bucket list` has no `--json` flag (verified: `Unknown argument: json`), and — discovered during implementation — it **silently paginates at 20 buckets** with no flag to page further. This account holds 26, and `remy-sport-storage` fell off page 1, so the first implementation reported it absent when it existed and tried to create a duplicate.

That is a worse failure than this ADR originally anticipated. The plan was to "fail loudly on unparseable output", but truncated output *parses perfectly* — there is nothing to detect. So `cf:r2:ensure` instead **attempts the create and treats `already exists, and you own it` [code: 10004] as success**, which is idempotent regardless of how the listing is formatted or truncated.

`cf:d1:ensure` keeps the listing approach, because it needs the uuid and only the list supplies it — but it now reports the truncation explicitly if a create is rejected as already-existing. D1 returns all 13 databases and matches the API exactly, so the limit is not currently in play there.

This is the specific manual step that let the environment drift, so it is the one most worth automating.

### 3. Secrets have tasks, and local/remote are distinct

| Concern | Where it lives | Task |
|---|---|---|
| Remote secret | `wrangler secret put` | `cf:secret:set` |
| Local secret | `.dev.vars` (gitignored) | `dev:vars` |

Both generate a cryptographically random value when none is supplied, and both are idempotent — `dev:vars` will not overwrite an existing `.dev.vars`. Secret **values** are never written to `wrangler.toml`, `versions.json`, or any tracked file.

### 4. One command rebuilds the environment

`cf:env:bootstrap` chains the ensure tasks in dependency order:

```
cf:env:bootstrap
  ├── cf:d1:ensure      (create if absent, patch wrangler.toml)
  ├── cf:r2:ensure      (create if absent)
  └── cf:secret:set     (set BETTER_AUTH_SECRET if unset)
```

It provisions only. It does **not** deploy — `mise run deploy` remains the deployment entry point. Bootstrap then deploy is the documented recovery path.

**Ordering correction found during implementation:** `cf:secret:set` cannot run before the first deploy. `wrangler secret list` errors with `Worker "remy-sport" not found` on a never-deployed script, and `wrangler secret put` has no non-interactive way to create one. So `cf:secret:set` **skips with a clear message** when the worker does not yet exist, and `deploy` calls it again immediately after `cf:deploy`. Because it is idempotent, being invoked from both places costs nothing and the bootstrap-then-deploy path still converges.

`cf:env:bootstrap` is itself a sequential `run` block for the same reason as §8 — its three steps are not independent.

### 5. Every `cf:*` and `web:*` task depends on `install`

So the local pinned wrangler is always present and the mise shim can never shadow it. This makes the failure mode impossible rather than merely documented.

### 6. Auth tasks

`cf:login` and `cf:logout` wrap `wrangler login` / `wrangler logout`. Previously only `cf:whoami` existed, so re-authenticating meant dropping out of mise and running wrangler directly — against the "always use `mise run`" convention.

### 7. Playwright install is OS-aware

`playwright:install` downloads `linux64` builds via curl and probes `~/.cache/ms-playwright`. On macOS, Playwright reads `~/Library/Caches/ms-playwright`, so the skip check never matched and the Linux binaries it fetched could not run. The task now branches: macOS delegates to `playwright install chromium` (idempotent, correct arch); Linux keeps the existing proxy-safe curl path unchanged.

### 8. The `deploy` pipeline must be explicitly ordered

`mise run deploy` currently declares:

```toml
depends = ["setup", "check", "test", "versions", "cf:deploy",
           "cf:d1:migrations:apply:remote", "seed:remote", "test:deployed"]
```

This reads as a sequence but does not behave as one. **mise runs independent sibling dependencies in parallel** (default `jobs = 8`); it honours the dependency *graph*, not list order. Verified empirically — `mise run setup` starts `playwright:install` and `cf:d1:migrations:apply` concurrently.

None of the eight declare each other. `seed:remote`, `test:deployed` and `versions` declare no dependencies at all. So `test:deployed` can run before `cf:deploy` completes, and `seed:remote` before remote migrations have applied. The pipeline only *looks* ordered.

This is invisible today because the deployed environment is gone and the pipeline cannot complete anyway — but it would corrupt the first rebuild, which is exactly what this ADR exists to make reliable.

**Decision:** `deploy` becomes an explicit sequential `run` block that invokes each step in order, rather than relying on `depends` for sequencing:

```toml
[tasks.deploy]
description = "Full deploy pipeline"
depends     = ["setup"]
run = """
set -e
mise run check
mise run test
mise run versions
mise run cf:env:bootstrap
mise run cf:deploy
mise run cf:secret:set
mise run cf:d1:migrations:apply:remote
mise run seed:remote
mise run test:deployed
"""
```

Each step still runs via `mise run`, per the AGENTS.md convention, and each remains independently runnable.

Two steps were added to the sequence beyond the original draft: `cf:env:bootstrap` up front, so a wiped environment self-heals without a separate command, and `cf:secret:set` after `cf:deploy`, per the ordering correction in §4.

**`set -e` is verified.** The ADR flagged nested-`mise`-under-`set -e` as needing confirmation. Tested with a deliberately failing task: the pipeline aborts at the failing step, the following step does not run, and the child's exit code (3) propagates to the parent. A deploy cannot continue past a failed `check`.

**Alternative considered and rejected:** chaining the tasks through `depends` (`seed:remote` depends on `cf:d1:migrations:apply:remote`, which depends on `cf:deploy`). That encodes order in the graph correctly, but couples the tasks — `mise run seed:remote` would then trigger a full deploy as a side effect. Ordering is a property of *this pipeline*, not of the individual tasks.

`depends = ["setup"]` is retained because setup is genuinely a precondition and is safe to run concurrently with nothing else.

### 9a. Binding the custom domain (the original failure)

The worker had **no route at all**. `wrangler.toml` carried a comment saying "Custom domain … Wrangler creates the DNS record on deploy", but the `[[routes]]` entry that does that was missing — the comment sat orphaned above the `[assets]` block. `remy.ubuntusoftware.net` therefore had no DNS record, while `BETTER_AUTH_URL` and `CF_DEPLOY_URL` both pointed at it.

```toml
[[routes]]
pattern       = "remy.ubuntusoftware.net"
custom_domain = true
```

Two consequences followed that are worth recording, because neither is obvious.

**`wrangler dev` simulates the route locally.** Once the `[[routes]]` block exists, `wrangler dev` rewrites `c.req.url`, `Host`, `Origin` and `Referer` to the custom domain — but keeps the **http** scheme. A request to `http://localhost:8787` reaches the Worker as `http://remy.ubuntusoftware.net`. Verified directly:

```
$ curl http://localhost:8787/api/__debug -H 'Origin: http://localhost:8787'
{"url":"http://remy.ubuntusoftware.net/api/__debug",
 "origin":"http://remy.ubuntusoftware.net",
 "host":"remy.ubuntusoftware.net"}
```

That broke authentication locally. [src/auth.ts](../../../src/auth.ts) hardcoded `trustedOrigins: ["http://localhost:8787"]` alongside an `https://` baseURL, so the synthesized `http://remy.ubuntusoftware.net` matched neither and Better Auth 403'd every sign-in with `INVALID_ORIGIN`.

The check is gated on `headers.has("cookie")` (see `validateOrigin` in better-auth 1.4.18), which is why it looked like a heisenbug: `curl` without cookies sailed through, and only cookie-bearing browser sign-ins failed. It presented as "the first browser sign-in in a run fails" and was initially mistaken for a race.

**Decision:** derive the trusted origin from the request rather than hardcoding a list — `new URL(c.req.url).origin`. The Worker serves the GUI from its own `[assets]` binding, so a same-origin request is first-party by definition, which is exactly what the check protects. This works unchanged on localhost, on the simulated custom domain, on workers.dev, and in production.

**A first deploy is not immediately reachable.** Wrangler creates the DNS record and requests an edge certificate, but propagation and issuance take minutes; the first `mise run deploy` died at `test:deployed` with `getaddrinfo ENOTFOUND`. Hence `cf:wait` in §9, which gates everything downstream of `cf:deploy`. Note that a machine that queried the name while it did not exist may hold a **negative DNS cache** entry well after the record goes live.

**`cf:wait` must check the *version*, not reachability.** Its first implementation polled `/api/health`, which is not sufficient: `wrangler deploy` returns before the new version has propagated, and the **old** worker answers `/api/health` perfectly well. The ADR 007 deploy passed `cf:wait` instantly and then ran `test:deployed` against stale code — every organization test 404'd on routes the new build had just added, and survived retries because it was not flaky at all.

`cf:wait` now polls `/api/versions` and compares the `_generated` stamp against the local `versions.json` written by `mise run versions` earlier in the same pipeline. `_generated` rather than the git commit, because the commit only changes when you commit — deploying uncommitted work would otherwise match against stale code.

### 9b. `seed:remote` masked its own failure

`curl -sf … | jq .` reports **jq's** exit status, not curl's. A failed seed exited 0 — jq simply received empty input — so the pipeline's `set -e` never fired. Confirmed:

```
$ (curl -sf -o /dev/null https://nonexistent.invalid/x | jq .) ; echo $?
0
```

Both `seed` and `seed:remote` now `set -o pipefail`. This is worth calling out because it silently defeats the very `set -e` sequencing §8 introduces.

### 9c. R2 bucket existed but the listing hid it

Covered in §2 — `wrangler r2 bucket list` paginates at 20 with no way to page further, and this account has 26 buckets.

### 9d. The test suite depended on leftover state

§10 claims a green `test:deployed` proves the environment is restored. That only holds if the suite is self-sufficient, and it was not — two ordering bugs were masked by a database that already had data.

**Seeding was an ordinary test.** `fullyParallel: true` orders tests only *within* a `describe.serial` block, so the "Layer 1" and "Dashboard GUI" blocks were dispatched to other workers concurrently with the seed block and authenticated against users that did not exist yet. Seeding is now a Playwright **setup project** (`tests/seed.setup.ts`), which runs to completion before its dependents. Unlike `globalSetup`, a setup project runs *after* the webServer is up, so it can reach the API.

**The public-read tests assumed an event existed.** `event:read is public` asserts `events.length > 0` but nothing guaranteed an event-creating test had run first. This passed locally purely because the local D1 retained events from earlier runs; against freshly provisioned remote D1 both tests failed. The setup project now ensures at least one event exists, idempotently.

Both were pre-existing latent bugs that only a genuinely empty database could expose — which is precisely the scenario this ADR exists to make routine.

### 9e. The Drizzle schema is generated, not hand-written

Rebuilding the environment exposed a third latent bug of the same family as §9a–§9b: `src/db/schema.ts` was hand-maintained alongside Better Auth's own table definitions, and had drifted.

The admin plugin adds `session.impersonated_by`. The hand-written schema never declared it, so no migration ever created it — and nothing failed, because the schema and the database were wrong in *identical* ways. Better Auth only writes columns the Drizzle schema declares. The moment the schema became correct, every sign-in 500'd with `table session has no column named impersonated_by`.

**Decision:** Better Auth owns its own tables.

| File | Owner |
|---|---|
| `src/db/auth-schema.ts` | generated by `@better-auth/cli` |
| `src/db/app-schema.ts` | hand-written app tables (`event`) |
| `src/db/schema.ts` | re-exports both |
| `src/auth.config.ts` | schema-shaping options, shared by runtime and CLI |

`createAuth(c)` takes a Hono Context and cannot be imported by the CLI, so `src/auth.cli.ts` exports a module-level instance built from the same `authOptions` with a database-less adapter — generation reads options only and never opens a connection.

`auth:schema:check` regenerates into a temp dir and diffs, failing if the committed file is stale. It runs in the `deploy` pipeline, so drift cannot reach production again.

Migration `0003` aligns the database: adds `impersonated_by`, renames two indexes to the generated names, adds the missing `verification_identifier_idx`, and clears the auth tables because the generated schema uses `timestamp_ms` where the hand-written one used `timestamp` (seconds) — existing rows would decode as 1970. Clearing is acceptable only because the site has no real users yet; the migration says so explicitly.

**Upgrading Better Auth is currently blocked at the 1.4 line.** `@better-auth/cli` publishes no 1.7.x, and it bundles its own `@better-auth/core` — installing it beside `better-auth@1.7.1` hoists core 1.4.22 against a 1.7.1 runtime. Since generating the schema is the point, we stay on 1.4 until the CLI catches up. `better-auth` is pinned `~1.4.18` so a range-widening cannot cross that boundary by accident.

### 9. Mise tasks

| Task | Description | Idempotent |
|---|---|---|
| `cf:env:bootstrap` | Provision all Cloudflare resources for this project | yes |
| `cf:d1:ensure` | Create D1 if absent; write `database_id` into `wrangler.toml` | yes |
| `cf:r2:ensure` | Create R2 bucket if absent | yes |
| `cf:secret:set` | Set `BETTER_AUTH_SECRET` remotely; generate if not supplied | yes |
| `dev:vars` | Write `.dev.vars` with a generated secret if absent | yes |
| `cf:login` | Authenticate wrangler with Cloudflare | n/a |
| `cf:logout` | Clear stored Cloudflare credentials | n/a |
| `cf:wait` | Poll `/api/health` until the deployed origin serves traffic (§9a) | yes |
| `auth:schema:generate` | Regenerate `src/db/auth-schema.ts` from `auth.config.ts` (§9e) | yes |
| `auth:schema:check` | Fail if the generated schema is stale; runs in `deploy` (§9e) | yes |
| `deps:outdated` / `deps:update` | Report / apply npm updates within existing semver ranges | yes |
| `cf:d1:list:json` | Machine-readable D1 listing, consumed by `cf:d1:ensure` | yes |
| `test:grep` | Run only tests matching `GREP` (defaults to everything) | yes |
| `deploy` | **Modified** — sequential `run` block instead of parallel `depends` (§8) | no |

Provisioning scripts drive Cloudflare through **mise tasks**, never raw `bun x wrangler`, per the AGENTS.md convention that agents and humans use the same tooling. `scripts/cf-ensure.ts` shells out to `mise run -q <task>`; `-q` is required because a plain `mise run` prints resolved `depends` output (`bun install`) on stdout and corrupts JSON capture.

Env var inputs, with defaults, so no task requires positional args:

| Variable | Default | Used by |
|---|---|---|
| `CF_D1_NAME` | `remy-sport-db` (existing `[env]`) | `cf:d1:ensure` |
| `CF_R2_NAME` | `remy-sport-storage` (existing `[env]`) | `cf:r2:ensure` |
| `BETTER_AUTH_SECRET` | generated if unset | `cf:secret:set`, `dev:vars` |

### 10. Recovery procedure

Documented in [AGENTS.md](../../../AGENTS.md) so it is discoverable without reading ADRs:

```bash
mise run cf:login           # if not authenticated
mise run cf:env:bootstrap   # provision D1, R2, secret
mise run deploy             # check → test → deploy → migrate → seed → test:deployed
```

`mise run deploy` ends in `test:deployed`, so a green run is proof the environment is genuinely restored — the same 59 tests, against the live worker.

## Implementation

### Files created/modified

| File | Change |
|---|---|
| `scripts/cf-ensure.ts` | NEW — resolve/create D1 + R2, patch `database_id` into `wrangler.toml` |
| `scripts/dev-vars.ts` | NEW — generate `.dev.vars` with a random `BETTER_AUTH_SECRET` |
| `mise.toml` | `cf:env:bootstrap`, `cf:d1:ensure`, `cf:r2:ensure`, `cf:secret:set`, `dev:vars`, `cf:login`, `cf:logout`; `depends = ["install"]` on all `cf:*` / `web:*`; OS branch in `playwright:install`; `deploy` rewritten as a sequential `run` block (§8) |
| `wrangler.toml` | `database_id` rewritten by `cf:d1:ensure` (not by hand) |
| `AGENTS.md` | Recovery procedure; correct the Playwright install note; reference this ADR |
| `docs/dev/adr/001-deployment-versioning.md` | Cross-reference this ADR for provisioning |

### Already applied on 2026-08-20 (pending this ADR's approval)

These landed while diagnosing the shim failure and are folded into this ADR rather than left unrecorded:

- `depends = ["install"]` added to 24 `cf:*` / `web:*` tasks
- `cf:login` and `cf:logout` added
- `playwright:install` macOS branch
- `wrangler` bumped `4.78.0` → `4.124.0`; `worker-configuration.d.ts` regenerated

If this ADR is rejected, these should be reverted.

## Consequences

**Good**

- A wiped environment is recoverable with two commands, verified by the existing test suite
- The `database_id` drift that caused this cannot recur silently
- `cf:*` tasks work on a clean checkout; the mise shim can no longer shadow the pinned wrangler
- `deploy` runs its steps in the intended order instead of racing — migrations before seeding, deploy before verification
- `mise run test` works on macOS as well as Linux
- Secrets have a defined home for both local and remote, with no value in a tracked file

**Costs and risks**

- **R2 existence checks are fragile.** `wrangler r2 bucket list` emits only human-readable text — there is no `--json`. `cf:r2:ensure` therefore matches on formatted output, which a wrangler upgrade can silently break. D1 is safe by comparison (`--json` is supported). Mitigation: fail loudly on unparseable output rather than assuming "absent" and creating a duplicate.
- **Nested `mise run` inside `deploy` must be verified during implementation.** Invoking mise from within a mise task is standard, but the exact behaviour under `set -e` (does a failing step abort the pipeline?) must be confirmed — a deploy that continues past a failed `check` would be worse than the current race.
- **`cf:secret:set` must pipe the value via stdin.** `wrangler secret put` prompts interactively when attached to a TTY and exposes no value flag; the task has to feed stdin so it works unattended. It must never echo the secret to the log.
- `cf:d1:ensure` **writes to `wrangler.toml`**, so a tracked file changes as a side effect of a task. The diff must be reviewed and committed deliberately.
- Bootstrap assumes one Cloudflare account and one environment. `wrangler.toml` already declares `staging` and `production` envs for deploys; per-environment provisioning is **not** covered here and needs its own decision if those environments become real.
- Creating a fresh D1 means the remote database starts empty. `deploy` runs migrations and `seed:remote`, so it self-heals — but any pre-existing production data is not recoverable by this process. This ADR is about provisioning, not backup.

**Explicitly out of scope**

- Why the original resources disappeared. Unknown at time of writing, and worth establishing before rebuilding, since a deliberate teardown implies a different decision than an accidental one.
- Backup and restore of D1 data.
