# Remy Sport

Basketball events, teams and live scoring for Thailand. Cloudflare Workers + D1,
oRPC, React 19, shipped to web, desktop and iOS from one bundle.

Deployed at **https://remy.ubuntusoftware.net**

## Run it

```bash
mise trust && mise install && mise run setup
mise run dev
```

One command. It seeds the database, rebuilds on every save, and serves the same
built bundle at three addresses:

| | |
|---|---|
| `http://localhost:8787` | this machine — a few ms, and what the tests run against |
| `http://<lan-ip>:8787` | same wifi, for a phone. Printed on startup |
| `https://dev-remy.ubuntusoftware.net` | fixed HTTPS, works anywhere. ~30× localhost, so for looking as much as iterating |

The tunnel creates itself on first run. There is no separate setup step and
nothing to remember; without a `CLOUDFLARE_API_TOKEN` it is skipped and `dev`
carries on with the two local addresses. `TUNNEL_HOSTNAME` is in `[env]` in
`mise.toml`, and it is a single name — two people cannot serve it at once, so
take your own before sharing a machine.

It exists because iOS Safari with HTTPS-Only refuses a plain `http://` address
outright, so a LAN IP cannot be opened on a phone at all. Pair it with
[Remote Control](https://code.claude.com/docs/en/remote-control) to drive a
session and watch the result on the same handset.

**Reload to see a change.** The rebuild is automatic and takes a few seconds;
the page in front of you is not. There is deliberately no live reload — a poller
never lets `networkidle` settle, which would hang every screenshot in
`mise run shots`.

Sign in at `#/login`: all twelve seeded people, one click, no inbox. Ctrl-C
stops everything.

Everything else is a task. `mise tasks` lists them with what each one does —
that is the documentation, because it cannot go stale the way a list here would.

```bash
mise run watch               # verify on every save — the loop with no command
mise run verify              # the fast loop: types + unit, in parallel
mise run check               # the gate: types + every tier + dead code + docs
mise run test:unit           # pure logic, no runtime
mise run test:worker         # the Worker in workerd, real D1
mise run test:render         # rendering, no backend at all
mise run test                # a real browser + real Worker
mise run time /api/health    # min/p50/p95/max over N runs
mise run deploy              # check -> test -> deploy -> migrate -> seed -> verify
```

No timings here. Every tier prints its own against a budget on each run, and
`mise run test:all` prints all four — which is why the numbers that used to sit
in this block had drifted to between two and seven times wrong.

## Seeing what it did

```bash
mise run analytics           # what failed, where, how often — dev server or deployment
mise run analytics 168       # the last week instead of the last day
mise run analytics --remote  # the deployment, even while a dev server is up
```

**There is no Cloudflare dashboard for this.** Not an oversight and not something
left unfinished — Workers Analytics Engine ships a write API and a SQL API and no
UI at all. Cloudflare [say a Grafana-like view is planned](https://blog.cloudflare.com/analytics-engine-open-beta/);
until it exists the documented options are the SQL API, which is what the task
above uses, or [Grafana with the Altinity ClickHouse plugin](https://developers.cloudflare.com/analytics/analytics-engine/grafana/)
pointed at the same endpoint.

What *is* in the dashboard is Cloudflare's own request data, which is a different
thing: **Workers & Pages → remy-sport → Metrics** gives requests, errors, CPU
time and geography. It knows nothing about a push that Apple rejected or a
broadcast that lasted forty seconds. That is what
[src/analytics.ts](src/analytics.ts) is for.

Reading the deployment needs an API token with **Account Analytics: Read** —
`wrangler`'s own OAuth token has no analytics scope. Same convention as
`cf:audit`: `$CLOUDFLARE_API_TOKEN`, or fnox. Reading a dev server needs
nothing: `wrangler dev` discards Analytics Engine writes, so a dev worker keeps
its events in memory instead and serves them at `/api/dev/events`, which 404s on
a deployment.

## How it fits together

**The schema is authored, and everything derives upward from it.**

```
src/db/*-schema.ts  →  createSelectSchema  →  oRPC .output()  →  RouterClient  →  React
```

The drizzle tables are the root. Nothing generates them and nothing should — the
generator that used to had to be taught about typed JSON columns, the
vocabulary-derived enums and the unique indexes one feature at a time, and
whatever it had not been taught was dropped without a word.

The Product Owner's model still decides what a table *is*. It lives in
[remy-sport-biz](https://github.com/joeblew999/remy-sport-biz) as TypeScript and
is copied in verbatim by `mise run domain:sync` — a copy, never a transform,
because a transform is where the two disagree. What proves the model fits the
schema is the seed itself: `db.insert(city).values(CITY)` does not compile if a
field and a column disagree.

## Where things are

```
src/api/        oRPC procedures — the whole domain API
src/web/        the GUI: React 19 + Vite, served at /, also Tauri desktop + iOS
src/db/         Drizzle schema and migrations (auth-schema.ts is generated)
src/auth*       Better Auth: passwordless email OTP, orgs, admin
tests/unit/     pure logic             (bun test)
tests/worker/   the API in workerd     (vitest)
tests/render/   a browser, no backend  (playwright)
tests/e2e/      a browser + real Worker (playwright)
```

## Before you change anything

Read [AGENTS.md](AGENTS.md). It is short and it is only the traps — the things
that have already cost a real bug. The Product Owner's model lives in
[remy-sport-biz](https://github.com/joeblew999/remy-sport-biz) and wins over
anything here.
