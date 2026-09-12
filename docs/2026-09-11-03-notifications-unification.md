# Task — Unify notifications end to end

**File:** `2026-09-11-03-notifications-unification.md` — refer to this plan by that name.

**Repo:** `joeblew999/remy-sport`
**Scope:** content model, single trigger path, Durable Object scheduler replacing cron, type safety.

## Principle

For every notification type, **copy, locale resolution, deep-link path, and collapse tag are decided in exactly one place; only presentation and transport fork.** And **nothing scans for work** — every notification is triggered by the thing that causes it, at the moment it becomes due.

## Vocabulary (use these words, in code and in copy)

- **Event** — the container: a tournament, league season, or camp. Has `startDate` / `endDate` (bare `YYYY-MM-DD`), a venue `timezone`, a city. **An event has dates, never a time.**
- **Fixture** — anything with a start *instant* that a person turns up to. A fixture is either a **game** (`game` table, tournaments and leagues) or a **session** (`eventSession` table, camps). **Reminders are about fixtures, never about events.**
- `*Date` columns hold days; `*At` columns hold instants. This is enforced by type (D7), not by convention.

`EVENT_REMINDER` is removed from the vocabulary and replaced by `GAME_REMINDER` and `SESSION_REMINDER` (change to `remy-sport-biz`; needs Product Owner sign-off before step 2). If a day-level "the tournament starts tomorrow" reminder is ever wanted, it is a new type with its own day-anchored scheduler — not a repurposing of these.

The audience / preference / delivery machinery is already correct and is **out of scope**: `src/api/push.ts` (`audience()`, `wantsChannel()`), `src/api/transports.ts`, `src/api/unsubscribe.ts`, `src/api/email-channel.ts`, the `remy-notifications-dlq` consumer. Do not restructure these.

## Current state (what is being replaced)

| Concern | Where it lives today |
|---|---|
| Copy for game start/end/score, reminders | `src/api/notify-queue.ts` (hand-built PUSH object + `gameMail()` / `reminderMail()`) |
| Copy for meeting invite | `src/api/meetings.ts` (calls `notify()` synchronously in the request handler) |
| Copy for roster change | `src/api/registrations.ts` (same; PUSH only) |
| Copy for OTP / org invite | `src/auth.ts` (calls `mailer.send()` directly) |
| Duplicate client-side score card | `src/web/lib/native-notify.ts` `scoreBody()` mirrors `games.ts announce()` by hand |
| Enqueue paths | `games.ts announce()` → `env.NOTIFICATIONS.send()` with `GameJob`; `scheduled.ts` → `ReminderJob`; meetings/registrations skip the queue |
| Reminder scheduling | `scheduled.ts` cron (`*/5 * * * *`) scans every future event in D1 every five minutes, comparing `event.startDate` (a bare day) — so the "1h" window has never meant anything |
| Which types exist | `NOTIFICATION_TYPE` vocabulary (14 codes); `OFFERED` hand-list in `notification-settings.tsx` (6); `tests/repo/notifications.test.ts` cross-checks |
| Tags / deep links | Computed at each call site, recomputed in `native-notify.ts` |

---

## Part A — Content

### A1. Content model

Create `src/notifications/content.ts`:

```ts
export type NotificationContent = {
  title: string        // push title, email subject
  summary: string      // push body, email preview / plain text
  body?: string        // email-only longer copy
  cta?: { label: string; route: Route }   // see D4
  tag: string          // collapse key, e.g. "score:<gameId>"
}
```

- `cta.route` and `tag` are computed here and nowhere else.
- PUSH renderer emits `routeHref(route)`; EMAIL renderer prefixes `originOf(env)`. `routeHref` emits `#/...` today and a clean path after the TanStack Router migration; nothing else in the notification code knows which.
- This file has **no server-only imports** — it is shared with `src/web`.

### A2. One file per type

`src/notifications/types/<type-code>.ts` for each type that sends today:

`MATCH_START`, `MATCH_END`, `SCORE_UPDATE`, `GAME_REMINDER`, `SESSION_REMINDER`, `MEETING_INVITE`, `ROSTER_CHANGE`

Each is defined with `defineType` (see D1) and exports:

- `args` — Zod schema (D1)
- `channels` — all seven are `["PUSH", "EMAIL"]`. `ROSTER_CHANGE` gains email (Product Owner decision, Sep 2026); delete the "push only, deliberately" comment in `registrations.ts` — it explained an absence that no longer exists.
- `content(args, locale)` — the **only** place that calls the notification `m.*` Paraglide keys for that type.

