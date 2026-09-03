# Plan — one definition, or none

Kept, not deleted. The exception lists this plan builds are judgement calls —
"these two spellings of the same set are both correct" is a decision somebody
will want the reason for, and the reason belongs beside the list.

**Work it in a loop, and inspect yourself on every pass.** The plan is wrong
until proven otherwise. Eight of the numbers below were wrong when first written
and were corrected by running the block that checks them, before any work
started. Three more were assertions that a two-minute check disproved outright,
and they are recorded in the log rather than quietly dropped.

Each pass, in this order:

1. **Re-derive the facts.** The block in *Deriving the facts* below. If an
   asserted number differs from what this file says, **fix the file first**,
   note it in the log, then continue. A plan that disagrees with the code is
   worse than no plan.
2. **`mise run 2-check` before starting, not only after.** Another session has
   been committing to this tree throughout the writing of this plan — three
   commits and three open files while the numbers were being measured. A red
   gate you did not cause is worth knowing about before you attribute it to your
   own change.
3. **Do the next unticked box**, applying the decision rules rather than asking.
4. **`mise run 2-check`.** Green before ticking anything.
5. **Tick it, or write why not.** A box left unticked without a reason beside it
   is the failure this whole plan exists to correct.
6. **Append to the log** — what was done, what was found, what changed in the
   plan itself.

Never end a pass having neither ticked a box nor recorded why one cannot be
ticked. That is the only definition of progress here.

When every box is ticked, or every remaining one is marked **Needs the PO** with
its reason, say so plainly and stop.

## The problem, in one line

The code is not copy-pasted — 230 duplicated lines in 49,000, under one percent.
What is duplicated is the **lists**: the same set of things written out by hand
in several places, and one of them has already drifted far enough to break a
live endpoint.

## Who it hurts

Somebody is invited to co-organise an event. The invitation is PENDING until
they accept it, and the app has no word for either state in any language,
because `/api/reference` — the endpoint whose entire job is to hand the browser
the Product Owner's own labels — does not publish invite statuses.

Not because nobody seeded them. The rows are there, and the handler reads them:
`src/api/reference.ts` queries all 23 vocabulary tables on every call. Then the
response contract drops the twenty-third on the floor, because
`VOCABULARY_SCHEMAS` in `src/db/vocabularies-schema.ts` lists 22 of the 23 that
`VOCABULARY_TABLES` lists, four lines further down the same file. Proven, not
inferred: parsing the full 23-key payload through `ReferenceSchema` returns 22
keys, and `inviteStatuses` is not among them.

That endpoint's own docstring says it serves "every vocabulary the Product Owner
defines, with no list of them here". There are three lists of them, all by hand,
one file away.

## Why it happens

**A set is data, and this codebase keeps writing it down as syntax.**

Everywhere a set has one member-per-line, somebody has to add a line per member
in each place the set appears. Nothing checks that the places agree, so they
agree only for as long as everyone remembers all of them.

The 23 vocabularies are enumerated four times: `VOCABULARY_TABLES`,
`VOCABULARY_ORDER` and `VOCABULARY_SCHEMAS` in `src/db/vocabularies-schema.ts`,
and `VOCABULARY` in `src/domain/vocabularies.ts`. Three carry 23 entries. One
carries 22.

The six platform roles are written out in full in **seven files**, in three
different spellings — `ADMIN` in the model, `admin` in the database, `"admin"` in
a component's array. `STORED_ROLE` maps the first to the second by hand, and the
declaration immediately above it, `STORED_ORG_ROLE`, derives exactly the same
mapping from the model with `Object.fromEntries`. The pattern for the fix is on
the adjacent line.

## What that shape costs elsewhere

Three things, all of them already visible and none of them hypothetical:

- **The same drift, one file over, waiting.** `FIXTURE_TABLES` has 17 entries;
  `FIXTURE_SCHEMAS` has 15. `games` and `gameReferees` are tables with no
  response schema. Whether that is deliberate cannot be answered by reading it —
  which is the actual defect, because the vocabulary one was not deliberate and
  looked identical.
- **The model gets a second, worse copy.** `src/web/components/follow.tsx`
  hand-writes `type ObjectTypeCode = "EVENT" | "TEAM" | "GAME" | "PLAYER" |
  "ORG"`, which is `OBJECT_TYPE_CODES` from the model with the derivation thrown
  away. AGENTS.md records two of these already — a role string compared in a
  handler, and a push audience resolved from the wrong table — and calls it "a
  third spelling of a code that lives in the PO's vocabulary".
