# Plan — localisation, the public surface, and places

File: `docs/2026-09-11-01-localisation-and-public-surface-plan.md`
Companion: `2026-09-11-01-localisation-and-public-surface-plan.ts`

Status: open, 2026-09-11. Agreed in conversation; stages 1 and 4 need the
Product Owner's sign-off on the points marked **PO**. Supersedes
`geoname-plan-not-ready.md` and the places half of
`2026-09-10-01-adopting-shadcn-places.md`.

Nothing here is urgent on its own. What makes it a plan rather than a list is
that the notifications work and the TanStack Router migration each touch the
same seams, so the order matters more than the speed.

## The rule

Text is sorted by *when it is fixed*, and each kind has exactly one home. The
reader's locale is always resolved at render time, never at build time, and is
passed explicitly on the server (queue consumer, Durable Object alarm, mail)
because there is no request there to read it from.

| Kind | Fixed | Home | Resolved by |
| --- | --- | --- | --- |
| Product strings, notification copy, **vocabulary labels** | design time | `messages/*.json` (Paraglide) | `m.*({}, { locale })` |
| Names a person typed in the product — team, event, division, session, person | runtime | `names` JSON column, `en` pivot | `pick(names, locale)` |
| Places — city, province, country | runtime, world-anchored | row with `geonameid`, names cached on pick | places procedure |
| Venues, orgs | runtime, world-anchored *when the world knows them* | row with `osm_id` / `wikidata_id`, `names` as override | `resolveName(row, locale)` |
| Help pages | design time, prose | MDX per locale, lazy routes in the app | Paraglide locale |
| Public product pages | design time, crawlable | prerendered HTML per locale at build | build script |
| Public event and org pages | runtime, crawlable | SSR from D1 at request time, edge-cached | Paraglide middleware |

Sources of already-translated text, cheapest first, so we translate only what
is ours: `Intl.DisplayNames` (languages, regions, currencies) and
`Intl.DateTimeFormat`/`NumberFormat`/`RelativeTimeFormat` — free, in the
runtime; OpenStreetMap and GeoNames through hosted APIs — free or cheap;
Paraglide for product copy and a short domain vocabulary. The Product Owner's
model owns **no translations at all**: codes and structure, English only.

Why: the vocabulary file today carries a 27-locale matrix per row in which
most cells are the English string pasted (`"es":"Event", "pt":"Event", …`),
seeded into D1 as a third copy, trimmed per request by `/api/reference`
because it grew to 98 KB. That passes `data:check` while being untranslated.
inlang's identical-to-source lint catches it; a JSONL comparison cannot.

## The URL scheme

One Worker, one namespace, no overlap. Settled now because the TanStack move
breaks every URL anyway and there are no users to keep links alive for.

```
/                        302 → /{locale}/  (Accept-Language, Vary; five lines in dispatch)
/{locale}/               prerendered, crawlable, hreflang + sitemap
/{locale}/coaches        "
/{locale}/parents        "
/{locale}/events/<id>    SSR from D1, public projection only
/{locale}/orgs/<id>      "
/sitemap.xml /robots.txt

/app                     SPA shell, TanStack Router, browser history, cookie locale
/app/events/<id>         deep-link targets (universal links claim /app/*)
/app/help/<slug>         lazy MDX help

/api/auth/*  /rpc/*  /api/*  /.well-known/*   unchanged
```

Public means a crawler may see it: marketing pages, events, orgs. Teams,
players, people, games and live scores are never public. That is the same
line as the privacy line, which is why it is easy to hold.

## Stages

Dependencies: 1 → 2 → 3 → 4 → 6. 5 needs only the route table above agreed on
paper. 7 needs 4. 2 is the gate for notifications; 4 is the gate for both
public surfaces.

### Stage 1 — the biz model goes English-only  **PO**

remy-sport-biz only.

- Every `names` / `descriptions` map becomes `name_en` / `description_en`.
- `province`, `city` and `locale` leave the vocabulary. Provinces and cities
  become runtime places rows (stage 7); locale labels come from
  `Intl.DisplayNames` (endonyms, as the picker already does).
- `data:check` stops asserting translation coverage. It keeps asserting codes,
  sort and structure.

The copied `src/domain/model/vocabularies.ts` shrinks to match. No app change
yet.

### Stage 2 — vocabulary labels into Paraglide

One PR. Blocks stage 3.

- `scripts/ops/vocab-messages.ts`: for every vocabulary table and code emit
  `age_group_U12`, `event_type_TOURNAMENT`, `object_type_EVENT`,
  `object_type_EVENT_desc` … into `messages/*.json`, salvaging the real
  translations from the current file. inlang lint then shows the padding.
- Generated typed resolver `vocab.ageGroup(code, locale)` → `m.age_group_U12`,
  used by client and server. Vocabulary is no longer read through `pick()`.
- `src/web/lib/locale.tsx`: `label()` and `describe()` keep their signatures
  (53 call sites untouched) and call the generated map. The `index` /
  `described` maps and the reference-fed `Term` type go.
- Migration: drop `names` and `descriptions` from every vocabulary table; keep
  `name_en` as the developer label. `seed.ts` stops materialising pivots for
  them.
- `/api/reference` returns codes and structure only; `forLocale()` trimming
  and `docs/done/2026-09-09-17-reference-payload-per-locale.md` are
  superseded. Optional `?locale=` computes labels server-side from messages
  for non-browser consumers.
- `LOCALES` derives from `project.inlang/settings.json`; "released" is a
  coverage-threshold test, not a hand list. Restore the `ALL_LOCALES` vs
  `LOCALES` distinction that collapsed on 2026-09-09 and fix the
  fifteen-vs-27 comment.