`src/notifications/types/index.ts` exports `REGISTRY` (D2).

**Message keys:** merge the existing `push_<x>_title` / `push_<x>_body` / `email_<x>_subject` / `email_<x>_text` pairs into `notif_<type>_title` / `notif_<type>_summary` / `notif_<type>_body` wherever push and email copy say the same thing. Keep separate keys only where the two channels genuinely differ. `scripts/check-messages.ts` must stay green for `en` and `th`.

### A3. Renderers

`src/notifications/render.ts` maps `NotificationContent` → the existing `Rendered` union in `src/api/transports.ts`:

- PUSH: `{ channel: "PUSH", title, body: summary, url: routeHref(cta.route), tag }`
- EMAIL: through `src/mail/templates/frame.ts` + one generic `src/mail/templates/notification.tsx` — `title` → subject, `summary` → preview text and plain-text part, `body` → main copy, `cta` → button, `unsubscribeLabel` as today.

Delete `src/mail/templates/game.tsx`, `meeting.tsx`, `reminder.tsx`. Keep `otp.tsx` and `invite.tsx`.

### A4. Tauri client uses the same builder

Delete `scoreBody()` in `src/web/lib/native-notify.ts`. Call `REGISTRY.SCORE_UPDATE.content(args, locale)` instead. `native-notify.ts notify()` maps `content.cta.path` → hash and `content.tag` → the plugin's `group`. The web push card and the native card can no longer drift.

### A5. Settings derived, not hand-listed

Replace the `OFFERED` array in `src/web/components/notification-settings.tsx` with `Object.keys(REGISTRY)`. Update `tests/repo/notifications.test.ts`: every vocabulary code without a registry entry is listed in the test as **known-unimplemented**, so adding one is a deliberate act. (The other direction — registry key not in vocabulary — becomes a compile error under D2.)

### A6. `auth.ts` stays outside the queue

OTP and org invite have no audience, are not preference-gated, and must **not** carry `List-Unsubscribe`. They stay outside `notify()` and the queue, but they build a `NotificationContent` and render through `notification.tsx` so the emails match visually. Invite stays English-fallback per the existing reasoning (the `Accept-Language` on that request is the inviter's, not the recipient's).

### A7. Room for digests

`TypeDef` must allow `channels: ["EMAIL"]` with a custom email body renderer, so `DAILY_DIGEST` / `WEEKLY_DIGEST` (a list of items, not one event) fit later without changing the model. **Do not implement them now.**

---

## Part B — One trigger path, one queue shape

### B1. Single message shape

Every producer sends a `NotificationMessage` (D3) to `env.NOTIFICATIONS` via `enqueue()` in `src/notifications/enqueue.ts` — the **only** file that calls `env.NOTIFICATIONS.send()`.

Convert:
- `src/api/games.ts announce()` — replace the `GameJob` shape
- `src/api/meetings.ts` — currently calls `notify()` synchronously in the request handler; must enqueue
- `src/api/registrations.ts` — same
- `GAME_REMINDER` / `SESSION_REMINDER` producer — becomes the DO alarm (Part C)

`src/api/notify-queue.ts` becomes the **only** caller of `notify()`. Per message: parse with the discriminated union (D3), look up `REGISTRY[typeCode]`, resolve locale per recipient inside `notify()` from `localeCode` with the existing fallback, call `content()`, `render()`, hand to transports.

Delete the legacy `GameJob` / `ReminderJob` / no-`kind` decoders outright. There are no production users and nothing in flight; a message that fails the `v: 2` parse goes to the DLQ with the field name, which is the correct outcome for a stale shape.

### B2. Claim stays at consumption

`claimReminder()` and the `notification_sent` unique index (`object_type_code, object_id, type_code, kind`) are unchanged. Every reminder producer is at-least-once; the claim makes delivery exactly-once. `notification_sent.object_type_code` is `GAME` or `SESSION`, never `EVENT`. **Do not move the claim to the producer** — the existing comment in `scheduled.ts` explains why (a claim before a lost message is a reminder lost for good).

---

## Part C — Replace `scheduled.ts` with per-fixture Durable Object alarms

### C1. `FixtureScheduler` Durable Object