- **A concept gets two incompatible types.** `Names` is declared three times.
  `src/domain/names.ts` says `Partial<Record<Locale, string>>`;
  `src/web/lib/localizer.ts` says `Record<string, string>` — **not** partial, and
  keys unconstrained. So the SPA's type claims every locale is present on every
  name, which is the one thing `NamesSchema` in `src/domain/api.ts` exists to
  say is false.

## The architecture

### The invariant

> **A set is written once. Everything that needs one entry per member derives
> from it, and a member added upstream reaches every derived form with nothing
> edited.**

Both halves matter. Writing it once is not enough if the derived forms are
themselves hand-maintained maps keyed by the same names — that is what
`VOCABULARY_SCHEMAS` is, and it is the one that drifted.

### Why the obvious fix was rejected once already, correctly

`VOCABULARY_SCHEMAS` carries a docstring explaining why it is written out:

> Emitted rather than built with Object.fromEntries at runtime, because that
> erases the key literals and the API would lose its field types — the one thing
> this whole arrangement exists to keep.

**That reasoning is right and must be preserved.** A plain `Object.fromEntries`
widens the result to `Record<string, ZodType>`, and the reference endpoint stops
being typed — which is worse than the bug being fixed. Any change here that
makes the OpenAPI document or the `RouterClient` less specific is a regression,
not a consolidation, and the box is to be left unticked with that written beside
it.

What the docstring does *not* establish is that a hand-written literal is the
only alternative. A mapped type over `VOCABULARY_TABLES` keeps every key literal
and every value type, because the key set and the value types are both derivable
from the table map:

```ts
type VocabSchemas = { [K in keyof typeof VOCABULARY_TABLES]: z.ZodArray<...> }
```

Whether TypeScript resolves that to the same inferred shape the literal produces
today is a **question to settle by trying it and reading the generated OpenAPI
document**, not by asserting it here. If it does not, the fallback is a
type-level exhaustiveness assertion beside the literal — the literal stays, and
a missing key becomes a compile error rather than a silent 22.

### Options considered

Three, one of them a deletion.

| | what it does | costs | verdict |
|---|---|---|---|
| **Derive each map from the one above it** | `VOCABULARY_SCHEMAS` and `_ORDER` become mapped types over `VOCABULARY_TABLES`; `STORED_ROLE` becomes `Object.fromEntries(ROLE.map(…))` like its neighbour | the inference has to be proven to hold, per the section above; a mapped type is harder to read than a list | **yes, where the types survive it** |
| **Delete the second list and let it 404** | drop `inviteStatuses` from `VOCABULARY_TABLES` too, so the three agree at 22 | honest and one line — but it deletes a vocabulary the model defines and the browser will need the moment invitations render a status | **no** — this is the deletion option, and it loses a feature to tidy a list |
| **A check that fails when two maps of the same set disagree** | leaves every literal in place; adds `scripts/check/sets.ts` <!-- docs-check-ignore --> to the gate | the duplication stays, so the cost of adding a vocabulary stays; a check is weaker than a type | **yes, as the backstop** — for the pairs whose types cannot be made to derive |

**What is being accepted by choosing the first two together:** two mechanisms
rather than one. Some sets will derive and some will only be checked, and a
reader has to look to know which. That is the price of not weakening the
contract, and it is written here so the next person does not "tidy" the checked
ones into derived ones without re-reading the paragraph above.

## What this plan must not build

The first output is what not to do, and most of this plan is a refusal.

- **Do not merge files, and do not treat 229 as the problem.** The file count is
  the architecture working. 51 of 108 modules in `src/` have exactly one
  importer, and that is one page per route, one API module per router group, one
  check per rule — measured, and every one of them correct. There is no box in
  this plan that moves a file for being small.
- **Do not add an abstraction over the oRPC procedures.** `route` / `input` /
  `output` / `use` / `handler` reads as boilerplate and is not: it is the
  contract, the OpenAPI document and the authorisation declaration. A helper
  that collapsed it would hide the thing `mise run 2-check`'s authz step reads.
- **Do not write a generator.** `src/db/vocabularies-schema.ts` opens with
  "AUTHORED. Not generated — this is the root of the chain", and records that a
  generator was deleted on 2026-08-27 after every silent failure of that day
  turned out to live inside it. Deriving one map from another *inside one file*
  is not that; a script that writes the file is.
