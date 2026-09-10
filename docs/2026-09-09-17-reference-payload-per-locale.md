# Plan — `/api/reference` should send one language, not twenty-seven

Status: proposed 2026-09-09. Measured, not estimated; nothing implemented.

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

[Reference data, starting with places](2026-09-09-16-pretranslated-reference-data.md)
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

- [ ] **1 · A locale input on `reference.list`.** Optional, defaulting to the
      base locale so an unversioned caller keeps working. The procedure keeps
      its existing `infrastructure(...)` policy — this changes the shape of the
      answer, not who may ask.
- [ ] **2 · Trim `names` and `descriptions` server-side** to the requested
      locale plus `FALLBACK`. One helper, applied where the rows are shaped.
- [ ] **3 · The client passes its locale** and puts it in the query key.
      `LocaleProvider` already knows it.
- [ ] **4 · A check that holds the size.** A worker test that asserts the
      payload for one locale carries at most two entries per `names` object.
      Not a byte budget — a byte budget is a number that drifts and gets
      raised; the invariant is *"one locale plus its fallback"*, which is the
      thing that must stay true.
- [ ] **5 · Re-measure and record it here,** the same way the 346 KB above was
      taken, so the next person sees the before and after rather than a claim.

## Not in this plan

- **Shrinking the row set.** 300 rows is 48 KB and mostly not translations.
- **Compression.** Already done — the response is served `content-encoding:
  gzip`. The figures above are the compressed ones.
- **Removing the compiled fallback.** The bundle's copy of the vocabularies is
  what stops the first paint rendering `CHIANG_MAI`, and it is small because it
  is per-locale already.
