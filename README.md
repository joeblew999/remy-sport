# Remy Sport

## Environments

| Environment | URL | Worker | Database |
| --- | --- | --- | --- |
| Production | https://remy.ubuntusoftware.net | `remy-sport` | `remy-sport-db` |
| Staging | https://staging-remy.ubuntusoftware.net | `remy-sport-staging` | `remy-sport-staging-db` |
| Dev (tunnel) | https://dev-remy.ubuntusoftware.net | local, via `mise run dev` | `.wrangler/state` |
| Dev (local) | http://localhost:8787 | local, via `mise run dev` | `.wrangler/state` |

The two dev rows are one server. The tunnel exists because iOS Safari with
HTTPS-Only refuses a plain `http://192.168.x.x`, so a phone needs the HTTPS name.

## Everything else

`mise tasks` lists what you can run. `AGENTS.md` holds the things that have
already cost a bug.