`src/notifications/fixture-scheduler.ts` exporting a DO class. `wrangler.toml`: `new_sqlite_classes` migration, binding `FIXTURE_SCHEDULER`, present **explicitly** in `[env.staging]` as well. Id: `idFromName(`${kind}:${id}`)` where `kind` is `"game" | "session"`.

State (Zod-parsed on every read, see D5):

```ts
{ kind: FixtureKind; id: string; eventId: string; startsAt: IsoInstant; pending: Window[] }
```

Methods:

- **`schedule({ kind, id, eventId, startsAt })`** — store; compute the next due window from `WINDOWS` (`startsAt − 24h`, then `startsAt − 1h`), skipping any already in the past; `setAlarm()` for it. Idempotent: same `startsAt` twice is a no-op; a new `startsAt` recomputes `pending` and replaces the alarm.
- **`cancel()`** — `deleteAlarm()`, clear state.
- **`alarm()`** — `enqueue({ v: 2, typeCode: kind === "game" ? "GAME_REMINDER" : "SESSION_REMINDER", args: { id, eventId, window }, targets: [{ objectTypeCode: kind === "game" ? "GAME" : "SESSION", objectId: id }] })`, pop that window from `pending`, set the alarm for the next one if any. A failed enqueue **throws** so the runtime retries the alarm — do not swallow it.

The DO stores the instant only. Venue timezone is read from the parent event at render time by `content()`, because it is presentation ("kick-off at 15:00 Bangkok time"), not scheduling.

### C2. Wire the fixture lifecycle

One helper, `syncFixtureSchedule(env, fixture)`, called from every write path of `game.starts_at` and `eventSession.starts_at`:

- create → `schedule(...)`
- update → `schedule(...)` **only if `startsAt` changed**, otherwise nothing
- delete → `cancel()`

Today those write paths are in `src/api/games.ts` and the session routes in `src/api/events.ts` (or wherever `eventSession` is written — grep for it). Call the DO **after** the D1 write commits, inside `waitUntil` so the request isn't held on it. If the DO call fails, write `scheduler.drift` to Analytics Engine so a stale alarm is visible rather than silent.

Grep for every other write to `starts_at` / `startsAt` on either table (imports, fixtures, admin tools, `ops seed`, tests) and route them through the same helper in the same PR.

Deleting an **event** cascades: `DELETE /events/{id}` must `cancel()` every fixture under it before the D1 delete, or those DOs fire reminders for games that no longer exist.

### C3. Delete the cron, keep reconcile

One release, no migration path — there are no production users.

- Delete `scheduled.ts`.
- Remove `crons` from `wrangler.toml`, including the `[env.staging]` inheritance comment. `provision` refuses it from now on (E2).
- Add `bun run ops notifications reconcile --env X` (Part E) that walks every future game and session in D1 and calls `schedule(...)` on its DO. Its purpose is not migration; it is the recovery tool for the day C2 is bypassed, and the thing `seed` / `demo on` call after writing fixtures (E6). **Keep it permanently.**
- The drift check that a watchdog cron would have done lives in `ops notifications status` and the smoke check (E4) instead — run on demand and at every deploy, not on a timer.

### C4. Tests

`tests/unit/fixture-scheduler.test.ts`. The repo runs vitest on miniflare directly, not `@cloudflare/vitest-pool-workers`; adding that package is **permitted for this one purpose** because `runDurableObjectAlarm()` is the only sane way to test alarms. Cases:

- alarm fires at `startsAt − 24h`, then at `startsAt − 1h`, for both a game and a session
- reschedule replaces the alarm and recomputes `pending`
- cancel removes the alarm
- fixture created inside the 24h window → only the 1h alarm is set
- fixture created inside the 1h window → nothing is set
- a throwing `NOTIFICATIONS.send` leaves the alarm set (retry path)
- `schedule()` called twice with the same `startsAt` → one alarm, no state churn
- deleting the parent event cancels every fixture DO under it

---

## Part D — Type safety

The goal: a wrong `typeCode`, a missing arg, a renamed route, or a stale queue message is a `tsc` failure or a Zod parse failure at the boundary — never a rendered "undefined".

### D1. Each type declares its args with a Zod schema

Following the project's drizzle-zod convention: derive from Drizzle tables where the args are row data.

