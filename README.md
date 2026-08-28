# Remy Sport

Basketball events, teams and live scoring for Thailand. Cloudflare Workers + D1,
oRPC, React 19, shipped to web, desktop and iOS from one bundle.

Deployed at **https://remy.ubuntusoftware.net**

## Run it

```bash
mise trust && mise install && mise run setup
mise run dev                 # seeded, rebuilds on save, serves all three below
```

| | |
|---|---|
| `http://localhost:8787` | this machine. 7ms, and what the tests use |
| `http://<lan-ip>:8787` | same wifi. The address is printed on startup |
| `https://dev-remy.ubuntusoftware.net` | fixed, HTTPS, works anywhere. ~1.4s, so not for iterating |

The tunnel needs `mise run tunnel:setup` once. iOS Safari refuses plain `http://`
with HTTPS-Only on, which is what it is for.

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

Remote-control a session from your phone: see [Claude Code's Remote Control docs](https://code.claude.com/docs/en/remote-control).

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
