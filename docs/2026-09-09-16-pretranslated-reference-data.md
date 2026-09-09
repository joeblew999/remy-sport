# Plan — pretranslated reference data, starting with places

Status: proposed 2026-09-09. **Plan complete; five sources measured; nothing
implemented.** Blocked on one Product Owner decision — step 2, the depth and the
licence. Steps 1 and 7 depend on no dataset and are wrong in the tree today.

The Product Owner: we need a places system for every country, pretranslated —
**reference data that already carries every language**, open source, fitting
what we have.

That is exactly what CLDR is, and the ask is bigger than places: the same corpus
already carries our regions, languages, scripts, currencies and time-zone names
in all thirteen locales, complete, for zero bytes. Section "The corpus" below is
the whole inventory.

The short answer for places specifically: **every tier is solvable, and each has a
different source.** Countries are free and complete from CLDR. Subdivisions are
covered by dr5hn, at the price of a share-alike licence and a gap in our
Southeast Asian languages. Cities — which looked impossible until Wikidata was
measured — are 83–99% for anywhere a tournament would be held, under CC0.

A plan that treats "places" as one dataset buys the wrong thing for two of the
three tiers, which is the main reason this document is long.

## The corpus — what "already translated into all languages" gets us

Measured 2026-09-09 on Bun 1.4.0, counting entries the runtime will actually
name in each of the thirteen locales:

| Reference data | Entries, per locale | State today |
| --- | --- | --- |
| Territories (countries) | **280**, all 13 locales | Not modelled at all |
| Languages | **all 13 + every other tag**, all 13 locales | Hand-written N×N `names` in `LOCALE` |
| Currencies | **173–307**, all 13 locales | Not modelled |
| Scripts | 8–10 of 10 sampled | Not modelled |
| Time-zone display names | **445 IANA zones**, all 13 locales | `event.timezone` stores the tag, shows it raw |
| **Subdivisions** | **English only — 3 entries elsewhere** | Thailand's 77, hand-written, 4 locales |

The first five are a solved problem we have not collected. The sixth is the only
real gap, and it is where all the work is.

**This retires the language picker's worst number.** [The picker at fifteen](done/2026-09-09-15-language-picker-at-fifteen.md)
records that `LOCALE.names` is an N×N matrix — 225 strings at fifteen languages,
every new language editing all fourteen existing rows — and that the picker wants
endonyms it does not have. Both come free from the same corpus:

```
endonyms   ไทย  English  日本語  中文  Español  Português  Indonesia
           français  Filipino  Tiếng Việt  한국어  Deutsch  Русский

th sees    ja=ญี่ปุ่น    de=เยอรมัน      vi=เวียดนาม
ja sees    th=タイ語     de=ドイツ語      vi=ベトナム語
de sees    th=Thailändisch  ja=Japanisch  vi=Vietnamesisch
```

One generator fills the endonym column *and* the N×N matrix, and neither is ever
hand-edited again. That plan's step 2 becomes a line of generated data rather
than a translation task repeated per language.

## What we have today

Places are already vocabularies in the PO's model, seeded into D1 like every
other one, with names on the row:

- `PROVINCE` — Thailand's 77 provinces, in [`src/domain/model/vocabularies.ts`](../src/domain/model/vocabularies.ts).
- `CITY` — two rows: `BANGKOK` and `CHIANG_MAI`.
- Both land in `province` / `city` in [`src/db/vocabularies-schema.ts`](../src/db/vocabularies-schema.ts),
  each with a `names` JSON column typed `Names`.
- [`src/domain/names.ts`](../src/domain/names.ts) resolves one with `pick()`,
  degrading to English rather than blanking.

Two facts about that, before adding anything:

**The places we already have are not pretranslated.** Every `PROVINCE` row
carries `th`, `en`, `ja`, `es` — four of the thirteen declared locales. Adding
250 countries in all thirteen while Thailand's provinces have four would make
one page fluent and the next one English.

**`cityCode` is a TypeScript union, not a foreign key.** `CITY_CODES` is derived
from the model array and used twice as an enum:

- [`src/db/app-schema.ts:97`](../src/db/app-schema.ts) — `text("city_code", { enum: CITY_CODES })`
- [`src/domain/api.ts:156`](../src/domain/api.ts) — `z.enum(CITY_CODES)`

That is right at two cities. It does not survive thirty-four thousand: the union
is in the model file, the model file is imported by the client, and every member
is a string literal `tsc` carries. `provinceCode` is already plain text
"validated at the API boundary" for exactly this reason — the same problem was
met once and solved once, in one of the two places.

**This is the actual blocker, and it is bigger than choosing a dataset.**

## Candidates measured

