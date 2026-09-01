# Remy Sport

## Five commands

Every one is `mise run <name>`, and every one is a single script in `scripts/`.
Arguments after `--`.

```
dev        run it here          scripts/dev.ts
check      prove it             scripts/check.ts
db         the database         scripts/db.ts
deploy     ship it              scripts/deploy.ts
ops        operate a deployment scripts/ops.ts
```

### The day

```
mise run dev                    start the server, seeded, on one port
mise run dev -- stop            stop it and everything it started
mise run dev -- restart         both, in order
mise run dev -- ensure          start only if it is not already up
mise run dev -- watch           re-run the fast gate on every save

mise run check -- --fast        typecheck and unit tests, about six seconds
mise run check                  the full gate, about forty
mise run check -- --e2e         the end-to-end tier, needs a dev server
```

### Shipping

```
mise run deploy -- --env staging
mise run deploy -- --env production
```

The gate, then provision, then publish, then verify — in that order, for reasons
each step states in `scripts/deploy.ts`. A remote write always names its
environment or refuses.

### The database

```
mise run db -- migrate-local            apply migrations to .wrangler/state
mise run db -- migrate-remote --env X   apply them to a deployment
mise run db -- seed-remote --env X      load the fixtures into a deployment
mise run db -- tables-local             what tables exist
mise run db -- tables-remote --env X
mise run db -- reset-local              drop local D1 and replay every migration
mise run db -- generate                 emit a migration for a schema change
mise run db -- studio                   browse the local database
```

### Operating a deployment

```
mise run ops                            list these
mise run ops demo status                is seeded sign-in on, and for whom
mise run ops demo on --env X            publish the fixed code
mise run ops demo off --env X           take it away
mise run ops analytics 24               what the worker has been doing
mise run ops audit                      the account's delete actions
mise run ops versions                   stamp versions.json
mise run ops seed --env X               seed a remote database
mise run ops tunnel                     create the dev tunnel and its hostname
mise run ops coverage gui|data|model    how much of each surface is exercised
mise run ops tiers                      how many tests sit in each tier
mise run ops time /api/health           how long an endpoint takes, measured
mise run ops keys                       a VAPID keypair for Web Push
mise run ops deps outdated|update       npm packages against their releases
mise run ops icons                      every app icon, from brand.svg
mise run ops tauri dev|build|info       desktop and mobile targets
mise run ops biz                        fast-forward the PO's checkout
mise run ops domain --check             the model, against the PO's copy
```

## Environments

| Environment | URL | Worker | Database |
| --- | --- | --- | --- |
| Production | https://remy.ubuntusoftware.net | `remy-sport` | `remy-sport-db` |
| Staging | https://staging-remy.ubuntusoftware.net | `remy-sport-staging` | `remy-sport-staging-db` |
| Dev (tunnel) | https://dev-remy.ubuntusoftware.net | local, via `mise run dev` | `.wrangler/state` |
| Dev (local) | http://localhost:8787 | local, via `mise run dev` | `.wrangler/state` |

The two dev rows are one server. The tunnel exists because iOS Safari with
HTTPS-Only refuses a plain `http://192.168.x.x`, so a phone needs the HTTPS name.

## Where things are decided

Two files, and nothing else describes an environment:

- **`wrangler.toml`** — what each environment *deploys with*: name, account,
  routes, bindings, vars.
- **`src/environment.ts`** — what each environment is *allowed to do*: the policy
  table, and the dev origin, because dev is not a deployment and wrangler has no
  block for it.

`scripts/cloudflare.ts` is the only thing that reads either, and the only path to
the Cloudflare API — it resolves the credential, forces the pinned account into
every call, and tells "could not ask" apart from "absent".

## Layout

```
scripts/          the five commands, plus cloudflare.ts and prepare.ts
scripts/checks/   the gate's steps
scripts/deploy/   provision, smoke, versions, auth schema
scripts/dev/      .dev.vars, the save-triggered gate
scripts/build/    what prepare generates: fonts, the seed
scripts/ops/      the operations ops dispatches to
```

`AGENTS.md` holds the things that have already cost a bug.
