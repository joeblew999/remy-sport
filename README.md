# Remy Sport

## What a developer does

```
mise run dev        build something          → localhost:8787, seeded
mise run check      before you commit        → about 30s
mise run deploy -- --env production
```

That is the loop. Three commands.

`mise run db` and `mise run ops` exist for the occasional — a database question,
showing the app to someone, wanting a number when something looks wrong. Run
either with no arguments and it tells you what it can do. You will not need them
most days.

Arguments go after `--`. A command that writes to a deployment always names its
environment or refuses.

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

`scripts/lib/cloudflare.ts` is the only reader of either and the only path to the
Cloudflare API. It resolves the credential, forces the pinned account into every
call, and tells "could not ask" apart from "absent".

## What runs when

Each command declares its own order, with every step saying why it sits where it
does. Read it rather than guess:

```
bun scripts/lib/prepare.ts --order   what every command does first
scripts/check.ts    PHASES
scripts/deploy.ts   PIPELINE
scripts/dev.ts      start()
```

## Layout

```
scripts/
  check.ts  db.ts  deploy.ts  dev.ts  ops.ts     the five commands, and nothing else

  check/    assets  authz  bundle  conventions  docs  envs
            messages  notifications  seed-order  tables
  deploy/   auth-schema  provision  smoke  versions
  ops/      analytics  audit  biz  coverage-data  coverage-gui  coverage-model
            demo  demo-status  domain  keys  tiers  time  tunnel

  lib/      cloudflare  prepare  fonts  dev-vars  seed  watch
```

Three things, and no legend needed:

**The top level is exactly what you can run.** Five files, five commands.

**A folder holds the parts of the command it is named after**, each named for
what it does — every file under `ops/` is reachable as an `ops` subcommand,
every file under `check/` is a step of the gate.

**`lib/` is everything shared or called by more than one command.**
`cloudflare.ts` is the only path to the Cloudflare API.

Order is deliberately NOT in the filenames. When something runs is a fact about
execution, not about a file: encoding it in names needs a legend and goes stale
the moment a step moves. Ask the command instead — each prints the list it
actually runs, so it cannot drift from the truth:

```
mise run dev -- --order       7 steps
mise run check -- --order     3 phases, and what is parallel within each
mise run deploy -- --order    9 steps, each with the reason it sits there
bun scripts/lib/prepare.ts --order
```

`AGENTS.md` holds the things that have already cost a bug.
