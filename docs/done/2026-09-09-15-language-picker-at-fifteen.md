# Plan — the language picker, at ten to fifteen languages

Archive: completed (2026-09-09). All five steps built, and **twenty** locales
released — the fifteen this page planned plus five more the Product Owner asked
for afterwards ("all the common languages, so we have a global audience").
Current work is in the [documentation index](../README.md) — the reference-data
plan there retires this plan's N×N `names` matrix and is where places, countries
and language names go next.

## What shipped

Twenty released locales, at **946 strings each** (618 interface messages and 328
vocabulary terms):

| | Locales | Font cost |
| --- | --- | --- |
| Latin | en, es, pt, id, fr, tl, de, tr, it, pl, ms | none — `latin`/`latin-ext` are unconditional |
| CJK | ja, zh, ko | none — drawn by the reader's own system font |
| Thai | th | already self-hosted |
| Cyrillic | ru, uk | +? for `ru`; `uk` free, it reuses what `ru` paid for |
| Vietnamese | vi | `vietnamese` subset |
| Devanagari | hi | **+164KB**, the first new family since Thai |
| Arabic | ar | **+216KB**, and the layout work below |

`src/web/fonts` went 280KB → 784KB across the whole exercise. Every block added
carries a `unicode-range`, so a reader who renders none of a script downloads
none of its files: the repository grew, no page did. Checked with `ops fonts`
after each language rather than assumed.

**The two Tier 3 languages both shipped**, which this page did not expect:

- **Hindi** needed only a font, and the pipeline already refused an unmapped
  locale, so it was mechanical.
