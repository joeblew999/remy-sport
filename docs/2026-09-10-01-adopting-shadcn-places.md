# Plan — adopting shadcn-places

Status: proposed 2026-09-10. Nothing implemented here. **The service exists and is
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

| Tier | Rows | Named | Translated |
| --- | --- | --- | --- |
| Country | 257 | 100% | 100% |
| Subdivision | 5,304 | 0% | 0% |
| City | 34,135 | 0% | 0% |

**Countries are the tier worth adopting first**, and possibly the only one for a
while. Thai subdivisions and cities are empty because dr5hn carries no Thai and
because cities are not translated by anyone — see the service's own README for the
measurement that disproved a much rosier figure.

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

## Two live bugs here, unrelated to any of this

Found while measuring for the service, and they are this repository's:

- **`tl` resolves to `en-US` through ICU.** Filipino is `fil`; `tl` does not error,
  it silently returns English. Anywhere a declared locale reaches an `Intl` API,
  Filipino readers get English and nothing says so.
- **1,199 of 3,852 name cells in non-Latin-script locales are byte-identical to
  the English value** — 31%, `PROVINCE` accounting for 847 of them. Completeness
  passes because the cell is non-empty; the stray-script rule passes because Latin
  is not a stray script for Russian. The rule that catches it is one line: identical
  to English, in a locale whose script is not Latin. Owned by
  [Translation provenance](2026-09-09-19-translation-provenance.md).

## Steps

- [ ] **1 · Fix `tl → fil`,** with a check that no declared locale resolves through
      ICU to a different language. Independent of everything else here.
- [ ] **2 · Decide question 1** with the Product Owner: which tiers, if any, this
      app stops owning.
- [ ] **3 · Retire `CITY_CODES` as an enum** — FK plus boundary validation — only
      once step 2 says cities are coming from somewhere.
- [ ] **4 · Bind the service** if step 2 says so: the oRPC client over a service
      binding, id plus name snapshot on the row, and a local fallback so `bun run
      dev` and the full suite pass with the service unreachable. That last part is
      the one that gets skipped under time pressure and the one that decides
      whether every developer now starts two Workers to run one app.