```ts
export const SCORE_UPDATE = defineType({
  code: "SCORE_UPDATE",
  args: createSelectSchema(game)
    .pick({ id: true, homeScore: true, awayScore: true })
    .extend({ home: z.string(), away: z.string(), eventName: z.string().nullable() }),
  channels: ["PUSH", "EMAIL"],
  content: (args, locale) => ({
    title: m.notif_score_update_title({ ... }, { locale }),
    summary: args.eventName
      ? m.notif_score_update_summary({ event: args.eventName }, { locale })
      : m.status_live({}, { locale }),
    cta: { label: m.notif_view_game({}, { locale }), route: { page: "game", id: args.id } },
    tag: `score:${args.id}`,
  }),
})
```

`defineType<C extends NotificationTypeCode, S extends z.ZodTypeAny>(def)` is generic over the schema so `content` receives `z.infer<S>`. A wrong or missing field is a compile error.

### D2. `REGISTRY` is checked against the vocabulary at compile time

```ts
export const REGISTRY = {
  MATCH_START, MATCH_END, SCORE_UPDATE, GAME_REMINDER, SESSION_REMINDER, MEETING_INVITE, ROSTER_CHANGE,
} as const satisfies Partial<Record<NotificationTypeCode, TypeDef>>
```

Use `Partial<>` because eight vocabulary codes are unimplemented (A5). An entry whose `code` does not match its key, or a key that is not a `NotificationTypeCode`, fails `tsc`. Add a type-level assertion that every `REGISTRY[K].code === K`.

### D3. The queue message is a discriminated union derived from the registry

```ts
export type NotificationMessage = {
  [K in keyof typeof REGISTRY]: {
    v: 2
    typeCode: K
    args: z.infer<(typeof REGISTRY)[K]["args"]>
    targets: Target[]
    users?: string[]
    exclude?: string[]
  }
}[keyof typeof REGISTRY]

export async function enqueue(env: Bindings, msg: NotificationMessage): Promise<void>
```

- `enqueue()` in `src/notifications/enqueue.ts` is the **only** caller of `env.NOTIFICATIONS.send()`. Enforce with a repo test that greps for `NOTIFICATIONS.send(` outside that file and fails on any hit.
- Producers get a compile error for a mismatched `typeCode` / `args` pair.
- The consumer parses with `z.discriminatedUnion("typeCode", [...])` built from the same registry (`args` schema wrapped per type), so a message from an older deploy fails loudly with the offending field name and lands in the DLQ — not as a render error three retries later.

### D4. Deep links are `Route` objects, not strings

The typed route table already exists: `src/web/lib/router.tsx` exports `PAGES` (const union), `Page`, `Route`, `parseRoute()`, `routeHref()`. Do **not** add a second `routes.ts`.

- Split `router.tsx` into `src/web/lib/route.ts` (pure: `PAGES`, `Page`, `Route`, `parseRoute`, `routeHref`, `ancestorsOf` — no React, no DOM) and `router.tsx` (the hooks, re-exporting from `route.ts`). Existing call sites are unchanged.
- `NotificationContent.cta` becomes `{ label: string; route: Route }`. PUSH renders `routeHref(route)`; EMAIL renders `originOf(env) + routeHref(route)`. The queue message and the DO carry `Route`, Zod-parsed with `z.enum(PAGES)` on `page`.
- Replace the hand-written `` `#/game/${id}` `` in `native-notify.ts` and `` `#/meeting/${id}` `` in `meetings.ts` with `Route` objects through the content builders.

A `page` that is not in `PAGES` is a compile error in the content builder and a parse failure at the queue boundary. TanStack Router remains what `router.tsx`'s header says — a possible future swap to hash-history mode that leaves these call sites alone — and is not a prerequisite for any of this.

### D5. DO state and windows

```ts
export const WINDOWS = ["24h", "1h"] as const
export type Window = (typeof WINDOWS)[number]
```

```ts
export const FIXTURE_KINDS = ["game", "session"] as const
export type FixtureKind = (typeof FIXTURE_KINDS)[number]
```

The `FixtureScheduler` stored state is Zod-parsed on every `alarm()` and `schedule()`; a shape change across deploys is caught, not silently misread. The reminder args schemas use `z.enum(WINDOWS)`, so `notification_sent.kind` can only ever hold a known window.

### D6. Locale

`content(args, locale: ReleasedLocale)` — `ReleasedLocale` from the vocabulary, not `string`. A raw `Accept-Language` value cannot reach a `m.*` call without passing through the existing resolver.

### D7. Days and instants are different types

