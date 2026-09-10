# Plan — `/api/reference` should send one language, not twenty-seven

Archive: completed (2026-09-10). 346KB and 27 name entries per row → 8.3KB and 2. Verified on the deployed origin rather than the build.

Current work: [project index](../README.md). Original evidence follows.
Status: **done 2026-09-09.** Measured before, built, measured after — the
numbers below are both sets.

Every reader downloads all twenty-seven languages in order to render one.

```
GET /api/reference   →  98 KB gzipped   (346 KB raw)
                        300 rows carrying 8,004 translated names
```

It grew with the language count because every vocabulary row carries a `names`
object with one entry per locale, and the endpoint returns the row.

> **Corrected before this plan was finished.** The first draft said 346 KB,
> which is the uncompressed JSON and not what anyone downloads — the response is
> served `content-encoding: gzip` and arrives as **98 KB**. Checked, not
> assumed. The correction makes the case *stronger*, not weaker: gzip is good at
> the repetition twenty-seven near-identical `names` objects create, so removing
> that repetition wins more on the wire than it does on disk.

## Why this is not the reference-data plan's job

[Reference data, starting with places](https://github.com/joeblew999/shadcn-places/blob/main/docs/2026-09-09-why-these-sources.md)
says it *"retires the language picker's worst number"*, and it does — but the
number it retires is the **cost of filling** the N×N matrix, not the cost of
shipping it. Generating names from CLDR makes the matrix free to author. It does
nothing about the wire, and if anything makes this worse: once names are
generated rather than hand-written, there is no longer any friction discouraging
a `names` object on every row of every vocabulary.

The two plans are complements. That one is about where the strings come from;
this one is about how many of them leave the server.

## The measurement

Taken 2026-09-09 against staging at twenty-seven locales, by trimming the real
payload to the requested locale plus its English fallback and re-encoding at the
same compression level:

| Payload | Raw | **On the wire (gzip)** | Ratio |
| --- | --- | --- | --- |
| Everything, as served today | 346 KB | **98 KB** | — |
| `en` alone | 48 KB | **8 KB** | **12× smaller** |
| `ar` + `en` fallback | 59 KB | **12 KB** | 8.5× |
| `th` + `en` fallback | 67 KB | **13 KB** | 7.8× |

Thai is the worst case — non-Latin scripts cost more per character in UTF-8, and
it carries a full second copy for the fallback — and it is still nearly eight
times smaller than what we send today.

The residue is not translations: it is `code`, `nameEn`, `sort`, foreign keys
and the rows themselves. **Trimming to one locale is nearly all of the available
win**, and going further would mean shrinking the row set, which is a different
question with different trade-offs.

## Why it matters beyond the number

- It is on the **critical path to a legible page**. `LocaleProvider` seeds names
  from the compiled vocabularies so the first paint is not database codes, then
  the endpoint wins once it arrives. Until it does, labels come from the bundle;
  after it does, the tree re-renders.
- It **scales with a decision we intend to keep making**. The Product Owner has
  asked for more languages twice in one day. Every one adds to a request every reader makes.
- It already **cost a deploy**. Not fatally, and not on its own — it is one of
  the reasons the browser tier's five-second assertion budget went marginal, and
  that is written up in [the browser tier's flakiness](2026-09-09-18-browser-tier-flakiness.md).

## The decisions

| Question | Decision |
| --- | --- |
| Filter where? | **In the procedure, server-side.** A client-side filter would still send the bytes, which is the entire problem. |
| How does the server know the locale? | **An input on `reference.list`.** The reader's locale is already a first-class value in the client (`lib/locale.tsx`); passing it is one field, and it keeps the endpoint honest about what it returns. |
| Fall back to what? | **English, plus the requested locale.** `pick()` already falls back to `FALLBACK`, so shipping only the requested locale would make an untranslated term render blank rather than in English. Two locales, not one. |
| What about the switcher? | The picker reads **endonyms from the bundle**, not from this endpoint — it already works this way, and this plan does not change it. Confirmed by reading `app-sidebar.tsx`: `endonymOf()` looks up `LOCALE`. |
| Cache key? | **The locale joins the query key.** `staleTime: Infinity` stays; switching language becomes a fetch of a different key rather than a refetch of the same one. |
| Do we shrink the row set too? | **No.** 48 KB of rows is a separate question with separate trade-offs, and bundling it here would make a measurable change unmeasurable. |

## Steps

- [x] **1 · A locale input on `reference.list`.** Optional, defaulting to the
      base locale so an unversioned caller keeps working. The procedure keeps
      its existing `infrastructure(...)` policy — this changes the shape of the
      answer, not who may ask.
- [x] **2 · Trim `names` and `descriptions` server-side** to the requested
      locale plus `FALLBACK`. One helper, applied where the rows are shaped.
- [x] **3 · The client passes its locale** and puts it in the query key.
      `LocaleProvider` already knows it — it is the only real caller.
- [x] **3a · Update the render stubs in the same commit.** Five specs stub this
      endpoint with an *undefined* input — `crash`, `home`, `i18n`, `geography`
      and `teams` in `tests/render/`. The moment the client sends a locale those
      stubs stop matching, the query never resolves, and the failure looks like a
      broken page rather than a stale test. Named here because whoever does step
      3 will otherwise meet it as a mystery.

      (This plan first said three specs and named the wrong set. Counted
      properly: five. A wrong list here costs more than no list.)
- [x] **4 · A check that holds the size.** A worker test that asserts the
      payload for one locale carries at most two entries per `names` object.
      Not a byte budget — a byte budget is a number that drifts and gets
      raised; the invariant is *"one locale plus its fallback"*, which is the
      thing that must stay true.
- [x] **5 · Re-measure and record it here,** the same way the first numbers
      were taken, so the next person sees the before and after rather than a
      claim.

## What it actually did

Measured the same way, after the change:

| Request | Raw | **On the wire (gzip)** | Against 98 KB before |
| --- | --- | --- | --- |
| no locale (English) | 44.8 KB | **8.3 KB** | **12× smaller** |
| `?locale=ar` | 56.0 KB | **11.8 KB** | 8.3× |
| `?locale=th` | 64.0 KB | **12.7 KB** | 7.7× |

Predicted 8 KB / 12 KB / 13 KB. Measured 8.3 / 11.8 / 12.7. The estimate held
because it was taken from the real payload rather than guessed at.

The invariant that matters is not the size: **the widest `names` object on any
of the 300 rows now carries 2 entries, where it carried 27.** That is what
`tests/worker/read.test.ts` asserts — "this locale plus English" — because a
byte budget is a number that drifts and then gets raised.

### Two things this turned up that the plan did not predict

- **`LOCALE_CODES` had been lying since the fourth language.** The model writes
  it as `LOCALE.map((t) => t.code) as unknown as ["th", "en", "ja"]` — the
  runtime value is the map and is correct, the *type* is the tuple beside it,
  and `as unknown as` stops the compiler seeing the difference. It surfaced only
  when this endpoint first took a locale as a typed input and `"ar"` was
  rejected as not being a locale. Three more tuples had drifted the same way
  with the meetings work: `OBJECT_TYPE_CODES`, `ACTION_CODES` and
  `NOTIFICATION_CATEGORY_CODES`, all missing their `MEETING` entries. A check in
  `tests/repo/conventions.test.ts` now holds all twenty-three.
- **Seeding the render stubs needed a helper, not an edit.** The locale is part
  of the query key, so a spec that *switches* language needs more than one key
  whatever it seeds. `referenceEntries()` seeds every locale at once, which
  keeps the call sites one line and means a twenty-eighth language does not
  quietly stop five specs matching.

## Not in this plan

- **Shrinking the row set.** 300 rows is 48 KB and mostly not translations.
- **Compression.** Already done — the response is served `content-encoding:
  gzip`. The figures above are the compressed ones.
- **Removing the compiled fallback.** The bundle's copy of the vocabularies is
  what stops the first paint rendering `CHIANG_MAI`, and it is small because it
  is per-locale already.
