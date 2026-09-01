# Remy Sport

## Five commands

```
mise run dev        run it here          → scripts/dev.ts
mise run check      prove it             → scripts/check.ts
mise run db         the database         → scripts/db.ts
mise run deploy     ship it              → scripts/deploy.ts
mise run ops        operate a deployment → scripts/ops.ts
```

Run any of them with no arguments and it either does the obvious thing or tells
you what it takes. That is where the subcommand lists live — not here, because a
copy in this file is a copy that goes stale.

```
mise run dev                     server, seeded, one port
mise run check                   the gate            (--fast, --e2e)
mise run deploy -- --env staging
```

Arguments go after `--`. A remote write always names its environment or refuses.

## Environments

| | URL | Worker | Database |
| --- | --- | --- | --- |
| Production | https://remy.ubuntusoftware.net | `remy-sport` | `remy-sport-db` |
| Staging | https://staging-remy.ubuntusoftware.net | `remy-sport-staging` | `remy-sport-staging-db` |
| Dev | http://localhost:8787 · https://dev-remy.ubuntusoftware.net | `mise run dev` | `.wrangler/state` |

The two dev URLs are one server. The tunnel exists because iOS Safari with
HTTPS-Only refuses a plain `http://192.168.x.x`, so a phone needs the HTTPS name.

## Where things are decided

Two files describe an environment, and nothing else does:

- **`wrangler.toml`** — what it *deploys with*: name, account, routes, bindings, vars.
- **`src/environment.ts`** — what it is *allowed to do*: the policy table, and the
  dev origin, because dev is not a deployment.

`scripts/cloudflare.ts` is the only reader of either and the only path to the
Cloudflare API. It resolves the credential, forces the pinned account into every
call, and tells "could not ask" apart from "absent".

## What runs when

Each command declares its own order, with every step saying why it sits where it
does. Read it rather than guess:

```
bun scripts/prepare.ts --order   what every command does first
scripts/check.ts    PHASES
scripts/deploy.ts   PIPELINE
scripts/dev.ts      start()
```

## Layout, and reading the order off it

`scripts/` holds the five commands plus `cloudflare.ts` and `prepare.ts`. Every
other script sits under the command that runs it.

Where a folder is a **sequence**, its files are numbered by their position in it,
so `ls` tells you the order without opening anything:

```
scripts/deploy/   2-auth-schema  4-versions  5-provision  9-smoke
scripts/build/    2-fonts  8-seed
scripts/dev/      5-dev-vars  watch
```

The gaps are real: they are steps that are not files. `deploy` step 1 is the
gate, 3 is the e2e tier, 6 is the publish, 7 the wait, 8 the remote seed — the
numbered files are the four that are their own script. Open `scripts/deploy.ts`
and `PIPELINE` is the first thing in it, all nine with the reason each sits
where it does.

`scripts/checks/` is deliberately unnumbered: those run in parallel, so there is
no order to state. `scripts/ops/` likewise — it is a menu, not a pipeline.

`AGENTS.md` holds the things that have already cost a bug.
