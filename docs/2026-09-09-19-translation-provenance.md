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
      state and the whole point.
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
- [ ] **5 · A place for a reviewer to leave a mark.** When a speaker does read
      one, `provenance` becomes `"reviewed"` in the same commit as their fixes,
      so the field means something rather than being aspirational.

## Not in this plan

- **Retranslating anything.** Nothing here is known to be wrong; it is known to
  be unverified, and those are different.
- **A translation management system.** Twenty-seven JSON files and a model
  column is the right size for this. Revisit at a hundred, or when somebody
  outside the repository needs to edit them.
- **Rewriting `zh-HK` from scratch.** Worth doing, not worth doing blind — a
  Hong Kong reader's list of what actually reads wrong is worth more than
  another pass by the thing that wrote it the first time.