Every candidate is scored the same way, by a command rather than by reading a
README: **`bun run ops refdata score`** counts how many rows carry a name in each
locale `ALL_LOCALES` declares. Adding the next candidate is a row in that file's
`CANDIDATES`, not another script, and the numbers below are its output.

| Candidate | Licence | Countries | Subdivisions | Cities |
| --- | --- | --- | --- | --- |
| **CLDR** / `Intl.DisplayNames` | Unicode — free | **280, all 13 at 100%** | 5,395 **en only** | — |
| **GeoNames** | CC BY 4.0 — credit | (use CLDR) | 3,865 rows, **58–90%** | 34k–152k, **5–49%** |
| **dr5hn/countries-states-cities** | **ODbL — share-alike** | 250, **8 of 13** | 5,308 rows, **100% in 8 of 13** + `native` 100% | 152,970, **0%** |
| **annexare/Countries** | MIT — free | 252, **en only** + endonym | — | — |
| **Wikidata** | **CC0 — free** | (use CLDR) | ISO 3166-2, not yet counted | **4,099 over 100k: th 83%, vi 89%, id 86%, ja 95%, ru 96%, en 99%** |

Reading the table: **no single source wins, and each tier has a different
winner.** CLDR is complete and stops at countries. dr5hn is strongest for
subdivisions, misses our Southeast Asian set, and carries the heaviest licence.
**Wikidata is the only source that translates cities at all**, and it is also the
lightest licence — CC0.

**annexare/Countries is not a translation source** and is worth keeping anyway:
`countries.en` and `countries.native`, nothing between them, so it scores one
locale of thirteen. What it has that CLDR does not is the rest of a country row —
calling code, capital, currency, ISO2/ISO3, flag emoji — under MIT. If we ever
want those fields, that is where they are.

A candidate is only worth measuring if it could beat a cell above. The three that
would change the plan are: **subdivisions in `th`/`id`/`vi`/`tl`**, **any city
translations at all**, or **dr5hn's subdivision quality under a permissive
licence**.

### Two candidates that do not exist <!-- docs-check-ignore -->

Proposed 2026-09-09 and checked: `stefanwimmer128/open-geodata` and
`vitorscarvalho/geonames-json` are not real repositories. That user's sixty-odd
public repos contain nothing of the kind, and searching both names returns only
unrelated projects. Recorded so the next person does not spend the search again.

The `geonames-json` name does match several small third-party repos, and they are
all the same shape: a converter that turns the official GeoNames dump into JSON.
That is the GeoNames row above in a different container, usually years stale — a
packaging choice, never a coverage gain.

## Tier 1 — Countries: CLDR, and we already have it

`Intl.DisplayNames` is CLDR, it is inside Bun, workerd and every browser we
support, and it costs zero bytes. Measured 2026-09-09 on Bun 1.4.0:

```
th  -> th    named=280  TH:ไทย        JP:ญี่ปุ่น      PH:ฟิลิปปินส์
ja  -> ja    named=280  TH:タイ        JP:日本        PH:フィリピン
vi  -> vi    named=280  TH:Thái Lan   JP:Nhật Bản   PH:Philippines
ru  -> ru    named=280  TH:Таиланд    JP:Япония     PH:Филиппины
tl  -> en-US named=280  TH:Thailand   JP:Japan      PH:Philippines   ← English
fil -> fil   named=280  TH:Thailand   JP:Japan      PH:Pilipinas
```

280 territories, complete, in twelve of the thirteen. Two traps:

**1. `tl` silently resolves to `en-US`.** ICU's Filipino is `fil`; `tl` is not a
display-names locale and does not error — it returns English. That is the same
failure the fonts mapping refuses to allow: a locale that looks configured and
renders wrong, with nothing telling you. Any use of a locale as an ICU tag needs
`tl → fil` and a check that no locale resolves to a language other than itself.

**2. The names are editorial, and the runtime picks the wording.**

```
en  CN:China mainland  MM:Myanmar (Burma)  PS:Palestinian Territories
zh  CN:中国大陆         TW:台湾              KR:韩国
th  CN:จีนแผ่นดินใหญ่     MM:เมียนมา (พม่า)
```

"China mainland" is what this machine's ICU says today. A different ICU version
says something else, workerd and Safari need not agree with each other, and none
of it is reviewed by us. For a product with readers in CN, TW and HK that is not
a string to leave to whatever the runtime shipped.

**So: snapshot it, do not call it at render time.** A generator resolves all 280
territories × 13 locales once, writes a `COUNTRY` vocabulary in the model's own
shape, and the PO can override a name in the file. That is diffable in review,
identical on every runtime, and it is the architecture we already have — a name
is a property of the row.

