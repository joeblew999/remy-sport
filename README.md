# Remy Sport

Basketball events, teams and live scoring for Thailand. Cloudflare Workers + D1,
oRPC, React 19, shipped to web, desktop and iOS from one bundle.

Deployed at **https://remy.ubuntusoftware.net**

## Run it

```bash
mise trust && mise install && mise run setup
mise run dev:seed            # http://localhost:8787
```

Everything else is a task. `mise tasks` lists them with what each one does —
that is the documentation, because it cannot go stale the way a list here would.

```bash
mise run check               # types + unit + worker + dead code + docs + conventions
mise run test:unit           # pure logic, no runtime          ~30ms
mise run test:worker         # the Worker in workerd, real D1  ~1.5s
mise run test:render         # rendering, no backend at all    ~13s
mise run test                # a real browser + real Worker    ~1.1m
mise run deploy              # check -> test -> deploy -> migrate -> seed -> verify
```

## Where things are

```
src/api/        oRPC procedures — the whole domain API
src/web/        the GUI: React 19 + Vite, served at /, also Tauri desktop + iOS
src/db/         Drizzle schema and migrations (auth-schema.ts is generated)
src/auth*       Better Auth: passwordless email OTP, orgs, admin
tests/unit/     pure logic          (bun test)
tests/worker/   the API in workerd  (vitest)
tests/*.spec.ts a real browser      (playwright)
```

## Before you change anything

Read [AGENTS.md](AGENTS.md). It is short and it is only the traps — the things
that have already cost a real bug. The Product Owner's model lives in
[remy-sport-biz](https://github.com/joeblew999/remy-sport-biz) and wins over
anything here.
