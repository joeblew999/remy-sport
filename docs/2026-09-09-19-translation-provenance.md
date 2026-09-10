# Plan — say which of the twenty-seven languages a person has read

Status: open, 2026-09-10. Steps 1, 3 and 6 done in the Product Owner's repo —
the model now records how each locale was produced, what is known to be wrong
with two of them, and the four words eleven languages were missing. Steps 2, 5
and 7 are the mechanical parts and are not built.

Twenty-seven locales shipped on 2026-09-09. **Twenty-six of them were translated
by an agent** — the twenty-seventh is English, which everything else was
translated from. No native speaker has read any of them.

That is not an argument for pulling them — the Product Owner asked for a global
audience and got one, and a machine translation that is complete and consistent
beats an English fallback for a reader who has neither. It is an argument for the
repository knowing which is which, because right now it cannot tell you and
neither can anybody else.

## What the checks do and do not prove

The three that run today are real and they are all mechanical:

| Check | Proves | Cannot prove |
| --- | --- | --- |
| `every released locale carries every message` | 618/618 keys present and non-empty | that any of them is the right sentence |
| placeholder parity | `{count}` appears in the translation exactly as in English | that the sentence around it makes sense |
| `no language contains a character from a script it does not use` | no tofu, no stray script | that the words are idiomatic |

A locale can pass all three and still read like a machine. Two are already known
to, and they are known only because the agent that wrote them said so — which is
exactly the knowledge this plan wants to stop depending on memory for.

## The one measurable signal that exists — and what it actually says

The places-service plan turned up a number and handed it here, which is the
right home for it: **1,199 of 3,848 name cells in non-Latin-script locales are
byte-identical to their English value — 31%.** Verified independently before
being adopted.

The percentage on its own is alarming and misleading. Attributed:

| Cells | Where | Verdict |
| --- | --- | --- |
| 869 | `PROVINCE` (847) and `CITY` (22) | **Expected.** 77 provinces × 11 non-Latin locales. The release applier copies the romanised English for place names because nobody has transliterated them, and that decision is documented. |
| 235 | `LOCALE` | **Pre-existing.** The N×N `names` convention already stored the English name of a language in most locales. Not introduced by the translations, and what the places service retires. |
| 18 | `NOTIFICATION_CHANNEL` | **Correct.** `LINE`, `SMS`, `Push` are brand and technical terms that are identical on purpose. |
| **77** | `OBJECT_TYPE` (44), `EVENT_FORMAT` (12), `ACTION` (11), `POSITION` (10) | **The real residue.** |

### The table above was wrong twice, and the corrections matter

Recomputed from the model on 2026-09-10 rather than carried forward:

- **`OBJECT_TYPE` was missing from it entirely** — 44 cells, more than the other
  three together. The row said the residue was 33.
- **`ACTION.DEFINE_SESSION_SCHEDULE` is not visible.** It was this plan's
  headline example of a miss a reader meets. Nothing calls
  `label("actions", …)` anywhere in the application; the vocabulary is the
  permission model's, not the interface's.
- **`OBJECT_TYPE` is visible**, which is the reverse. `following.tsx` renders
  `label("objectTypes", …)` as an item's title fallback *and* its description,
  so a reader following a fixture was shown "Game" and "Organisation" in
  English in eleven languages.

Attributed properly, the residue is:

| Cells | Term | Verdict |
| --- | --- | --- |
| 44 | `OBJECT_TYPE` — EVENT, ORG, GAME, PLATFORM × 11 locales | **Missed, and on screen.** TEAM, PLAYER and MEETING are translated everywhere: a bulk pass covered three of seven rows and stopped. |
| 11 | `ACTION.DEFINE_SESSION_SCHEDULE` | Missed, and rendered nowhere. |
| 12 | `EVENT_FORMAT.3x3` | **Correct.** FIBA's name for the format worldwide. |
| 10 | `POSITION` PG/SG/SF/PF/C, in `ja` and `ko` only | **Correct.** Both use the English abbreviations. |

So the honest headline is not "31% of translations are suspect", and not
"eleven strings were missed". It is **four words were missing from eleven
languages in a list readers actually see**, and a rule would have caught them.

### `descriptions` are worse and matter less

The same test applied to the other translated field: **nine `descriptions` are
the English string in all twenty-four locales other than Thai and Japanese** —
seven `OBJECT_TYPE` rows, `ACTION.MANAGE_FIXTURES`, `ROLE.ORGANIZER`.