Pin the source with `cldr-json` (`cldr-localenames-full`, Unicode licence,
permissive) as a **devDependency** if we want the CLDR version fixed rather than
tracking whatever Bun was built against. It never reaches the client either way.

| | |
| --- | --- |
| Source | CLDR, via `Intl.DisplayNames` (or `cldr-json` pinned at build time) |
| Licence | Unicode — permissive, no attribution burden |
| Coverage | 280 territories × 13 locales, complete |
| Runtime cost | Zero. The snapshot is ~250 rows in a vocabulary table |

## Tier 2 — Subdivisions: dr5hn wins on coverage, and costs the most

CLDR carries subdivisions, and it is a trap. Measured 2026-09-09 against
`cldr-subdivisions-full`:

```
en    5395 subdivisions across 200 countries   (TH=78, US=51)
th       3                                     England, Scotland, Wales
ja       3     zh 3     vi 3     ko 3     id 3     ru 3   ...
```

Every locale except English has the same three entries. **CLDR below country
level does not exist for us.**

GeoNames does. `admin1CodesASCII.txt` is 3,865 regions worldwide, and
`alternatenames` carries per-language names. Measured over TH, JP, VN, PH, ID, KR
— 230 regions, 3,067 cities over 15k population:

| locale | admin1 named | cities named |
| --- | --- | --- |
| en | 90% | 23% |
| ja | 90% | 49% |
| de / fr / es / pt | 90% | 12–13% |
| ko | 72% | 22% |
| id | 74% | 17% |
| zh | 69% | 19% |
| vi | 66% | 7% |
| th | 65% | 17% |
| ru | 65% | 32% |
| tl | 58% | 5% |
| fil | 0% | 10% |

Subdivisions are usable: 58–90%, with `pick()` already degrading the rest to
English. It must be described as partial, not pretranslated.

Note `tl` and `fil` again, and note that GeoNames splits them the *opposite* way
to ICU — `tl` has the region names, `fil` has some city names, neither has both.
Whatever we build reads both tags and merges them.

The cost is the licence: **GeoNames is CC BY 4.0 and requires visible
attribution.** That is a product decision — a line in the footer or an about
page — not only a code one. If the PO would rather not carry it, ISO 3166-2
labels from Wikidata are CC0 with no attribution, at the price of a SPARQL
extraction and its own uneven coverage.

### dr5hn/countries-states-cities-database — better than both, for eight of our thirteen

The PO put this forward, and it beats everything above for subdivisions. Measured
2026-09-09 against the published JSON exports:

| | Rows | Translated |
| --- | --- | --- |
| Countries | 250 | 19 languages, ~100% |
| **States / provinces** | **5,308** in ~200 countries | **19 languages at 100%** (5,296 rows), plus `native` at **100%** |
| Cities | 152,970 | **none** — see below |

Nineteen languages, every row: `br ko pt-BR pt nl hr fa de es fr ja it zh-CN tr
ru uk pl hi ar`. Against our thirteen, for states:

```
100%   ja  zh (via zh-CN)  es  pt  fr  ko  de  ru        ← eight, complete
  3%   id           1%  vi           6%  zh (plain tag)
  ✗    th           ✗   tl           en is the `name` column
```

**This is the best subdivision source measured** — 100% beats GeoNames' 58–90%
for those eight, and it is structured (ISO 3166-2 codes, parent country, type)
where GeoNames is a name list. Two things temper it:

- **The gap is precisely our Southeast Asian set** — `th`, `id`, `vi`, `tl`.
  Nineteen languages, and not one of the four this product most needs. For a Thai
  youth basketball platform, that is the half that matters.
- **The Latin-script rows are largely passthrough.** Of Thailand's 78 provinces,
  `de` is byte-identical to the English name in 77 and `fr` in 74. That is
  arguably correct — Ang Thong is Ang Thong in German — but "100% translated" is
  a coverage number, not a translation count. The CJK and Cyrillic rows *are*
  genuinely transliterated (`อำนาจเจริญ` → `アムナット・チャルーン`, `암나트 차로엔`).

`native` at 100% is the quietly useful column: every place in its own language,
so Thailand's provinces arrive in Thai without a `th` translation existing.

