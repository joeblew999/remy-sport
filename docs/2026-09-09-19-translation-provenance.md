# Plan — say which of the twenty-seven languages a person has read

Status: proposed 2026-09-09. Nothing implemented.

Twenty-seven locales shipped on 2026-09-09. **All twenty-seven were translated by
an agent.** No native speaker has read any of them.

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
| **33** | `EVENT_FORMAT` (12), `ACTION` (11), `POSITION` (10) | **The real residue.** |

And of those 33, `EVENT_FORMAT` is `3x3` and `POSITION` is `PG`/`SG`/`SF` —
abbreviations that are arguably right untranslated. What is left is
approximately **eleven genuinely missed strings**, and they are visible:
`ACTION.DEFINE_SESSION_SCHEDULE` reads "Define session schedule" in Korean,
Russian, Chinese, Ukrainian, Hindi, Arabic, Bengali and Traditional Chinese —
a key the release applier had no entry for, so it fell through to English.

So the honest headline is not "31% of translations are suspect". It is **eleven
strings were missed, and a rule would have caught them**. That is worth having,
and it is the check this plan should build.

## Where a locale's fields actually live — checked against staging, 2026-09-10

Two things were verified against the deployed payload rather than assumed, and
both change what step 1 below has to decide.

**The 235 `LOCALE` cells are not reader-visible.** Arabic's name for Thai really
is the string `Thai`, but nobody sees it: the language switcher renders
`endonym` — [`app-sidebar.tsx:63`](../src/web/components/app-sidebar.tsx#L63) —
so an Arabic reader gets `العربية`, `ไทย`, `日本語`. The English cells sit in
`names`, which the switcher never asks for. That lowers the urgency and does not
remove the row from the count: anything calling `label("locales", code)` would
show them.

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

- [ ] **1 · `provenance` on `LOCALE`,** in the Product Owner's repo, synced.
      `"machine"` for all twenty-seven today — which is the honest starting
      state and the whole point. **Model-only, like `direction`** — see the
      section above: the `locale` table has no column for either, so the field
      will feed the check in step 2 and the compiled bundle, and *not* the API.
      That is sufficient for everything this plan asks for. It stops being
      sufficient the moment somebody wants to show a reader the badge, which is
      the undecided question below and would need a column and a migration.
- [ ] **2 · A check that every declared locale declares one,** beside the
      endonym check in `tests/repo/messages.test.ts`. It fails closed the same
      way the script check does, so a twenty-eighth language cannot arrive
      without answering the question.
- [ ] **3 · Record the two known weaknesses** as a `caveat` string on the row —
      `zh-HK` derived from `zh-TW`, `ur` set in Naskh — so they live next to the
      data rather than in a plan nobody re-reads.
- [ ] **4 · Nastaliq for Urdu**, if and when Urdu matters: a `family` on the
      `ur` entry in `SCRIPTS`, the same one-line change every other font took.
      Measure it first — Nastaliq is a heavier face than Naskh and the number
      should be in front of whoever decides.
- [ ] **5 · The identical-to-English rule.** Identical to the English value, in
      a locale whose script is not Latin, is a missed translation — with the
      exemptions above declared rather than assumed, because place names and
      `LINE` are identical on purpose. It would have caught the eleven above,
      and it is the only mechanical signal of copy quality available.
- [ ] **6 · Fix the eleven.** `ACTION.DEFINE_SESSION_SCHEDULE` first; the rule
      from step 5 lists the rest.
- [ ] **7 · A place for a reviewer to leave a mark.** When a speaker does read
      one, `provenance` becomes `"reviewed"` in the same commit as their fixes,
      so the field means something rather than being aspirational.

## Not in this plan

- **Retranslating anything wholesale.** Eleven strings are known to be wrong and
  step 6 fixes those. The other twenty-seven languages are *unverified*, which is
  a different thing, and re-running the machine over them would not change it.
- **A translation management system.** Twenty-seven JSON files and a model
  column is the right size for this. Revisit at a hundred, or when somebody
  outside the repository needs to edit them.
- **Rewriting `zh-HK` from scratch.** Worth doing, not worth doing blind — a
  Hong Kong reader's list of what actually reads wrong is worth more than
  another pass by the thing that wrote it the first time.