- Tests: `tests/worker/read.test.ts` loses its `names` assertions;
  `tests/helpers/seed-cache.ts` and `api-fixtures.ts` follow the schema.
- Country vocabulary keeps ISO codes; labels via `Intl.DisplayNames`.

Untouched: `src/api/notifications.ts` subscription names (user tables),
`registrations.ts`, `dev-accounts.ts`, `src-tauri`, the service worker.

### Stage 3 — notifications  (already planned)

Unchanged in scope. After stage 2 every notification type is one message pair
and one React Email template; vocabulary words in copy come from `vocab.*`
with the explicit locale, no D1 lookup for labels.

### Stage 4 — URL scheme and TanStack Router  (already planned, now with the table above)  **PO**

- SPA moves under `/app`, browser history, clean plural paths.
- `/` redirect entry in `DISPATCH`. `routeStrategies`: `/app/*`, `/api/*`,
  `/rpc/*` excluded from any URL-locale logic.
- Retire fumadocs and `sites/help` (its own `package.json`, lock file,
  three-locale i18n and deployment). Help MDX moves to `content/help/` and
  loads as lazy `/app/help/$slug` routes; the troubleshooter becomes a normal
  component with `m.*` strings.
- `NameTranslations` renders only the org's locales, defaulting from the org's
  country, not 26 boxes. **PO**: confirm organisers translate into their org's
  languages only.
- Universal-links / `.well-known` files claim `/app/*`.

### Stage 5 — static public pages

Parallelisable; only needs the route table.

- `src/site/` components (`Landing`, `ForCoaches`, `ForParents`, …) taking
  `{ locale }`, same shape as `src/mail/templates`. Share the branding pieces
  with email.
- `scripts/pages.ts` after the client build: `renderToString` per page per
  released locale; wrap in `<html lang dir>`, title, description, canonical,
  `hreflang` alternates + `x-default`; write `dist/{locale}/{slug}/index.html`,
  `sitemap.xml`, `robots.txt`.
- `wrangler.toml`: `html_handling = "auto-trailing-slash"`.
- Verify in Search Console: sitemap accepted, hreflang pairs recognised.

### Stage 6 — dynamic public event and org pages

Needs stage 4. The only stage that uses `paraglideMiddleware`.

- `/{locale}/events/<id>` and `/{locale}/orgs/<id>` rendered at request time
  from a read-only projection: name, dates, venue, divisions, schedule,
  Register / Open-in-app. No rosters, no people.
- Edge cache with a cache tag per event/org; purge in the event and org
  mutations.
- Middleware scoped to `/{locale}/*` with URL strategy; app and API routes
  excluded. `nodejs_compat` is already on, keep AsyncLocalStorage default.

### Stage 7 — places  (supersedes the geonames plan)

Needs stage 4 for the forms. No service of our own, ever.

- One oRPC procedure `places.search({ kind: "city" | "venue" | "org", q })`:
  1. D1 first — rows already anchored (the second organiser in Chonburi typing
     "PAO" gets the venue the first one chose).
  2. Fan-out with `Promise.allSettled` and per-source timeouts, English and
     Thai forms of the query. Adapters: Photon and Nominatim (OSM, venues),
     Open-Meteo geocoding (GeoNames, cities), Wikidata (orgs). Adding a source
     is one adapter.
  3. Dedupe by id (all OSM sources share `osm_id`), rank: D1 hits, then
     agreement count, then source order.
  4. Cache raw provider responses in the Cache API by source + query, ~1 day.
- `places.pick({ id })` enriches once (Nominatim `lookup` for `name:th` /
  `name:en`, address, coordinates) and returns the row to store. The external
  world is not consulted again for that row.
- Migration: `osm_id`, `lat`, `lng` on venue; `geonameid`, timezone on city;
  `wikidata_id` on org; `names` stays as the override.
- The existing shadcn picker points at the procedure: search first, type if
  missing.
- Hold the line: no ingestion, no cross-tier merging, no Google Places (its
  terms forbid storing results). Photon's public instance is for the dev
  tunnel; production uses a commercially licensed OSM host (Geoapify or
  LocationIQ) — run `scripts/eval-places.ts` with the key set to confirm it
  matches Photon's coverage.
- Weather (from the same Open-Meteo provider) hangs off venue coordinates
  once they exist.

Evidence (2026-09-11, `scripts/eval-places.ts`, free sources): OSM via Photon
anchors 9 of 10 real Thai venues with both Thai and English names; the miss is
a private commercial venue in Nonthaburi, which the override covers. Thai
queries find school venues that English queries do not — search in the user's
locale and in English. Open-Meteo resolves Bangkok, Chiang Mai, Si Racha,
Pattaya with `geonameid`, Thai name, coordinates and timezone; "Chonburi" must
be spelled "Chon Buri" and Nonthaburi is absent, so the picker must be
forgiving.

## Open questions

- **PO**: English-only model (stage 1); org-language name boxes (stage 4);
  events and orgs public, everything else private (stage 6).
- Commercial OSM host and Open-Meteo paid plan: line items, keys in Worker
  secrets like VAPID.
- Whether help pages should *also* be prerendered under `/{locale}/help/` for
  crawlers. Not now; the in-app route is enough until search shows demand.

## What is not in this plan

The Paraglide middleware on the app or API routes — the server already passes
`{ locale }` explicitly everywhere, which is the right pattern for the queue
and alarms and makes `getLocale()` redundant on the request path. The
middleware earns its place only on the SSR routes in stage 6.