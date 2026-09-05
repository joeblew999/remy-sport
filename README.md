# Remy Sport

Basketball events, teams and live scoring for Thailand. A Cloudflare Worker
(Hono, oRPC, Drizzle on D1, Better Auth) serving a React SPA, built from the
Product Owner's model in `remy-sport-biz`.

## The commands

Everything is a `package.json` script. `mise` only pins the tools
(`mise install` once) and sets the environment.

```
bun run setup                     once after cloning: install, types, local database, browsers
bun run dev                       Vite: the Worker in workerd and the SPA with HMR on localhost:8787, seeded
bun run check                     the gate: typecheck, lint, model consistency, every test, the render tier
bun run test:e2e                  a real browser against a real Worker (-- --env staging|production for a deployment)
bun run deploy -- --env staging   ships it; runs check and test:e2e first. Then production.
bun run model                     when the Product Owner changes the model: pull it in, migrate, seed, verify
```

Smaller pieces, when you want one thing:

```
bun run typecheck                 tsc, one config for the Worker, the SPA, the tests and the scripts
bun run lint                      knip, dependency-cruiser, eslint (i18n), inlang
bun run test                      vitest: unit, repo (the rules this repo keeps), worker (in workerd)
bun run test:watch                the same, on every save
bun run test:render               the no-backend browser tier
bun run shots                     every screen as every seeded person, into screenshots/
bun run build                     dist/client (the SPA) and dist/remy_sport (the Worker, with the wrangler.json deploy uses)
bun run preview                   that build, running in workerd
bun run ops tunnel -- --run       a fixed HTTPS name for the dev server, so a phone can open it
bun run ops provision -- --env X  D1, R2, queues, migrations, secrets — once per environment, and after adding a secret
bun run ops versions              what each environment is actually running
bun run db                        the database — no arguments for status
bun run ops                       operate a deployment — no arguments to list what it can do
```

Arguments go after `--`. A command that writes to a deployment always names its
environment or refuses.

## Environments

| | URL | Worker | Database |
| --- | --- | --- | --- |
| Production | https://remy.ubuntusoftware.net | `remy-sport` | `remy-sport-db` |
| Staging | https://staging-remy.ubuntusoftware.net | `remy-sport-staging` | `remy-sport-staging-db` |
| Dev | http://localhost:8787 · https://dev-remy.ubuntusoftware.net | `bun run dev` | `.wrangler/state` |

The two dev URLs are one server. The tunnel exists because iOS Safari with
HTTPS-Only refuses a plain `http://192.168.x.x`, so a phone needs the HTTPS name.

## Where things are decided

Two files describe an environment, and nothing else does:

- **`wrangler.toml`** — what it *deploys with*: name, account, routes, bindings, vars.
- **`src/environment.ts`** — what it is *allowed to do*: the policy table, and the
  dev origin, because dev is not a deployment.

`scripts/lib/cloudflare.ts` is the only reader of either and the only path to the
Cloudflare API.

## Layout

```
src/
  domain/   the Product Owner's model (copied verbatim by `bun run model`) and the schemas derived from it
  db/       the drizzle tables, migrations, the seed
  api/      the oRPC procedures — every one declares how it is authorised
  web/      the React SPA
tests/
  unit/     pure logic                       vitest
  repo/     the rules this repo keeps        vitest — each file states a rule and lists what breaks it
  worker/   the Worker, inside workerd       vitest
  render/   a browser, no backend            playwright
  e2e/      a browser and a real Worker      playwright
scripts/
  deploy.ts  e2e.ts  model.ts  db.ts  ops.ts     the commands that are more than one line
  lib/  deploy/  ops/                             what they call
```

`AGENTS.md` is short on purpose. `docs/2026-09-05-01-modern-tooling.md` is the plan that
is making `scripts/` smaller.