**Cities are the disappointment.** The `cities` table declares `native` and
`translations` in [its DDL](https://github.com/dr5hn/countries-states-cities-database/blob/master/sql/schema.sql),
and the published exports populate neither — 0 of 152,970 rows in
`countries+states+cities.json`, which carries only `id, name, latitude,
longitude, timezone`. That repo publishes no `cities.sql`, `cities.csv` or `cities.sqlite3` to check against either. <!-- docs-check-ignore -->
Columns exist; data does not.

**The licence is the real decision. It is [ODbL-1.0](https://github.com/dr5hn/countries-states-cities-database/blob/master/LICENSE)**
— share-alike, not permissive. Seeding it into D1 produces a Derivative Database
under ODbL's terms, and publicly using one carries an obligation to offer that
database under ODbL too, beyond the attribution CC BY asks for. That is heavier
than GeoNames and much heavier than CLDR, it is a question for the PO and not for
an agent, and nothing here is legal advice. **No dr5hn data should be seeded
until that answer exists** — it is easier to decide now than to unpick from a
shipped database later.

## Tier 3 — Cities: Wikidata has them, and it is CC0

**This section replaces an earlier conclusion that was wrong.** Measured across
GeoNames and dr5hn only, cities looked hopeless — 5–49% and 0% — and this plan
said nobody had the data. The Product Owner said cities were needed regardless,
which was the right push: **Wikidata has them.**

Of the world's **4,099 cities over 100,000 people**, labels exist for:

| en | ru | ja | vi | id | th | tl |
| --- | --- | --- | --- | --- | --- | --- |
| 99% | 96% | 95% | 89% | 86% | **83%** | 41% |

Thai names for 83% of the world's significant cities, Vietnamese for 89%,
Indonesian for 86% — the three languages every other candidate missed entirely.
Under **CC0**: no attribution, no share-alike, the lightest licence of the four.
(`ko` timed out twice on the public endpoint rather than returning a low number;
its neighbours suggest ~90%, and it needs re-running before being quoted.)

**The catch is the tail.** Coverage is a function of how notable a place is, so it
falls off below 100k, and Wikidata's population data is itself sparse — only
10,412 cities carry a population over 15,000 at all, against GeoNames' 34,135. It
is also the least convenient source: no ready-made export, so a SPARQL extraction
at build time, and the public endpoint times out on wide queries.

### What this makes possible

Cities do not become "pretranslated into thirteen languages" — nothing is. They
become **three layers that `pick()` already knows how to walk**:

1. **The romanised name, always.** Every GeoNames city has one. This is the pivot
   and it is never missing.
2. **The city's own language, 48–94%.** Thai cities in Thai at 83%, Japanese in
   Japanese at 94%, Korean 69%, Indonesian 62%, Filipino 65%, Vietnamese 48% —
   from GeoNames alternate names, measured over cities above 15,000 people.
3. **Cross-language for cities that matter, 83–99%.** From Wikidata, for the 4,099
   over 100k.

A Thai reader gets Thai for Thai cities and for the world's major ones, and a
romanisation for a small town in Java. That is how people refer to foreign places
anyway, and it is exactly the degradation `pick()` was written for.

**The number that was hiding.** The earlier "Thai names for cities: 17%" mixed two
different questions. Thai names for cities *in Thailand* is **83%**; Thai names
for cities in Japan, Korea and the Philippines is what dragged it down. For a
Thailand-first product the diagonal is the number that matters, and the diagonal
is good.

So cities stop being a vocabulary. Two honest shapes:

- **A city table, not a vocabulary.** Seed GeoNames `cities15000` (34,135 rows
  worldwide), names in whatever languages exist, ASCII/English pivot always
  present, searched server-side through oRPC and rendered by the registry's
  `Combobox` — installed already, and used by `people-picker.tsx`. Search is what
  earns its place at thirty-four thousand, exactly as the language picker plan
  argued it does not at fifteen.
- **Or no city list at all below subdivision.** `venue.address` is already free
  text; country and subdivision carry the structure that filters and listings
  need. This is the smaller change and may be the right one — a venue is a
  street, not a city code.

Either way `city_code` cannot stay a `z.enum` of the world.

## Where this data should live — a second repo is the licence answer

The Product Owner offered, 2026-09-09: *"if we need to break this out to another
repo we can."* It is worth taking, and not mainly for tidiness.

**ODbL's obligation is easy to honour and awkward to bolt on.** Share-alike says a
Derivative Database that is publicly used must be offered under ODbL. If the
derived data already lives in its own public repository, that obligation is
discharged by the repository existing — there is nothing to assemble later, no
question about what exactly was derived, and no argument about whether the
product repo became infected. If instead it is seeded straight into D1 from a
private tree, the same obligation is a thing somebody has to construct under
pressure, possibly years later, from a database that has since been edited.
Structurally this is the standard mitigation; whether it fully satisfies ODbL for
this product is still a question for the PO and a lawyer, not for an agent.

It also matches what already exists. `remy-sport-biz` is the PO's model, kept in
its own repo and fast-forwarded by `bun run ops biz`. A `remy-sport-refdata`
beside it would be the same shape with the opposite visibility: **public, because
the licences want it public.**

Three more reasons it is the right seam:

- **Different clock.** CLDR releases roughly twice a year, GeoNames changes
  daily, and this application changes several times a day. Data that moves on its
  own schedule should not be a reason to touch the app.
- **Weight.** dr5hn's export alone is 44MB. Nothing we ship needs it; only the
  generator does. The app repo should carry the *output*, which is small.
- **Provenance.** One place that records, per row, which source and which licence
  it came from — which is what an attribution line has to be built from, and what
  a licence change would have to be audited against.

**The rule that keeps it from becoming coordination.** AGENTS.md is explicit that
the CLI must not make developers coordinate steps. A machine without that
checkout must still build, test and deploy.

## It ships as its own Worker, public, for anyone

The Product Owner, 2026-09-09: *"we will make all this open source on a new github
repo, and deploy it as its own worker so anyone can use it, with the react, orpc
and shadcn bits, so that it's fully reusable into our repo and anyone else can
also use it."*

That settles three of this plan's open questions and replaces the "generated
artefact" shape above with something better.

**What it settles.**

- **The licence.** A public repo serving a public API is the cleanest possible
  answer to ODbL: the Derivative Database is offered to everyone by construction,
  and GeoNames' CC BY credit lives on the service's own page rather than being
  threaded into a basketball product's footer.
- **The weight.** 152,970 cities never enter remy-sport at all — not the repo, not
  its D1, not its bundle. The app holds a city *id* and nothing else.
- **The reuse.** The picker is the same problem in every product that has ever
  asked somebody where they are. Solving it once, publicly, is worth more than
  solving it privately for one Thai basketball app.

**Why oRPC, in the PO's words:** *"it makes it easy for one worker to use it from
another worker on CF or anywhere."* That is the whole argument, and it is stronger
than a preference — oRPC separates the contract from the transport, so this is
**one API with one typed client over three transports**, not three interfaces to
keep in step.

The mechanism, checked against the installed package rather than assumed:
`@orpc/client`'s fetch adapter accepts a custom `fetch`
([`adapters/fetch/index.d.mts:21`](../node_modules/@orpc/client/dist/adapters/fetch/index.d.mts)),
and a Cloudflare service binding *is* a `fetch`. So the same client, with the same
types, is pointed at `env.PLACES.fetch` inside our Worker and at a URL everywhere
else.

| Consumer | Transport | What they get |
| --- | --- | --- |
| remy-sport's Worker | **Service binding** as the client's `fetch` | End-to-end types, no public hop, no egress cost |
| Any other Worker, or any server | The public URL as the client's `fetch` | The same typed client, from npm |
| Anything not TypeScript | Plain HTTP + **OpenAPI** | `@orpc/openapi` is already a dependency here, so the document generates from the same contract rather than being written twice |
| A front end that wants the control, not the data | A **namespaced shadcn registry** | `components.json` has an empty `registries` map and only `@shadcn` configured, so the picker arrives as `@places/city-picker` through the `bun run ops ui add` the team already uses |

The contract is written once. Nobody hand-writes a second client, and nobody
discovers at integration time that the public API and the internal one drifted.

### The consequence nobody enjoys: no foreign key

A city now lives in another service's database, so `venue.city_id` cannot be a
foreign key. Nothing enforces that the id points at a real row, and a join is not
available at any price.

That sounds like a loss and is mostly a gain, provided one rule is followed:
**store the id and a snapshot of the names on our own row.**

- **An event page renders when the places Worker is down.** A hard dependency on
  a second service for a page to display a venue's city would be a worse product
  than a slightly stale name.
- **A fixture from 2024 keeps the name it was played under.** Upstream renames a
  city, and history does not silently change under a finished tournament.
- **It is the same call `pick()` already makes** — a name is a property of the row,
  which is this codebase's oldest localisation decision and the reason there is no
  translation table.

The service is therefore authoritative for *search and browse*, and our own row is
authoritative for *what this event actually said*. Cross-service, that is the
correct split; it is only cheap because the data is reference data and changes
about as often as a country does.

### What it does not settle

**ODbL still governs the data, and being open source is not automatically
compliance.** Two things have to be true, and neither is automatic:

- **The repo must contain the derived database**, not merely the ETL that builds
  it. Serving an API *is* public use under ODbL; publishing only the scripts and
  keeping the rows in a D1 nobody can reach would leave the share-alike obligation
  outstanding while looking, from the outside, exactly like compliance.
- **Data and code want different licences.** ODbL is a database licence and a poor
  fit for TypeScript. The convention — OpenStreetMap's — is to say so explicitly:
  **data under ODbL, code under MIT**, in two clearly separate statements. Without
  that split, "is the React component share-alike?" has no answer, and a company
  evaluating the picker will assume the worst and not use it.

Still not legal advice, and still worth twenty minutes of someone's who is.

**And local development must not need it.** AGENTS.md: the CLI must not make
developers coordinate steps. `bun run dev` cannot require a second Worker to be
running, or every developer and every test now starts two things and the seeded
fixtures stop being self-contained. The service binding needs a local fallback —
the handful of Thai provinces and cities the fixtures already use, served from
the seed — so that a machine with no access to the places service still runs the
whole suite.

## What runs where — the ETL is not a Cloudflare job

The Product Owner asked, 2026-09-09: *"so basically we ETL the data together and
then run it on something in CF?"* Half right, and the half that is wrong is the
expensive one.

**The ETL never runs on Cloudflare.** It is a build-time job in the reference-data
repo — a laptop or CI — that merges CLDR, dr5hn, GeoNames and Wikidata into rows
and commits the result. Nothing fetches a dataset in a Worker, at deploy time, or
on a schedule. What reaches Cloudflare is the *output*: rows in D1, seeded the
same way every other vocabulary already is.

**What Cloudflare then does is one query, and its cost is not obvious.**
[D1 bills rows *scanned*, not rows returned](https://developers.cloudflare.com/workers/platform/pricing/),
and since 1 September 2026 free-plan queries **fail** rather than throttle once
the daily row-read limit is reached. So the natural implementation of a city
picker is also the ruinous one:

| Query | What D1 reads |
| --- | --- |
| `WHERE name LIKE '%bangkok%'` over 152,970 cities | **152,970 rows — per keystroke.** A leading `%` cannot use a B-tree index |
| `WHERE country_code = 'TH' AND name LIKE 'bang%'` | the Thai rows the index selects — a few |

[Cloudflare's own index guidance](https://developers.cloudflare.com/d1/best-practices/use-indexes/)
says it plainly: a leading wildcard forces a full scan, a prefix search can use an
index, and arbitrary substring search wants **FTS5 with the trigram tokenizer** —
which D1 supports, at the cost of extra storage and writes.

### So the picker cascades, and the cost problem disappears

Country → subdivision → city, each step filtered by the one above:

- **Country** — 280 rows from CLDR. No database at all; it is in the bundle.
- **Subdivision** — filtered by country code, indexed. Thailand: 77 rows.
- **City** — filtered by subdivision or country, indexed, prefix-matched. Thailand:
  about 1,200 rows, of which a prefix match reads a handful.

No query ever scans the world. This is also the better interface — nobody wants
34,000 undifferentiated cities in one Combobox — so the cheap shape and the
usable shape are the same shape, which is the good case.

FTS5 stays in reserve for the day somebody must search cities across all
countries at once. It is not needed for a venue in a Thai tournament.

## Can the ETL itself run on Cloudflare?

The Product Owner, 2026-09-09: *"I am really wondering if the ETL and stuffing the
data into R2 and then D1 can actually all be done on Cloudflare itself. It's weird
I know."*

It is not weird. It is feasible, **Workflows is the primitive rather than a plain
Worker**, and there is a better argument for it than elegance. Limits checked
2026-09-09 against Cloudflare's own documentation.

### The three limits that decide the design

| Limit | Value | What it rules out |
| --- | --- | --- |
| [Memory per isolate](https://developers.cloudflare.com/workers/platform/limits/) | **128 MB, not configurable** | `JSON.parse` of dr5hn's 44MB export. The object graph is several times the file. **Everything must stream.** |
| [CPU time](https://developers.cloudflare.com/workers/platform/limits/) | 30s default, **5 min** opt-in via `cpu_ms`; 15 min for a cron trigger on a ≥1h interval | Nothing, once work is split into steps. Waiting on a download is not CPU time |
| [D1 bulk import](https://developers.cloudflare.com/d1/best-practices/import-export-data/) | `wrangler d1 execute --file` is the documented path, and it is **a CLI operation, not callable from a Worker** | The easy load. From inside a Worker there is only the binding API: batched `INSERT`s |

[Workflows](https://developers.cloudflare.com/workflows/) absorbs the first two:
10,000 steps by default and 25,000 configurable, each step retried independently
with backoff, and an instance runs indefinitely as long as no single step exceeds
the CPU limit. Steps return up to 1 MiB, or a `ReadableStream` for more — which is
the escape hatch the 128 MB limit demands.

### The shape, if it all runs there

1. **Fetch → R2.** One step per source. Downloads are wall-clock, not CPU, so the
   44MB and the six GeoNames archives cost nothing against the limit. R2 is exactly
   the right staging layer, and its objects read back as streams.
2. **Normalise → R2.** Stream each raw file, emit NDJSON of one row per line.
   Never hold a dataset in memory. This is the step that would be four lines in
   Node and is real work here.
3. **Load → D1.** Read the NDJSON in chunks, batched `INSERT`s through the binding.
   152,970 cities is a lot of *rows written* — a one-off cost, not a per-request
   one, but the part that `wrangler d1 execute --file` would do in a single command
   from CI.

### The honest trade

**Against:** two of the three steps are harder on Cloudflare than in a Node script
on a laptop. Streaming parsers exist because of a memory limit that a CI runner
does not have, and the D1 load is batched inserts instead of one file import.
Nobody would choose this for a one-time job.

**For, and it is the stronger argument:** this is not a one-time job. It is a
**public service that has to stay fresh** — GeoNames changes daily, Wikidata
constantly, CLDR twice a year. An ETL that only runs when a maintainer remembers
to run it on their laptop is how public datasets die. A cron-triggered Workflow
keeps the service current with nobody in the loop, holds no CI secrets, and its
retry and observability story is better than a shell script's.

So the recommendation is **both, split by frequency**: the first load can be
`wrangler d1 execute --file` from a machine, because it happens once and the CLI
does it in one command. The **refresh** should be a Workflow on a cron, because it
happens forever and should not depend on a person. Which also means the streaming
normaliser has to be written either way — so it may as well be written first, and
the CLI path used only to shortcut the initial import.

This is entirely the new repo's concern. Nothing about it reaches remy-sport.

## The decisions

| Question | Decision |
| --- | --- |
| Countries | CLDR, snapshotted into the model by a generator. Not resolved at render time. |
| Where does the snapshot live? | The PO's model, same shape as `PROVINCE`, so a name can be overridden by hand. |
| `tl` | Mapped to `fil` for every ICU call, with a check that no locale silently resolves to another language. |
| Subdivisions | dr5hn if ODbL is acceptable — 100% in eight of our thirteen, plus `native` — with GeoNames filling `th`/`vi`/`id`, where dr5hn has nothing and GeoNames has 65–74%. GeoNames alone if it is not. |
| Licences | CLDR is Unicode (free). GeoNames is CC BY 4.0 (a credit). dr5hn is ODbL-1.0, share-alike. **Discharged by publishing** — the service's repo carries the derived database and the credits, so remy-sport inherits neither. |
| How the data reaches us | **A public Worker of our own**, by service binding; not a committed artefact. It also serves anyone else over HTTP with an OpenAPI document. |
| Repo licensing | **Data ODbL, code MIT**, stated separately. Publishing the ETL without the derived rows would not satisfy share-alike. |
| `venue.city_id` | An id plus **a snapshot of the names on our row**. No foreign key exists across a service boundary, and the snapshot is what makes an old fixture keep the name it was played under. |
| Local development | `bun run dev` and the whole test suite must run with the places service unreachable, on the seeded fixtures' own cities. |
| Where the ETL runs | **Both, split by frequency.** First load by `wrangler d1 execute --file`, which is one command; the recurring refresh as a **cron-triggered Workflow** with R2 staging, because a public dataset that needs a maintainer's laptop goes stale. Streaming throughout — the 128 MB isolate limit is not negotiable. |
| Cities | **Wikidata over 100k (CC0) for cross-language, GeoNames for the local-language tail, romanised name as the pivot.** Not a vocabulary and not an enum: a table plus search. |
| `CITY_CODES` as `z.enum` | Goes. `provinceCode` already showed the way. |
| Backfill the existing four locales? | Yes — provinces in 4 of 13 beside countries in 13 is worse than either. |
| Scope of the generator | Every reference vocabulary CLDR already carries, not only countries. Languages and time-zone names are the two with a caller waiting. |
| `LOCALE.names` and `endonym` | Generated, not hand-written. Supersedes step 2 of the language picker plan. |

## Steps

- [ ] **1 · Name the `tl → fil` trap in code and hold it with a check.** One
      mapping beside the locale vocabulary, and a repo check that every declared
      locale's `Intl` tag resolves to its own language. This is the cheapest step
      and the one that is already wrong today wherever a locale reaches ICU.
- [ ] **2 · Decide the depth and the licence with the PO** — countries only,
      countries + subdivisions, or cities too; and whether ODbL's share-alike
      (dr5hn) or CC BY's credit line (GeoNames) is acceptable. Tier 3's answer
      changes the size of everything below, and no third-party place data should
      be seeded before the licence answer exists.
- [ ] **3 · `bun run ops refdata`**, a generator in `scripts/ops/`, writing the
      CLDR-derived vocabularies in the model's shape — `COUNTRY` first, then
      `LOCALE`'s endonym and `names`. Same automation as the team, per AGENTS.md
      — not a one-off script. It is one generator because it is one corpus; a
      second script per vocabulary is how the tl→fil trap gets re-implemented
      three times and fixed once.
- [ ] **4 · A `country` vocabulary table and its seed**, alongside `province`.
      The seed not compiling is what proves the data and the column agree.
- [ ] **5 · A repo check that vocabulary `names` cover every released locale** —
      the equivalent of `messages.test.ts` for data rather than copy. There is no
      such check today, which is why `PROVINCE` sits at four locales unnoticed.
- [ ] **6 · Backfill `PROVINCE` to all released locales** once step 5 can see it.
- [ ] **7 · Retire `CITY_CODES` as an enum** — FK plus boundary validation, the
      shape `provinceCode` already uses — before any worldwide set is seeded.
- [ ] **8 · Stand up the public repo and its Worker** once step 2 says which
      sources are in. It holds the ETL, **the derived database** (without which
      ODbL is not satisfied), the oRPC contract, its own D1, and two licence
      statements: data ODbL, code MIT.
- [ ] **8b · The normaliser streams, from the first line written.** Every source
      read as a stream into NDJSON in R2, never `JSON.parse` of a whole file. It is
      the same code whether it runs in CI or in a Workflow, and retrofitting it
      later means rewriting the ETL rather than moving it.
- [ ] **9 · Subdivisions, merged and provenanced.** dr5hn for the eight it covers,
      GeoNames for `th`/`vi`/`id`, `native` for the endonym, English as the pivot.
      Each name records which source and licence it came from — that record is what
      an attribution line and any future licence audit are built from.
- [ ] **10 · Cities: the three layers.** Romanised name always, the city's own
      language from GeoNames, cross-language from Wikidata above 100k. A table with
      a foreign key, never a vocabulary and never an enum.
- [ ] **11 · The cascading picker**, published as a shadcn registry item — country,
      then subdivision, then city, each query filtered by the one above and hitting
      an index. A check that no city query can run unfiltered, because the
      unfiltered one is a 152,970-row scan that D1 bills for and, on the free plan,
      refuses.
- [ ] **12 · Bind it into remy-sport** — the oRPC client over a service binding, a
      city id plus a name snapshot on `venue`, and a local fallback so `bun run dev`
      and the full suite pass with the places service unreachable. That last part is
      the one that will be skipped under time pressure, and it is the one that
      decides whether every developer now starts two Workers to run one app.

## Where this plan stands

Every source is measured and every measurement is reproducible by
`bun run ops refdata score`. Steps 1 and 7 depend on nothing and are wrong in the
tree today.

The Product Owner's decision to publish this as its own Worker settles what was
previously the blocking question: **the licences stop being remy-sport's problem**,
because the derived database and its credits live in the public repo that serves
them. dr5hn's ODbL becomes a condition on *that* repo — carry the rows, and split
the data and code licences — rather than a reason not to use the best subdivision
data available.

What remains open is smaller: **how deep to go** (subdivisions at all, or just
countries and cities), and the twenty minutes of legal reading that the ODbL split
deserves before the repo is public.

Nothing here is implemented.

## Not in this plan

- **Boundaries or coordinates.** Natural Earth and Who's On First are the answers
  if a map ever needs drawing; nothing here needs geometry.
- **Geocoding an address.** A different problem with a different licence story.
- **Deriving a timezone from a city.** `event.timezone` is IANA and deliberately
  not derived from `city_code` — the comment on that column explains why, and a
  places system does not change it. *Rendering* a zone in the reader's language is
  a different thing and is in the corpus above: CLDR names all 445 zones in all
  thirteen locales, and the page currently shows the raw tag.

## Evidence

Measured 2026-09-09, Bun 1.4.0, macOS arm64, and **reproducible by anyone**:

```
bun run ops refdata score            every candidate
bun run ops refdata score cldr       one of them
```

[`scripts/ops/refdata.ts`](../scripts/ops/refdata.ts) holds the candidates, their
licences, the tag aliases each dataset needs (`tl`→`fil` for ICU, `zh`→`zh-CN`
for dr5hn) and what each download costs. It scores against `ALL_LOCALES` rather
than a list of its own, so the answer changes when a language is declared — a
dataset covering every locale today covers twelve of fourteen the day Arabic is
added, without anyone editing the scorer.

The one figure it does not take is CLDR's subdivision count, which is a constant
in the file: `cldr-subdivisions-full` is a build-time package we do not install,
and adding a dependency to re-derive a number that is 5,395-and-then-three would
be paying rent on a fact.