```ts
export type IsoDay = string & { readonly __brand: "IsoDay" }         // "2026-09-14"
export type IsoInstant = string & { readonly __brand: "IsoInstant" } // "2026-09-14T09:00:00Z"
```

In `src/db/*-schema.ts`, `event.startDate` / `endDate` are `.$type<IsoDay>()`; `game.startsAt`, `eventSession.startsAt` / `endsAt` are `.$type<IsoInstant>()`. drizzle-zod carries the brands into the derived schemas, and oRPC carries them to the client.

In `src/web/lib/dates.ts`: `formatDayShort`, `formatIsoDay`, `formatDayRange`, `formatMonthYear` accept `IsoDay` only; `formatTimeOn`, `formatClockOn`, `toLocalInput`, `fromLocalInput` (return) accept `IsoInstant` only. `downloadICS` takes `IsoDay` for events (it already emits `VALUE=DATE`). A game instant passed to a day formatter, or an event date passed to a time formatter, is a compile error — the GUI cannot make the event/fixture mistake.

`NotificationContent` builders receive the same branded types through their args schemas, so a reminder cannot be built from an event date.

### What this still cannot catch

- A message key that exists but says the wrong thing — that is what `check-messages.ts` and review are for.
- A fixture whose `startsAt` was written outside the C2 helper — that is what `ops notifications status`, the smoke check, and the permanent `ops notifications reconcile` are for.

---

## Part E — Automation CLI (`bun run ops`)

`scripts/ops.ts` is the one entry point for operating an environment, and `scripts/lib/cloudflare.ts` resolves `--env` against `wrangler.toml` so every verb sees the same bindings the Worker does. Every new piece in Parts A–D must be reachable and checkable from there, or it is invisible to the person on call.

### E1. New verb: `notifications`

Add `scripts/ops/notifications.ts`, registered in `OPS` under group `deployment`:

```
notifications reconcile --env X [--apply]   walk future games and sessions, set each FixtureScheduler alarm; dry-run by default
notifications status --env X                 per-type counts sent / claimed / DLQ'd in the last 24h, and how many future fixtures have no pending alarm
notifications send --env X <TYPE> <userId> [--args JSON]   enqueue one real message to one person — for verifying a template on a deployment
```

- `reconcile` is C3's seeding tool and the permanent recovery tool. Dry-run prints what it would set; `--apply` sets it. Uses the resolved config so it cannot be pointed at the wrong DO namespace.
- `status` reads Analytics Engine (E3) and the `notification_sent` table for the environment, and asks each future fixture's DO whether it has a pending alarm. A non-zero "no pending alarm" count is drift, and every line is a bug.
- `send` builds the message through `enqueue()` (D3), so the CLI gets the same compile-time `typeCode`/`args` check as the Worker. `--args` is Zod-parsed with the type's schema and refused with the field name on mismatch.

### E2. `provision` learns Durable Objects

`scripts/ops/provision.ts` currently enumerates D1, R2, queues (including dead-letter names), migrations and secrets from resolved config. Extend it to:

- read `[[migrations]]` / `new_sqlite_classes` and the `durable_objects.bindings` block from resolved config per environment
- report each DO class and binding as a resource, with outcome `present` / `missing`, the same way queues are reported
- refuse (`Refused`) if a named environment declares the `NOTIFICATIONS` queue but not the `FIXTURE_SCHEDULER` binding — that is the half-configured state C1 warns about, caught at provision time rather than at the first game or session write

`provision` must also **fail if `crons` is present** in any environment's resolved config, so the cron cannot quietly come back.

### E3. `analytics` gets the notification pipeline

`scripts/ops/analytics.ts` has `push.sent` and nothing else for notifications. Add data points, written by the Worker, and describe them in the same one-line-of-meaning style the file uses:

| Point | Written by | Meaning line |
|---|---|---|
| `notify.enqueued` (type, source) | `enqueue()` | Every message that entered the queue, by type and by which trigger sent it. |
| `notify.claimed` (type, window) | `claimReminder()` | Reminders that won the claim. Should track enqueued minus duplicates. |
| `notify.rendered` (type, channel, locale) | `notify()` | A card or an email that reached a transport. Zero for a released locale is a `check-messages` bypass. |
| `notify.dlq` (type, reason) | DLQ consumer | Messages that died. This should be empty. |
| `scheduler.set` / `scheduler.fired` / `scheduler.cancelled` (window) | `FixtureScheduler` | Alarms set, fired, cancelled. `fired` lagging `set` by more than one window is a stuck DO. |
| `scheduler.drift` (eventId) | C2 helper on DO failure; `ops notifications status` | An event whose alarm does not match its `startsAt`. Every line is a bug. |