- **Do not touch `src/domain/model/`.** It arrives verbatim through
  `mise run ops domain`. `src/domain/model/names.ts` declaring its own `Names` is
  the PO's business, and it is why the target count for `Names` is two, not one.
- **Do not chase the 0.8%.** Verbatim duplication is 230 lines in 28,383. The
  seven identical lines shared by `authed` and `viewer` in `src/api/base.ts` are
  in scope because they are one edit; nothing else in that 230 earns a box on
  size alone.
- **Do not fix a test by deleting its subject.** `tests/worker/write.test.ts`
  splits the six roles into `WRITERS` and `READERS`. That is a partition with
  meaning, not a copy, and it stays.

## Scope: what belongs to the other two plans

Two plans are already open in this directory and both have unticked boxes. A
third plan that re-does their work is itself the duplication this one is about.

| finding | whose |
|---|---|
| hand-written render payloads, `tests/helpers/api-fixtures.ts` | [plan-seed-coverage.md](plan-seed-coverage.md) Phase 5 |
| ids in tests naming rows that do not exist | plan-seed-coverage Phase 6 |
| empty tables and empty columns | plan-seed-coverage Phases 2–3 |
| a screen deciding what the model owns | [plan-ownership.md](plan-ownership.md) Phase 2 |
| where a surface lives in the GUI | plan-ownership Phase 5 |
| **a set enumerated twice** | **here** |
| **a type declared twice** | **here** |
| **an export nothing imports** | **here** |

Where they overlap, they overlap on `FIXTURE_TABLES`: this plan cares that it
disagrees with `FIXTURE_SCHEMAS`, and plan-seed-coverage cares that
`eventSession` is in neither. Do the structural half here, leave the rows there,
and say so in both logs.

## Which repo each change belongs in

The rule is AGENTS.md's: could a person from the business disagree with it?

| change | repo |
|---|---|
| there are six platform roles, and these are they | biz |
| a co-organizer invitation can be PENDING | biz |
| the six roles are written out in seven files here | here |
| `VOCABULARY_SCHEMAS` is missing one of them | here |
| the SPA's `Names` is not `Partial` | here |

Nothing in this plan needs a commit in the companion repo. If a box appears to,
it has been misread — check whether the set is the model's or this repo's
restatement of it.

## Rules for this work

- **Every change is a deletion or a derivation.** If a box adds a concept, it is
  the wrong box. Sessions net-negative on lines, and this one especially.
- **A type must not get looser.** The reference endpoint, the OpenAPI document
  and `RouterClient` are the reason several of these literals exist. Read the
  generated document before and after any change to `src/domain/api.ts` or
  `src/db/vocabularies-schema.ts`; a change that widens a type to remove a line
  is refused.
- **One class per commit.** Not one file. The point is that these are classes,
  and a commit that fixes the six roles in seven files is legible in a way that
  seven commits are not.
- **Delete the check when the type makes it impossible.** If a mapped type makes
  a set undrictable, the `sets.ts` entry for it goes in the same commit. A check
  list that only grows is the suppressions file this repo has already paid off
  once.
- **`mise run 2-check` before committing**, not just `tsc`. The bundler has
  caught two things typecheck did not, both recorded in plan-ownership's log.
- **Never run two gates at once.** Recorded here because it cost this plan an
  hour: a second `mise run 2-check` while the first was still winding down
  collided on port 4173, and the render tier reported 140 failures that were
  entirely self-inflicted. Run it once and wait.

## Running unattended

### Decision rules, in priority order

Apply the first that matches.

1. **A drifted pair that breaks something → fix the drift, then make it
   underivable.** `inviteStatuses` is this. Fix the symptom in the same commit
   as the cause, or the next reader cannot tell which was which.
2. **A set the model already defines → derive from the model.** Never restate
   `OBJECT_TYPE_CODES`, `ROLE_CODES` or a vocabulary's members. The SPA may
   import `src/domain` at runtime — `.dependency-cruiser.cjs` allows exactly
   that — so "the browser cannot reach the model" is not a reason.
3. **A set this repo owns, derivable without weakening a type → derive it.**
4. **Derivable only by widening a type → do not.** Leave the literal, add it to
   the check, write the reason on the line.
5. **Two declarations of one type → keep the one nearest the model, import it
   from the other.** `Names` keeps `src/domain/names.ts`.