- **Arabic** needed the layout, and that is the one piece of real work here.
  `@shadcn/direction` (Base UI's `DirectionProvider`) plus `dir` on the document
  plus `side="right"` on the sidebar plus rotating five drill-in chevrons. CSS
  alone was not enough — Base UI decides which way a menu opens from its own
  context — and `dir` alone mirrored the text inside the sidebar while leaving
  the panel on the left. Verified in a browser, not inferred.

Two things this plan got wrong, corrected here rather than left standing:

Two things this plan got wrong, corrected here rather than left standing:

- **The cost per language was estimated at 618 and is 946.** The vocabulary — 284
  names and 44 descriptions, every action, role, position and province — is
  translated per locale too, and the estimate above simply missed it. Caught by
  `tests/worker/read.test.ts` on the first release, not by review.
- **"Zero bytes" was wrong for two of the eleven**, as the correction inside
  Tier 1 already records. Measured after release: `bun run ops fonts` reports
  **23 files, unchanged** — releasing a declared locale adds nothing, because
  the font work happens when a locale is *declared*, not when it is offered.

Two checks were added that this plan did not think to ask for, both after a real
defect rather than in anticipation:

- **A stray-script check.** `Mùa giải定 kỳ` shipped in Vietnamese — one CJK
  character mid-word, past a completeness check that counts keys and a
  placeholder check that reads `{braces}`. It renders as a tofu box for every
  Vietnamese reader, which is the exact failure the font pipeline exists to
  prevent, arriving through the copy instead.
- **The RTL blocker**, step 5. It did its job twice: it refused to let Arabic
  ship before the layout could take one, and then — once `@shadcn/direction` was
  installed — it said so and got out of the way. The check reads
  *"direction installed, right-to-left locales may be released"* now.

The stray-script check also earned its keep beyond the bug that prompted it: it
fired 826 times on Ukrainian, 831 on Hindi and 831 on Arabic, because a locale
absent from `WRITES_IN` is treated as Latin-only. That is deliberate — failing
closed means somebody answers "which scripts does this language use?" once per
language, rather than a new language being silently exempt.

## What is left, and what it now costs

Every remaining candidate got cheaper, because the two expensive pieces are
built. Named so the next person does not have to re-derive them:

| Language | Speakers | What it needs now |
| --- | --- | --- |
| Bengali | ~280M | a `bengali` entry in `SCRIPTS` and its Noto subset — mechanical, exactly as Hindi was |
| Urdu | ~230M | **nothing new**: Arabic script and RTL are both built. Naskh renders it; Nastaliq would be a quality choice, not a blocker |
| Persian | ~130M | **nothing new**, same reason |
| Swahili, Dutch | — | Latin, free |

**A caveat worth writing down.** All twenty locales were translated by the agent
that shipped them, not by native speakers. The checks prove *completeness*,
*placeholder parity* and *script correctness* — they cannot prove that the copy
reads naturally. A native pass is worth doing before any marketing push, and
Hindi, Arabic and Bengali are where it matters most.

Everything below this line is the plan as proposed, left as written.

---

The Product Owner: many more languages are coming, ten to fifteen, and the
picker has to be thought about first.

## What already scales, and should not be touched

Worth saying before proposing anything, because three of the hard parts are
already built and a plan that "adds" them would be rewriting working code.

- **Fonts.** `scripts/ops/fonts.ts` maps each locale to the Google subsets its
  script needs, self-hosts Latin and Thai, and deliberately does not self-host
  CJK because Noto Sans JP alone is 366 `@font-face` blocks. It already knows
  `vi`, `ru`, `el`, `ko` and `zh`, and it **refuses a locale it has no mapping
  for**, with the reason: *"a declared locale with no font renders as empty
  boxes, and nothing else would have told you."* That is the guard a fifteenth
  language needs, and it exists.
- **Released versus declared.** `ALL_LOCALES` is everything the model declares;
  `LOCALES` is what has shipped, from `status: "released"`. A language can be
  added, translated and checked before any reader sees it.
- **Completeness.** `tests/repo/messages.test.ts` holds *"every released locale
  carries every message"*. At fifteen locales and ~570 keys that is ~8,500
  strings, and the check means a half-translated language cannot be released —
  which is the right default and is why the draft status above matters.

## What does not scale

**1. The control shows `code.toUpperCase()`.**
`app-sidebar.tsx` renders a `ToggleGroup` of two-letter codes: `TH EN JA`. At
fifteen that is fifteen buttons in a sidebar row, wrapping onto four lines, and
the codes stop being legible as a set — `PT` beside `PL`, `SV` beside `SL`, `FA`
beside `FI`. A reader looking for their language scans for its *name*, and the
name is not shown at all.

**2. Language names are an N×N matrix.**
`LOCALE` in the model carries `names` in every locale: `{"th":"ไทย","en":"Thai","ja":"タイ語"}`.
Three languages is nine strings. **Fifteen is two hundred and twenty-five**, and
every language added edits all fourteen existing entries. It is also the wrong
convention: a picker names languages in **their own** language, so that somebody
who cannot read the current interface can still find theirs. Nobody looking for
Japanese scans for "ญี่ปุ่น".

**3. Nothing says which languages read right-to-left.**
`components.json` records `"rtl": false` and no declared locale needs otherwise.
Arabic, Hebrew, Farsi or Urdu in the next ten would change that, and it is not a
picker problem — it is a whole-layout problem that has to be known about before
the language is offered rather than after.

## The decisions

| Question | Decision |
| --- | --- |
| Which control? | **The registry's `Select`.** One new item — it is not installed. |
| Why not `NativeSelect`, which is installed? | Its options are drawn by the operating system, so our font tail cannot reach them and an endonym in a script the OS picks a face for is exactly where tofu appears. It also cannot show the language's own name beside anything else. |
| Why not `Combobox`, which is installed and searchable? | Search earns its place at fifty options, not fifteen. It is the right answer for people, where the reader may not know the name; a reader always knows their own language. |
| How are languages named? | **Endonyms** — `ไทย`, `日本語`, `Deutsch`, `العربية`. One string per language, added once, never revisited. |
| What happens to the N×N `names`? | It stays for prose that genuinely needs "translated into Japanese" in a sentence, and **is not extended** for new languages. The picker stops reading it. |
| Order? | The model's declared order, which is the Product Owner's. Not most-recently-used: a list that moves under the reader is worse at fifteen than at three. |
| Right-to-left? | Out of scope here and **named as a blocker**: no RTL language may be released until `direction` (a registry item) is installed and the layout is checked. |

## The shape

```
Settings
  Theme      [ ☀ System ]
  Language   [ ไทย                    ▾ ]     ← the current one, in its own name
             ┌──────────────────────────┐
             │ ✓ ไทย            Thai    │      ← endonym, then the name in the
             │   English                │        reader's language where it adds
             │   日本語          Japanese│        something; endonym alone otherwise
             │   Deutsch                │
             │   العربية                 │
             └──────────────────────────┘
```

One row, one control, at three languages or at fifteen. The trigger shows the
current language in its own name, which is also the answer to *"what is this
app set to"* for somebody who cannot read the rest of the sidebar.

## Steps

- [x] **1 · `bun run ops ui add select`.** One registry item. The `ToggleGroup`
      goes; it is the right control for two or three mutually exclusive options
      and the wrong one for fifteen.
      *Done — `src/web/components/ui/select.tsx`.*
- [x] **2 · `endonym` on the model's `LOCALE`,** in the biz repo, synced. Three
      values to start — `ไทย`, `English`, `日本語` — and a repo check that every
      declared locale has one, so a language cannot be added without its own
      name.
      *Done — thirteen endonyms; `tests/repo/messages.test.ts` refuses a locale
      without one.*
- [x] **3 · The picker reads the endonym,** keeps `data-testid="lang-<code>"` so
      the existing specs and the screenshot walk keep working, and keeps the
      current `setLocale` path untouched.
      *Done — and the testids alone were not enough: five specs pressed
      `lang-th` directly, which only worked while the buttons were always
      visible. `switchLanguage()` in `tests/helpers/surfaces.ts` is the seam.*
- [x] **4 · A check that the picker survives the count.**
      *Done — `tests/render/language-picker.spec.ts`. Checked by hand in the
      browser at thirteen: all thirteen options listed, each in its own script,
      trigger showing the current endonym, no console errors.*
- [x] **5 · Write the RTL blocker down** in the model beside `status`, so that
      adding `ar` without `direction` fails a check rather than shipping a
      mirrored-looking page.
      *Done — `direction` on every `LOCALE` row, and a check that refuses to
      release an `rtl` locale until `@shadcn/direction` is installed. Proof:
      flipping one row to `"rtl"` fails that check and nothing else.*

## Not in this plan

- **Which fifteen languages.** That is the Product Owner's list, and the font
  mapping in `ops fonts` is where each one is admitted.
- **Translating anything.** The completeness check already refuses a released
  locale with gaps; the work of filling them is per-language.
- **Locale detection.** `strategy: ["localStorage", "cookie", "preferredLanguage", "baseLocale"]`
  already prefers the browser's own list before falling back, and fifteen
  languages makes that better, not worse.

## The fifteen, picked 2026-09-09

The Product Owner asked me to choose, by what is most spoken in the world. I
have, and one correction is owed first: **pure speaker count is not quite the
right criterion for this product**, and pretending otherwise would be picking
badly on purpose. A Thai youth basketball platform has a second axis — where it
is used and who plays the sport — and a third that decides what a language
actually costs to ship: its script.

So the list below is the world's most-spoken, adjusted at the edges for a
product in Thailand, and ordered by what I would ship first.

### Tier 1 — free, and the whole point (ship first)

`latin` and `latin-ext` are downloaded unconditionally, so a Latin-script
language adds **zero bytes**. CJK is drawn by the reader's own system font, so
it adds zero too. All eight already have a script mapping or need none.

> **Correction, 2026-09-09.** I claimed all eleven of Tiers 1 and 2 were free
> and then measured it: declaring them took `src/web/fonts` from 280KB to 404KB.
> Eight are free as described. **Russian** pulls `cyrillic` and `cyrillic-ext`,
> and **Vietnamese** pulls `vietnamese` — 18 new `@font-face` blocks, +124KB in
> the repository.
>
> What is still true, and is the part that matters: every one of those blocks
> carries a `unicode-range`, so a reader who never renders a Cyrillic or
> Vietnamese character **downloads none of them**. The repository grew; nobody's
> page did. Checked, not assumed: 18 new blocks, 18 `unicode-range` declarations.

| | Language | Endonym | Why |
| --- | --- | --- | --- |
| 1 | English | English | base locale |
| 2 | Thai | ไทย | home |
| 3 | Japanese | 日本語 | shipped |
| 4 | Chinese (Simplified) | 简体中文 | most speakers on earth; system font, no download |
| 5 | Spanish | Español | second by total speakers; a basketball language |
| 6 | Portuguese | Português | top ten, and Brazil is a basketball nation |
| 7 | Indonesian | Bahasa Indonesia | ~200M, next door, trivially cheap |
| 8 | French | Français | global, free |

### Tier 2 — free, and closer to home than the raw numbers suggest

| | Language | Endonym | Why |
| --- | --- | --- | --- |
| 9 | Filipino | Filipino | outside the global top ten and **in** for this product: the Philippines is among the most basketball-obsessed countries on earth |
| 10 | Vietnamese | Tiếng Việt | regional; `vi` is already mapped to the vietnamese subset |
| 11 | Korean | 한국어 | regional, basketball-strong, system font |
| 12 | German | Deutsch | free, and European basketball |
| 13 | Russian | Русский | top ten; `ru` already mapped to cyrillic |

### Tier 3 — genuinely top-five by speakers, and genuinely expensive

These two are in any honest world list and neither is free. They go last, each
behind its own piece of work.

| | Language | Endonym | Cost |
| --- | --- | --- | --- |
| 14 | Hindi | हिन्दी | a new script. Needs a `devanagari` entry in `SCRIPTS` and a self-hosted Noto Sans Devanagari subset — the first new font family since Thai. |
| 15 | Arabic | العربية | **right-to-left.** Not a font problem, a layout problem: every sidebar, drawer, breadcrumb and chevron in the app assumes a direction. Blocked on installing the registry's `direction` item and checking the layout, which is step 5 above. |

### What I left out, and why

- **Bengali (~270M) and Urdu (~230M)** outrank German by speakers. Both need a
  new script — Bengali its own, Urdu the Arabic one plus RTL — so they carry
  Tier 3 cost for less product relevance than the Tier 2 entries they would
  displace. Add them when a reader asks, not to win an argument about counts.
- **Marathi, Telugu, Tamil, Nigerian Pidgin** appear in top-fifteen lists and
  are not plausible for this product this year.
- **Lao, Khmer, Burmese** are neighbours and each needs its own font. Worth more
  than Hindi to this product; worth revisiting the moment the platform crosses a
  border.

### Sequencing

1. The picker itself (steps 1–4 above). Needed at eight languages, never mind
   fifteen, and independent of which ones.
2. Tier 1 and Tier 2 together: eleven Latin/CJK/Cyrillic languages, no new font
   bytes, each released only when its messages are complete.
3. Hindi, behind its font.
4. Arabic, behind RTL — which is the largest single piece of work on this page
   and should not be started by accident.