None of them is rendered. `describe()` is called for exactly two vocabularies,
`eventTypes` and `notificationTypes`, and neither appears in that nine. They are
model documentation that happens to live in a translatable field, so they are
debt rather than a defect, and this plan says so instead of quietly translating
216 cells nobody reads.

## Where a locale's fields actually live — checked against staging, 2026-09-10

Two things were verified against the deployed payload rather than assumed, and
both change what step 1 below has to decide.

**The 235 `LOCALE` cells are reader-visible after all.** The first version of
this section said they were not, on the strength of the language switcher, which
renders `endonym` — [`app-sidebar.tsx:63`](../src/web/components/app-sidebar.tsx#L63)
— so an Arabic reader gets `العربية`, `ไทย`, `日本語`. That much is true and it
is not the only consumer. Grepping for the rest found
[`name-translations.tsx:10`](../src/web/components/name-translations.tsx#L10),
which labels each translation input with `label("locales", locale)` — the N×N
matrix — so an Arabic-speaking editor is offered boxes headed `Thai`,
`Japanese`, `German`.

Checking one call site and generalising is how the row got written wrong.

The fix is not to translate 235 cells. The model's own note on `LOCALE` says
`names` "stays for prose that genuinely needs 'translated into Japanese' in a
sentence and **is not extended for new languages**", and that a picker naming
languages in their own is "simply correct". A field label naming a language is a
picker, not prose. `name-translations.tsx` should read `endonym` like the
switcher does, which removes the matrix from the interface entirely rather than
filling it in.

**`direction` and `endonym` never leave the compiled bundle.** The `locale`
table is `code, nameEn, names, status, sort` — no direction, no endonym — so the
API serves neither, and staging returns exactly that:

```json
{"code":"th","nameEn":"Thai","names":{"en":"Thai","ar":"Thai"},"status":"released","sort":1}
```

RTL works anyway, because `directionOf()` reads the generated
`src/domain/vocabularies.ts` at build time rather than the endpoint. But it means
**a field on the model is not a field the server can read.** Nothing server-side
can ask which way a locale runs — which the email work is about to want, since an
Arabic message needs `dir="rtl"` on markup no browser bundle produces.

## The two known weaknesses, written down before they are forgotten

- **`zh-HK` is not a peer of the others.** It shares Taiwan's writing system, so
  it was derived from `zh-TW` through a vocabulary substitution table (`網絡` for
  `網路`, `短片` for `影片`, `短訊` for `簡訊`, `熒幕` for `螢幕`, `日曆` for
  `行事曆`) rather than written. The main terms are right; a Hong Kong reader
  will still meet phrasing that reads as Taiwanese.
- **`ur` renders in Naskh, not Nastaliq.** Correct and readable. Nastaliq is what
  an Urdu reader expects, and it needs its own font family — `Noto Nastaliq
  Urdu`, which is a real download rather than a subset of what Arabic already
  pulled.

Neither is a defect in the sense the other checks mean. Both are things a reader
would notice and no test ever will.

## The decisions

| Question | Decision |
| --- | --- |
| Block release until reviewed? | **No.** That would undo what the Product Owner asked for, and the alternative for an unreviewed reader is English, which is worse. |
| Then what does this change? | **The model records how each locale was produced.** `provenance: "machine" \| "reviewed"` beside `status` and `direction`, which is where `endonym` and `direction` already live. |
| Why in the model and not a document? | Because a document goes stale and a model field is synced, typed and checkable. The same argument that put `direction` there. |
| A check on it? | **Yes, and a weak one on purpose**: every declared locale must *declare* a provenance. Not that it must be reviewed — that would be a gate this plan has just decided against. |
| Show it to readers? | **Not decided here.** Whether a reader is told "this translation is machine-made" is a product question for the Product Owner, not a modelling one. Recording it does not commit to displaying it. |
| How does review actually happen? | **Out of scope and said so.** Finding native speakers is not an engineering task and pretending otherwise would produce a plan that cannot be finished. |

## Steps

- [x] **1 · `provenance` on `LOCALE`,** in the Product Owner's repo, synced.
      **Model-only, like `direction`** — see the section above: the `locale`
      table has no column for either, so the field feeds the check in step 2 and
      the compiled bundle, and *not* the API. That is sufficient for everything
      this plan asks for. It stops being sufficient the moment somebody wants to
      show a reader the badge, which is the undecided question above and would
      need a column and a migration.
      **Done 2026-09-10** (`remy-sport-biz` 15881d1), with one change to what
      this plan proposed: **three values, not two.** English is `"source"`
      rather than `"machine"` — everything else was translated *from* it, and
      filing the original under the same label as its own output is a small lie
      that the field exists to stop. `"machine"` for the other twenty-six, Thai
      and Japanese included: they predate the bulk translation, but nothing here
      records a speaker having read them, and "probably fine" is not a
      provenance.
- [ ] **2 · A check that every declared locale declares one,** beside the
      endonym check in `tests/repo/messages.test.ts`. It fails closed the same
      way the script check does, so a twenty-eighth language cannot arrive
      without answering the question.
- [x] **3 · Record the two known weaknesses** as a `caveat` string on the row —
      `zh-HK` derived from `zh-TW`, `ur` set in Naskh — so they live next to the
      data rather than in a plan nobody re-reads.
      **Done 2026-09-10** in the same commit as step 1.
- [ ] **4 · Nastaliq for Urdu**, if and when Urdu matters: a `family` on the
      `ur` entry in `SCRIPTS`, the same one-line change every other font took.
      Measure it first — Nastaliq is a heavier face than Naskh and the number
      should be in front of whoever decides.
- [x] **5 · The identical-to-English rule.** Identical to the English value, in
      a locale whose script is not Latin, is a missed translation — with the
      exemptions declared rather than assumed, because place names and `LINE`
      are identical on purpose.
      **Done 2026-09-10** in `tests/repo/messages.test.ts`, and **proved by
      running it against the model as it was before step 6: exactly 55, the
      44 object-type cells and the 11 action cells, and nothing else.** The
      check rediscovers precisely what was wrong without being told.
      Three things make it small enough to keep:
      - **Which languages are non-Latin comes from the model**, not a list in
        the test: a language's `endonym` is written in its own script by
        definition, so a twenty-eighth language classifies itself.
      - **A string with no letters outside its `{placeholders}` is exempt
        automatically.** That is the whole class of `"{title}"` and
        `"{home} {homeScore} – {away} {awayScore}"` — 7 keys of 618 — without
        naming any of it.
      - **Everything else is named with its reason**, so disagreeing is deleting
        a line. Four vocabularies, six terms, two messages.
      `descriptions` are excluded, measured rather than assumed: nine are
      English in all twenty-four non-Thai/Japanese locales and none is
      rendered, so including them would add 117 failures for text no reader
      meets and make the list long enough to hide the next real one.
- [x] **6 · Fix what a reader actually meets.** Not "the eleven": the eleven
      were `ACTION.DEFINE_SESSION_SCHEDULE`, which nothing renders. The four
      that *are* rendered are `OBJECT_TYPE` EVENT, ORG, GAME and PLATFORM,
      English in eleven languages in the Following list.
      **Done 2026-09-10** (`remy-sport-biz` 47af7a5): 44 cells, names only,
      descriptions deliberately untouched and explained above.
- [ ] **7 · Take the N×N matrix out of the interface.** `name-translations.tsx`
      labels each translation box with `label("locales", …)`, which is the only
      thing in the app still reading the `names` matrix the model says is "not
      extended for new languages". Reading `endonym` instead — what the switcher
      already does, and what the model says a picker should do — removes 235
      cells from what a reader can see without translating any of them. Lift
      `endonymOf` out of `app-sidebar.tsx` into `lib/locale.tsx` beside
      `directionOf`, since both read the compiled model for the same reason.
- [ ] **8 · A place for a reviewer to leave a mark.** When a speaker does read
      one, `provenance` becomes `"reviewed"` in the same commit as their fixes,
      so the field means something rather than being aspirational.

## Not in this plan

- **Retranslating anything wholesale.** Four terms were known to be wrong and
  step 6 fixed them. The twenty-six languages are *unverified*, which is a
  different thing, and re-running the machine over them would not change it —
  it would produce the same words with the same provenance.
- **Translating the nine descriptions.** Measured, attributed, and left alone on
  purpose: nothing renders them. Writing 216 cells no reader meets would look
  like progress and buy nothing.
- **A translation management system.** Twenty-seven JSON files and a model
  column is the right size for this. Revisit at a hundred, or when somebody
  outside the repository needs to edit them.
- **Rewriting `zh-HK` from scratch.** Worth doing, not worth doing blind — a
  Hong Kong reader's list of what actually reads wrong is worth more than
  another pass by the thing that wrote it the first time.