6. **An export nothing imports → delete it**, unless it is a test seam or a
   documented escape hatch, in which case say which on the line.
7. **Anything still undecidable** → do not guess and do not stop. Write it in
   the log under **Needs the PO**, skip the box, carry on.

### The bound, so this actually finishes

Every box traces to one of six enumerable classes. Nothing else is in scope, and
a finding that traces to none of them goes under **Noticed, out of scope** — one
line, no box, no work.

| class | the list | length today |
|---|---|---|
| 1 | maps of the same set that can disagree | 5 pairs |
| 2 | types declared more than once | 3 |
| 3 | column groups repeated per table | 1 (× 23 tables) |
| 4 | cache-invalidation decisions held at a call site | 38 in 16 files |
| 5 | exports nothing imports | 41 |
| 6 | verbatim blocks worth one edit | 1 |

Total: **89 items**, each either closed or declared. There is no class whose
size is discovered as it runs — every one of those numbers comes out of the
block below, and if one has grown, that is the first thing a pass records.

### What stops the loop

Only these:

- every box ticked, or
- every remaining box marked **Needs the PO** or **type would widen**, with its
  reason — and if more than three end up there, that is evidence this plan was
  written wrong rather than that the work is done. Say so, do not present it as
  finished, or
- `mise run 2-check` cannot be made green and the cause is outside this plan's
  scope — recorded, then stop.

Not a class boundary. Not the size of the next box.

## Deriving the facts

Run this first, every pass. It asserts every number this file states.

