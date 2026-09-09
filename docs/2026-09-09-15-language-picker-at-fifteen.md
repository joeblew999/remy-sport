# Plan — the language picker, at ten to fifteen languages

Status: proposed 2026-09-09. Decisions taken; nothing implemented.

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

- [ ] **1 · `bun run ops ui add select`.** One registry item. The `ToggleGroup`
      goes; it is the right control for two or three mutually exclusive options
      and the wrong one for fifteen.
- [ ] **2 · `endonym` on the model's `LOCALE`,** in the biz repo, synced. Three
      values to start — `ไทย`, `English`, `日本語` — and a repo check that every
      declared locale has one, so a language cannot be added without its own
      name.
- [ ] **3 · The picker reads the endonym,** keeps `data-testid="lang-<code>"` so
      the existing specs and the screenshot walk keep working, and keeps the
      current `setLocale` path untouched.
- [ ] **4 · A check that the picker survives the count.** A rendering spec at
      fifteen declared locales — stubbed, not shipped — that the sidebar row
      does not overflow and every option is reachable. This is the one that
      would have caught the problem before the languages arrived.
- [ ] **5 · Write the RTL blocker down** in the model beside `status`, so that
      adding `ar` without `direction` fails a check rather than shipping a
      mirrored-looking page.

## Not in this plan

- **Which fifteen languages.** That is the Product Owner's list, and the font
  mapping in `ops fonts` is where each one is admitted.
- **Translating anything.** The completeness check already refuses a released
  locale with gaps; the work of filling them is per-language.
- **Locale detection.** `strategy: ["localStorage", "cookie", "preferredLanguage", "baseLocale"]`
  already prefers the browser's own list before falling back, and fifteen
  languages makes that better, not worse.
