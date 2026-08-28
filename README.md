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
built bundle on every interface:

| | |
|---|---|
| `http://localhost:8787` | this machine — 7ms, and what the tests run against |
| `http://<lan-ip>:8787` | same wifi, for a phone. The address is printed on startup |

**Reload to see a change.** The rebuild is automatic and takes a few seconds;
the page in front of you is not. There is deliberately no live reload — a poller
never lets `networkidle` settle, which would hang all 92 screenshots in
`mise run shots`.

Sign in at `#/login`: all twelve seeded people, one click, no inbox. Ctrl-C
stops everything.

### A fixed public URL, optionally

`mise run tunnel:setup` once, and from then on `mise run dev` also brings up a
Cloudflare tunnel on `TUNNEL_HOSTNAME` (see `[env]` in `mise.toml`). Without it
`dev` starts fine and simply says there is no tunnel.

It exists because iOS Safari with HTTPS-Only refuses a plain `http://` address
outright, so a LAN IP cannot be opened on a phone at all. Pair it with
[Remote Control](https://code.claude.com/docs/en/remote-control) to drive a
session and watch the result on the same handset.

Roughly 1.4s per request against 7ms on localhost, so it is for looking, not for
iterating. `TUNNEL_HOSTNAME` is a single name — two people cannot serve it at
once, so give yourself your own before sharing a machine.

Everything else is a task. `mise tasks` lists them with what each one does —
that is the documentation, because it cannot go stale the way a list here would.

```bash
mise run check               # types + unit + worker + dead code + docs + conventions
mise run test:unit           # pure logic, no runtime          ~30ms
mise run test:worker         # the Worker in workerd, real D1  ~1.5s
mise run test:render         # rendering, no backend at all    ~9s
mise run test                # a real browser + real Worker    ~11s
mise run deploy              # check -> test -> deploy -> migrate -> seed -> verify
```

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