```sh
python3 - <<'EOF'
import os, re, sys, hashlib, collections
bad = 0
def p(label, n, says):
    global bad
    if n != says: bad += 1
    print(f"  {label:<48}{str(n):>5}   (plan says {says}){'' if n == says else '   <-- DIFFERS'}")
def files(*roots):
    for root in roots:
        for d, dirs, fs in os.walk(root):
            dirs[:] = [x for x in dirs if x not in ("node_modules","paraglide","migrations")]
            for f in sorted(fs):
                if f.endswith((".ts",".tsx")) and not f.endswith(".d.ts"): yield os.path.join(d,f)
allf = list(files("src","scripts","tests"))
rd = lambda f: open(f, encoding="utf8").read()

print("\n  SIZE — context, not a target\n")
p("TS/TSX files in src+scripts+tests", len(allf), 229)
print(f"  lines in them (printed: another session moves this)   {sum(len(rd(f).split(chr(10))) for f in allf)}")

def norm(path):
    return [s for s in (l.strip() for l in open(path, encoding="utf8"))
            if s and not s.startswith(("//","/*","*","*/"))]
W, blocks, total = 8, collections.defaultdict(list), 0
for f in allf:
    ls = norm(f); total += len(ls)
    for i in range(len(ls)-W+1):
        blocks[hashlib.md5("\n".join(ls[i:i+W]).encode()).hexdigest()].append((f,i))
dupl = set()
for v in blocks.values():
    if len(v) > 1:
        for f,i in v: dupl.update((f,j) for j in range(i,i+W))
print("\n  CLASS 0 — verbatim duplication. Measured so it is not assumed.\n")
p(f"duplicated lines at window {W}", len(dupl), 230)
p("  of non-blank non-comment lines", total, 28383)
p("  files carrying any of it", len({f for f,_ in dupl}), 14)

def keys(path, name):
    m = re.search(r'export const '+name+r'(?::[^=]+)? = \{(.*?)\n\} as const', rd(path), re.S)
    return re.findall(r'^\s{2}["\']?(\w+)["\']?\s*:', m.group(1), re.M) if m else []
V, F = "src/db/vocabularies-schema.ts", "src/db/fixtures-schema.ts"
vt, vs, vo = keys(V,"VOCABULARY_TABLES"), keys(V,"VOCABULARY_SCHEMAS"), keys(V,"VOCABULARY_ORDER")
vv = keys("src/domain/vocabularies.ts","VOCABULARY")
ft, fsc = keys(F,"FIXTURE_TABLES"), keys(F,"FIXTURE_SCHEMAS")
print("\n  CLASS 1 — one set, written out by hand in several places\n")
p("VOCABULARY_TABLES entries", len(vt), 23)
p("VOCABULARY_ORDER entries", len(vo), 23)
p("VOCABULARY (domain) entries", len(vv), 23)
p("VOCABULARY_SCHEMAS entries", len(vs), 22)
p("  queried but absent from the contract", len(set(vt)-set(vs)), 1)
print(f"       -> {sorted(set(vt)-set(vs))}   (read from D1 every call, then dropped)")
p("FIXTURE_TABLES entries", len(ft), 17)
p("FIXTURE_SCHEMAS entries", len(fsc), 15)
print(f"       -> tables with no schema: {sorted(set(ft)-set(fsc))}")
SIX = ["admin","organizer","coach","player","spectator","referee"]
rolefiles = []
for f in allf:
    if f.startswith("src/domain/model/"): continue    # the PO's file, synced verbatim
    ls = rd(f).split("\n")
    for i in range(len(ls)):
        w = "\n".join(ls[i:i+12]).lower()
        if all(re.search(rf'["\']{r}["\']|\b{r}\s*[:,]', w) for r in SIX):
            rolefiles.append(f"{f}:{i+1}"); break
p("files writing the six-role set out in full", len(rolefiles), 7)
for r in rolefiles: print(f"       -> {r}")

print("\n  CLASS 2 — the model's own vocabulary, restated as a literal\n")
lit = [f"{f}:{rd(f)[:m.start()].count(chr(10))+1} {m.group(1)}" for f in allf
       for m in re.finditer(r'type (\w+) = ("(?:EVENT|TEAM|GAME|PLAYER|ORG)"\s*\|[^\n]*)', rd(f))]
p("object-type unions hand-written", len(lit), 1)
for r in lit: print(f"       -> {r}")
nm = [f"{f}:{rd(f)[:m.start()].count(chr(10))+1} = {m.group(1).strip()}" for f in allf
      for m in re.finditer(r'^\s*export type Names = (.+)$', rd(f), re.M)]
p("declarations of `Names`", len(nm), 3)
for r in nm: print(f"       -> {r}")

print("\n  CLASS 3 — 23 tables declaring the same columns by hand\n")
tabs = re.findall(r'export const (\w+) = sqliteTable\("(\w+)", \{(.*?)\n\}\)', rd(V), re.S)
core, desc = {"code","nameEn","names","sort"}, {"descriptionEn","descriptions"}
cols = [set(re.findall(r'^\s+(\w+):', b, re.M)) for _,_,b in tabs]
p("vocabulary tables", len(tabs), 23)
p("  carrying all of code/nameEn/names/sort", sum(core <= c for c in cols), 23)
p("  that are exactly those four", sum(c == core for c in cols), 11)
p("  also carrying descriptionEn/descriptions", sum(desc <= c for c in cols), 6)
p("  column declarations the repeat costs", sum(len(core & c)+len(desc & c) for c in cols), 104)

web = [f for f in allf if f.startswith("src/web")]
print("\n  CLASS 4 — which caches a write clears, decided at each call site\n")
p("useQueryClient() call sites", sum(rd(f).count("useQueryClient()") for f in web), 30)
p("  files holding one", sum("useQueryClient()" in rd(f) for f in web), 16)
p("invalidateQueries() call sites", sum(len(re.findall(r'invalidateQueries\(', rd(f))) for f in web), 38)
p("useMutation() call sites", sum(len(re.findall(r'useMutation\(', rd(f))) for f in web), 43)

b = rd("src/api/base.ts").split("\n")
blk = lambda a,z: [x.strip() for x in b[a-1:z]]
print("\n  CLASS 6 — verbatim blocks small enough to have been missed\n")
p("identical lines shared by `authed` and `viewer`", sum(1 for x,y in zip(blk(118,124), blk(142,148)) if x==y and x), 7)
print(f"\n  {'ALL NUMBERS MATCH' if not bad else str(bad)+' DIFFER — fix the plan first'}\n")
sys.exit(1 if bad else 0)
EOF
```

Class 5 is knip's, and the gate already runs knip — but not this part of it:

```sh
bun x knip --include exports,types,duplicates --no-progress
```

`scripts/check.ts` runs `knip --include files,unlisted`. **Exports and types are
not in that list**, which is why 41 of them have accumulated with every gate
green. That is not a criticism of the choice — `files,unlisted` is the part that
can break a build — but it does mean this class was invisible rather than
tolerated, and the numbers below are the first time anyone has counted it.

## The loop — one stage, walked until it converges

There are no phases. Every box below is independent, every one is shippable on
its own, and the order is the decision rules, not the numbering. The loop is:

