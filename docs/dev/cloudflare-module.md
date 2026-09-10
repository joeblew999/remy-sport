# The Cloudflare boundary: how automation maps to environments

Referenced from `scripts/lib/cloudflare.ts`, `scripts/db.ts` and
`scripts/ops/analytics.ts`. This is the rule those files implement.

## Three environments, sharing nothing

| | dev (local) | staging | production |
|---|---|---|---|
| worker | `wrangler dev` | `remy-sport-staging` | `remy-sport` |
| D1 | `.wrangler/state` | `remy-sport-staging-db` | `remy-sport-db` |
| dataset | in-memory ring | `remy_sport_events_staging` | `remy_sport_events` |
| queue | — | `remy-notifications-staging` | `remy-notifications` |
| R2 | — | `remy-sport-staging-storage` | `remy-sport-storage` |
| origin | `127.0.0.1:8787` | `staging-remy.ubuntusoftware.net` | `remy.ubuntusoftware.net` |

Nothing in that table is written in code. Every one of those names is resolved
from `wrangler.toml` through `resolvedConfig()`, which applies wrangler's
inheritance — so it is the binding the Worker actually gets, not the block that
happens to appear under an environment's heading.

`tests/repo/envs.test.ts` enforces both halves: rule 1 that no two environments
share any of these, rule 4 that **no string literal in `src/` or `scripts/`
names one**. The second exists because a name in code acts on one deployment
whatever `--env` was passed, and reports the others as empty rather than as an
error.

Production is wrangler's *unnamed top-level* environment. `resolvedConfig()`
takes `undefined` for it, and `Target.flag` is `undefined` for it. That asymmetry
is the source of most of what follows.

## A remote write requires `--env`. A read does not.

Declared per operation by the caller, never inferred by the module.

| refuses without `--env` | defaults to production |
|---|---|
| `deploy` | `ops smoke` |
| `test:e2e` | `ops analytics` |
| `db migrate-remote`, `db seed-remote` (= `ops seed`) | `ops demo` (status) |
| `ops demo on`/`off` | `ops versions` (reports both) |
| `ops provision` | `db` local operations |

The asymmetry is the point. An unnamed **read** costs a wrong answer somebody
can see. An unnamed **write** costs a migration applied to the live database by
somebody who thought they were on staging — which is what `CF_D1_NAME`, a literal
pinned to production's database, once did to `migrations:apply:remote --env
staging`.

Deriving the rule mechanically from "does this write" gets the provisioning plan
backwards, and a global rule in either direction breaks something: universally
required breaks local migrations, which have never passed `--env`; universally
optional lets a remote write go unnamed, which does not error — it resolves to
production.

## `--env` has one reader

`namedEnvironment()`, built on `node:util.parseArgs`. Both `--env staging` and
`--env=staging` are typed, and a reader that knows only one does not fail on the
other — it reports "nothing named" and falls through to the default. Rule 5 in
`envs.test.ts` keeps the parse in one place.

`normalisedEnvironmentArgs()` rewrites the joined form for a caller whose own
checks are positional; `withoutEnvironment()` strips the flag for a caller that
forwards the rest to another tool.

## Nothing ambient may retarget an operation

`CLOUDFLARE_ENV` is wrangler's variable equivalent of `--env`. Because production
passes no flag, an exported `CLOUDFLARE_ENV` used to decide what a "production"
operation touched:

```
wrangler secret list                          → production's 7 secrets
CLOUDFLARE_ENV=staging wrangler secret list   → staging's 8
```

Same command, different Worker, no warning. A dry-run deploy likewise resolved
D1, R2, the queue, the dataset, `BETTER_AUTH_URL` and the `ENVIRONMENT` var
itself to staging.

So `credentialEnv()` drops it from every wrangler child, and `wrangler()` names
the environment explicitly for a resolved target — production as `--env ""`,
which is wrangler's own way of selecting the top-level and what its warning has
been asking for. `tests/unit/cloudflare-target.test.ts` asserts the absence,
which no call site can show.

The exception is `publish()` in `scripts/deploy.ts`, which passes **no** target
because it deploys a fully resolved generated config. Naming an environment there
is not idempotent: a config with no `env` section plus a named environment makes
wrangler fall back to legacy behaviour and publish `remy-sport-staging-staging`,
which it did once, taking the custom domain with it.

`CF_DEPLOY_URL` is an override for pointing smoke at localhost or the dev tunnel.
It only wins when no environment was named — `smoke.ts` and `demo-status.ts` both
check that, because it once won unconditionally and smoked production while
reporting success about staging.

## What the environment decides inside the Worker

`ENVIRONMENT` is a plain var in `wrangler.toml` and selects a row of `POLICY` in
`src/environment.ts` — whether the seed route exists, whether mail is captured or
really sent, whether the sign-in code is derived or secret, the telemetry sample
rate. Rule 2 in `envs.test.ts` asserts each environment declares its own name,
because a copy-pasted `[env.staging]` block still saying `"production"` is the
whole failure in one word, and the worse direction is production labelled staging:
that **opens** the seed route and the demo account picker on the real site.

## The shape of every bug this file guards against

None of them raise an error. Each is a plausible answer about somewhere else:

- a resource name in code — acts on one deployment whatever was asked
- a flag spelling a reader does not know — falls through to production
- an ambient variable — decides what an unflagged call touches
- a local dev server preferred over an explicit `--env` — answers about localhost

Type checking cannot see any of it. `"remy_sport_events"` and
`"remy_sport_events_staging"` are both `string`; `process.env` is `ProcessEnv`
either way. Types constrain the shape of a value, not which of several
equally-shaped values is the right one. That is why these are structural rules
over the AST and assertions about absence, rather than types.