`bun run ops analytics 24` then shows the whole pipeline in one screen, per environment.

### E4. `smoke` checks the scheduler

`scripts/deploy/smoke.ts` runs at the end of `deploy` and on its own. Add:

- **"the event scheduler answers"** — `GET /api/health` (or a dev-routes-gated `/api/dev/scheduler`) returns the `FIXTURE_SCHEDULER` binding as present and one `idFromName` round-trip succeeds.
- **"no future fixture is missing its alarm"** — the same query `notifications status` runs, expected zero. With no cron, this at every deploy is the drift check.

### E5. `coverage-data` reflects EMAIL as real

`scripts/ops/coverage-data.ts` `EXPECTED.NOTIFICATION_CHANNEL` is `["PUSH"]` with a comment explaining why PUSH has no seeded row. With `ROSTER_CHANGE` and the rest sending email (A2), EMAIL is now a fully implemented channel with the same property — the address is minted at sign-in by `email-channel.ts`, not seeded. Add `"EMAIL"` with a matching comment. Leave `LINE`, `SMS`, `IN_APP` out; they are still unimplemented and the coverage report should keep saying so.

### E6. `demo` and `seed` seed the scheduler too

`bun run ops seed --env X` writes games and sessions into a remote database directly, bypassing the API and therefore C2. After seeding, `seed` must call the same reconcile logic as E1 for the rows it wrote — otherwise every demo environment is born with fixtures and no alarms, and the smoke check fails on the first deploy. Same for `demo on` if it creates fixtures.

### E7. `versions` shows the scheduler migration

`bun run ops versions` reports what each environment is running. Add the DO migration tag from resolved config so it is obvious at a glance whether staging and production have the `FixtureScheduler` class.

---

## Constraints

- No new npm dependencies, with one exception: `@cloudflare/vitest-pool-workers` (dev) for C4.
- No LINE / SMS / IN_APP transports yet, but `NotificationContent` (title + summary + cta) must be sufficient for all three.
- No ADR — document in code comments and `ops.ts` help strings, per project convention. Do **not** add mise tasks; every operator verb goes through `bun run ops`.
- Staging and production receive identical `wrangler.toml` changes; the DO binding and migration must appear explicitly under `[env.staging]`.
- No backward compatibility for queue message shapes, cron, or old templates — there are no production users. Delete, don't deprecate.

## Delivery order

0. Part E2 / E7 first — `provision` and `versions` must understand DOs before anything else is deployed, or staging cannot be provisioned for step 4.
1. Part D scaffolding (`defineType`, `REGISTRY`, `NotificationMessage`, the `route.ts` split, `WINDOWS`, `IsoDay`/`IsoInstant`) — pure types, no behaviour change, `tsc` green.
2. Part A — content files, renderers, `native-notify` and settings derivation. Behaviour unchanged, copy now centralised.
3. Part B — single enqueue path; meetings and registrations go async. Verify DLQ stays empty on staging.
4. Part C + Part E1, E3, E4, E5, E6 — DO, lifecycle wiring, cron deleted, `ops notifications`, analytics points, smoke checks. `bun run ops provision --env staging --apply`, then `bun run ops notifications reconcile --env staging --apply`, then `bun run ops smoke --env staging`. Repeat for production.

## Decisions (made, Sep 2026)

- DO alarms replace the cron; billing accepted.
- `ROSTER_CHANGE` goes to email as well as push.
- Reminders are about fixtures (games and sessions), not events. `EVENT_REMINDER` is replaced by `GAME_REMINDER` and `SESSION_REMINDER` in the PO vocabulary. Windows stay at 24h and 1h.
- Days and instants are distinct branded types (D7) so the event/fixture distinction is enforced in the GUI and in notifications, not documented.
- Meeting invites and roster changes enqueue instead of sending synchronously; a failed notification no longer fails the write.
- Every writer of `event.starts_at` found by the C2 grep is wired to the helper in the same PR.
- `ops notifications send` requires `--yes` on production.
- No migration path, no legacy decoders, no watchdog cron: there are no production users.
- Digests deferred; they need a per-user DO, not per-fixture.
- `auth.ts` OTP and org invite stay outside the queue.