1. run the block, fix the file if it disagrees
2. `mise run 2-check`
3. take the highest-priority unticked box by the rule below
4. `mise run 2-check`, tick it, log it
5. go to 1

**Priority, when several boxes are open:** a box that fixes a live defect, then
one that makes a whole class impossible, then one that only removes lines. Within
a tie, the smallest diff first.

Boxes may be added while the loop runs, on the same terms plan-ownership sets:
a new instance of a class already in the table is the plan's own work arriving,
not scope creep. A finding outside the six classes is not a box.

### Class 1 — one set, written out by hand in several places

- [ ] **`inviteStatuses` reaches the browser.** The live defect. Fix
      `VOCABULARY_SCHEMAS` and, in the same commit, make the three maps in
      `src/db/vocabularies-schema.ts` unable to disagree — a mapped type over
      `VOCABULARY_TABLES` if the inference holds, the literal plus a type-level
      exhaustiveness assertion if it does not. **Read the generated OpenAPI
      document both ways before choosing**, per the rule above.
- [ ] A worker test asserting `/api/reference` returns every key in
      `VOCABULARY_TABLES`, with the count derived from the map rather than
      written as 23. It must fail if a vocabulary is added and not published.
- [ ] **`VOCABULARY` in `src/domain/vocabularies.ts` derives from the model, or
      is checked against it.** Fourth copy of the same 23. Decide which, and
      write the reason where the decision lands.
- [ ] **`STORED_ROLE` derives, like `STORED_ORG_ROLE` two lines above it.**
      `Object.fromEntries(ROLE.map(r => [r.code, r.code.toLowerCase()]))`, typed
      the way its neighbour is. This is one line and it removes one of the seven.
- [ ] **`ROLES` in `src/web/pages/admin.tsx` comes from the model.** The SPA may
      import `src/domain` at runtime; this is `ROLE_CODES` lowercased, which is
      exactly what `STORED_ROLE` will then be.
- [ ] **`adminRoles` in `src/auth/admin-access-control.ts` derives its key set.**
      Its docstring is right that all six must be declared and that an omitted
      role is a worse failure than a denying one — deriving the keys is how that
      stops depending on memory. Keep the docstring; it explains the *why* that
      no derivation can.
- [ ] **The three test copies** — `tests/helpers/actors.ts` (`type Role`),
      `tests/helpers/auth.ts` (`ACTORS`, `ACTOR_NAMES`),
      `tests/render/admin.spec.ts`. `actors.ts` already says "Read off the model
      rather than restated" about the line below its own restatement.
      `tests/worker/write.test.ts` is **not** in this box — see *What this plan
      must not build*.
- [ ] **`FIXTURE_TABLES` vs `FIXTURE_SCHEMAS`.** Establish whether `games` and
      `gameReferees` are deliberately schema-less. If yes, say so on the line and
      add the pair to the check. If no, it is the same bug as `inviteStatuses`
      and it is fixed the same way. Coordinate with plan-seed-coverage before
      editing that file — it has boxes there too.
- [ ] **`scripts/check/sets.ts`** <!-- docs-check-ignore --> for whatever is left:
      fails when two maps declared as covering the same set do not. Added to
      `scripts/check.ts` beside `tables`. **Not before the derivations land** — a
      checker whose whole list has just become underivable is boilerplate, which
      is what this plan is against.

### Class 2 — one concept, declared more than once

- [ ] **`Names`.** `src/web/lib/localizer.ts` imports from `src/domain/names.ts`
      instead of declaring `Record<string, string>`. Two declarations remain and
      that is correct: `src/domain/model/names.ts` is the PO's, synced verbatim.
      Expect fallout — the SPA's version is not `Partial`, so code that assumed a
      key was present will stop compiling. **That fallout is the finding**, and
      each site is fixed rather than cast.
- [ ] **`ObjectTypeCode` in `src/web/components/follow.tsx`** imports from
      `src/domain/vocabularies`.
- [ ] **`SessionUser`** — `src/api/base.ts` and `src/web/lib/session.tsx`. Decide
      whether these are one concept or two: the Worker's is what Better Auth
      returns, the SPA's is what the session endpoint sends. If two, rename one
      so the collision stops looking like duplication. If one, share it.
- [ ] **`ApiEvent` / `ApiTeam`** — `src/domain/api.ts` infers from the zod schema,
      `src/web/lib/api.ts` extracts from `RouterClient`. Both are derived and
      both are used, so neither is a copy; but two names for one shape is a trap
      the next person falls into. Decide, and write which is canonical where the
      loser used to be.

