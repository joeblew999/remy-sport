# Plan — adopting shadcn-places

Status: open, 2026-09-10. **Step 1 done and both listed bugs closed**; the
decision in step 2 is the Product Owner's and is what everything else waits on. **The service exists and is
live**; this is the plan for what *this* application does about it.

Places have moved out. The reasoning, the five sources measured against each
other, and the corrections that came from building it now live with the service:

- **Repository** — https://github.com/joeblew999/shadcn-places
- **Live** — https://shadcn-places.gedw99.workers.dev
- **Why those sources** — [why-these-sources](https://github.com/joeblew999/shadcn-places/blob/main/docs/2026-09-09-why-these-sources.md),
  moved out of this repository on 2026-09-10
- **What runs** — [the first build](https://github.com/joeblew999/shadcn-places/blob/main/docs/2026-09-10-01-first-build.md)

Nothing in this repository depends on it yet, and nothing should until the
questions below are answered. **This plan is deliberately small**, because the
interesting question is not "how do we call an API" but *what does this app stop
owning?*

## What the service actually gives us

Ask it rather than trusting a summary — `GET /api/coverage/{locale}` reports
*named* and *translated* separately, so a language whose every value is the
English string does not read as 100%. Today, for `th`:

| Tier | Rows | Translated into Thai |
| --- | --- | --- |
| Country | 257 | **100%** |
| Subdivision | 5,304 | **77%** — and **78 of 78 Thai provinces** |
| City | 69,700 | 11% worldwide, **89% of Thai cities** |

**Updated 2026-09-10. The earlier version of this table read 0% for subdivisions
and cities and said countries were the only tier worth adopting.** That was true
for about six hours. Adding OpenStreetMap and running Wikidata against
subdivisions moved Thai from nothing to 77%, and widening the city inventory took
Thai cities in Thailand to 89%.

**The blocker that made this plan cautious is gone.** It said adopting the
service's subdivisions would be a downgrade from the 77 provinces this repo
already has. It would now be an upgrade, and by a wide margin:

| | this repo's `PROVINCE` | the service |
| --- | --- | --- |
| Thai provinces | 77 | 78 |
| Non-Latin-script cells that are byte-identical to English | **847 of 1,001 — 85%** | 0 |
| Genuinely translated in `th`, `ja`, `ru`, `ar`, `ko`, `zh` | — | **78/78 in each** |

Our own province names are 85% English wearing a locale tag. The service's are
real translations with the source and `kind` recorded for every one.

## The three things this repository has to decide

**1. Do places stay vocabularies here at all?** `PROVINCE` and `CITY` are in the
Product Owner's model, seeded into D1, with names on the row. That is the right
shape for 77 Thai provinces and the wrong one for the world. Adopting the service
for countries while keeping provinces local is a defensible middle, and it should
be a decision rather than a drift.

**2. `CITY_CODES` is a `z.enum` and a drizzle column enum.** Fine at two cities,
fatal at thirty-four thousand — the union lands in the model file, and the client
imports it. `provinceCode` is already plain text validated at the boundary for
exactly this reason. This has to change before the app consumes any city from
anywhere, and it is a migration.

**3. There is no foreign key across a service boundary.** A city id would point
at another database. So a venue stores the id *and a snapshot of the names*, which
is mostly a gain: the event page renders when the service is down, and a fixture
from 2024 keeps the name it was played under when a city is renamed upstream.

## Two live bugs here, unrelated to any of this — **both fixed 2026-09-10**

Found while measuring for the service, and they were this repository's:

- ~~**`tl` resolves to `en-US` through ICU.**~~ **Fixed.** Filipino is `fil`;
  `tl` did not error, it silently returned English, so anywhere a declared
  locale reached an `Intl` API Filipino readers got English and nothing said so.
  `INTL_TAG` in `src/web/lib/dates.ts` maps it, and a unit test asserts that
  *every* released locale reaches Intl as itself rather than as another
  language — the general form, so a twenty-eighth locale with the same problem
  fails on arrival. `tag("tl")` now resolves to `fil-u-ca-gregory`.
- ~~**1,199 of 3,852 name cells … byte-identical to the English value**~~
  **The rule exists.** "No non-Latin language ships the English word
  untranslated" is in `tests/repo/messages.test.ts`. Run against the model as it
  stood that morning it reported exactly 55 — four object types and one action,
  on screen in eleven languages — which are fixed. `PROVINCE`'s 847 remain, and
  they are this plan's subject rather than a defect: they are romanised because
  nobody transliterated them, which is the argument for adopting the service.
  Owned by [Translation provenance](2026-09-09-19-translation-provenance.md).

## Steps

- [x] **1 · Fix `tl → fil`,** with a check that no declared locale resolves through
      ICU to a different language. Independent of everything else here.
      **Done 2026-09-10**, and as the general check rather than the one mapping:
      `tests/unit/dates.test.ts` asserts every released locale reaches Intl as
      itself, so the next locale ICU disagrees with fails the day it is declared.
- [ ] **2 · Decide question 1** with the Product Owner: which tiers, if any, this
      app stops owning.
- [ ] **3 · Retire `CITY_CODES` as an enum** — FK plus boundary validation — only
      once step 2 says cities are coming from somewhere.
- [ ] **4 · Bind the service** if step 2 says so: the oRPC client over a service
      binding, id plus name snapshot on the row, and a local fallback so `bun run
      dev` and the full suite pass with the service unreachable. That last part is
      the one that gets skipped under time pressure and the one that decides
      whether every developer now starts two Workers to run one app.