### Class 3 — 23 tables declaring the same columns by hand

- [ ] **A shared column group for the vocabulary tables.** All 23 carry
      `code`, `nameEn`, `names`, `sort`; 11 are exactly those four; 6 also carry
      `descriptionEn` and `descriptions`. That is 104 column declarations
      expressing two facts. A spread — `...vocabularyColumns` — collapses it and
      makes "every vocabulary has a code and a name" true by construction rather
      than by 23 agreements.
- [ ] Confirm the drizzle types survive the spread, and that
      `drizzle-kit generate` emits **no migration** afterwards. A consolidation
      that changes the schema is not a consolidation. Run it in a real terminal
      and read what it produces, per AGENTS.md.

### Class 4 — which caches a write clears, decided at each call site

- [ ] **Establish whether this is one class or 38 correct decisions.** 30
      `useQueryClient()` sites across 16 files, 38 `invalidateQueries` calls, 43
      mutations. `orpc.games.key()` appears 8 times and `orpc.events.key()` 8
      times, and `src/web/components/entries.tsx` is the only place that knows
      withdrawing a team must also clear standings. Before writing any code, list
      each mutation against what it invalidates and mark the ones that are
      wrong or missing. **If none are wrong, this class is closed with that
      finding written here** — 38 correct hand-written decisions are not a defect,
      and plan-ownership's Phase 4 already owns the two that are.
- [ ] Only if the list finds real errors: the invalidation moves next to the
      mutation it belongs to, in `src/web/lib/data.tsx`, the way plan-ownership
      Phase 4 already says for `follow`. Coordinate — that box is theirs.

### Class 5 — exports nothing imports

- [ ] **Widen the gate's knip step** to include `exports` and `types`. It runs
      `--include files,unlisted` today, which is why 28 unused exports and 13
      unused types are invisible.
- [ ] **Triage all 41 before deleting any.** AGENTS.md is explicit: "When a grep
      says a file is unused, run `mise run 2-check` first." Several will be test
      seams or documented escape hatches — `b64urlEncode` in
      `src/api/webpush.ts` sits beside an RFC implementation, and
      `tests/helpers/auth.ts` exports eight things a spec may need tomorrow.
      Delete what is dead, and for the rest write which category on the line.
- [ ] The 2 unused devDependencies (`@inlang/cli`, `dependency-cruiser`) —
      note that `dependency-cruiser` **is** run by the gate as `depcruise`, so
      this is knip not seeing it rather than a dependency to remove. Verify
      before touching `package.json`.
- [ ] The unresolved import knip reports in `scripts/check.ts` →
      `scripts/lib/watch.ts`. Either it is used and knip is wrong, or it is dead.
      Find out which.
- [ ] The 6 stale entries in `knip.jsonc` it reports as removable.
- [ ] An exceptions list with a reason per line, and the step fails on anything
      not in it. Same shape as every other check here.

### Class 6 — verbatim blocks worth one edit

- [ ] **`authed` and `viewer` in `src/api/base.ts`** share 7 identical lines
      resolving the session, differing only in the last. Extract the resolution;
      keep both docstrings, which explain a real distinction — one 401s, the
      other returns null — that the shared code must not blur.

## Definition of done, whole job

**"Where code can be collapsed together."**

- [ ] Every pair in the class-1 table either derives or is checked, and the check
      has an exceptions list where every line carries a reason.
- [ ] `Names` is declared twice, both deliberate, and the second one is the PO's.
- [ ] No file outside `src/domain/model/` writes the six-role set out in full,
      except `tests/worker/write.test.ts`, whose reason is on the line.
- [ ] No hand-written union restates a vocabulary the model defines.

**"Where architecturally boilerplate can be removed."**

- [ ] The 23 vocabulary tables declare their shared columns once.
- [ ] `mise run 2-check`'s knip step sees exports and types, and its exception
      list is shorter than the 41 it started with.
- [ ] Class 4 is either fixed or **closed with the finding written down**. A
      class that turns out not to be a defect is a legitimate outcome and must be
      recorded as one, not left ambiguous.

**The test that it actually held** — real, to be run, not claimed:

- [ ] Add a vocabulary to the model in biz, sync, `mise run 2-check`. It appears
      on `/api/reference`, typed, with nothing edited in `src/db/`. Today it
      would appear in three maps out of four and be dropped from the response.
- [ ] Add a seventh role in biz, sync. Exactly one place needs editing, and the
      gate names it if you miss one.
- [ ] `mise run 2-check` green, and `mise run 2-check -- --e2e` no worse than
      where it starts.
- [ ] Net-negative on lines, reported as a number in the log.
- [ ] Nothing deferred silently. Anything not done is in the log with its reason,
      and said in the reply at the time.

## Log

Append per pass: what was done, what was found, **what changed in this file and
why**. Newest last.

### Noticed, out of scope

Real, seen while measuring, not this plan's class. One line each, no box.

- The reference handler ends in a cast to `z.infer<typeof ReferenceSchema>`,
  which is what let the 22/23 mismatch through silently. The cast is honest
  about itself in a comment; it is still the mechanism by which the drift
  reached production.
- `src/web/lib/localizer.ts` is 68 lines with two importers, one of which is
  `locale.tsx` doing `export * from "./localizer"`. Collapsing them is
  defensible and is *not* in this plan — see "do not merge files".
- The notification cluster is 7 modules and ~2,200 lines across `src/api`. It is
  large because Web Push, email and the queue are genuinely three things; no
  duplication was found in it beyond the `notify-queue.ts` block in class 0.
- `mise run 2-check` piped into `tail` reports `tail`'s exit status. Anything
  reading `$?` through a pipe is reading the wrong process — the same trap
  AGENTS.md records for `$(date)`.

### Passes

- 2026-09-03 — plan written, and it is the third in this directory, so its first
  job was to prove it was not re-doing the other two. Facts derived before
  anything was claimed: 229 files, 230 verbatim-duplicated lines (0.8%), 23
  vocabularies in four maps of which one carries 22, six roles in seven files,
  three `Names`, 104 repeated column declarations, 41 unused exports and types,
  7 identical lines in `base.ts`.

  **The premise was half wrong, and saying so is the main finding.** The brief
  was that the system had become "a mass of lots of files" with overlap and
  repetition. The file count is real — 229 — but 51 of 108 `src` modules have
  exactly one importer and every one of those is the architecture working: one
  page per route, one API module per router group. Verbatim duplication is under
  one percent. There is no collapsing to be done at the file level and this plan
  refuses to do any, which removes most of what a naive reading would have
  scheduled.

  What is duplicated is *sets*, and one had already broken: `/api/reference`
  reads `invite_status` from D1 on every call and the contract drops it.

  Four things measured this session that were wrong when first written, recorded
  because each was nearly asserted:

  1. **"20 mutations invalidate nothing."** False. The detector only looked
     inside the `useMutation` options object, and those 20 call a local
     `invalidate` closure declared just above. Corrected before it reached the
     file — and it is why class 4 is a box that *establishes whether there is a
     defect* rather than one that assumes there is.
  2. **"`src/web/pages/video.tsx` has no importer."** False. It is `lazy(() =>
     import(...))` from `main.tsx`, deliberately code-split. The import scanner
     only matched static `from "..."`.
  3. **"The gate hides its own failure — it printed ERROR and exited 0."** False,
     and the most instructive of the four. That 0 was `tail`'s status, because
     the run was piped. Re-run unpiped, `mise run 2-check` exits 1 correctly.
  4. **Eight of the first-draft numbers** differed from the derivation block on
     its first run — the count of exactly-four-column tables (11, not 10), of
     tables carrying descriptions (6, not 8), of `invalidateQueries` sites (38,
     not the 35 a deduplicated `uniq -c` reported), and the file totals. Fixed
     before the phases were written.

  Two conditions of the tree, both worth knowing next pass:

  - **`mise run 2-check` is green** on a clean run: 2 unit, 378 worker, 219
    render, exit 0. An earlier run in this session reported a worker timeout and
    140 render failures; both were self-inflicted, from running a second gate
    while the first still held port 4173. The render tier alone passes 219/219
    in 26s.
  - **Another session is working in this tree right now** — three commits landed
    during the measuring (`ced4df2`, `101206c`, `0dfbdfb`, all plan-ownership
    work) and `docs/plan-ownership.md`, `docs/plan-seed-coverage.md` and
    `src/web/pages/profile.tsx` were modified under it. The line total moved by
    13 between two runs of the same script. This is the hazard AGENTS.md records
    from 2026-08-31; read `git status` before a broad `git add`, and expect the
    printed line count to move without anyone here having touched it.
