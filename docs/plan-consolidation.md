# Plan — the write side should derive what the read side already does

Kept, not deleted. The judgement calls in here — which collections may share a
mechanism and which must not — are decisions somebody will want the reason for,
and the reason belongs beside the list.

**Work it in a loop, and inspect yourself on every pass.** The plan is wrong
until proven otherwise. The first draft of this file was wrong in a way worth
recording, because it is the failure mode of this whole exercise: it measured
duplication *syntactically* — verbatim blocks, key-set overlap, type-name
collisions — found 0.8%, and concluded the codebase was already consolidated.
Every finding below is invisible to all of those measurements. Five of the
detectors written for this plan produced false positives that a two-minute check
disproved; they are in the log.

Each pass, in this order:

1. **Re-derive the facts.** The block in *Deriving the facts* below. If an
   asserted number differs, **fix the file first**, note it in the log, then
   continue. A plan that disagrees with the code is worse than no plan.
2. **`mise run 2-check` before starting, not only after.** Another session has
   been committing to this tree throughout — five commits while this was being
   written, two of which swept this file up mid-edit. A red gate you did not
   cause is worth knowing about before you attribute it to your own change.
3. **Do the next unticked box**, applying the decision rules rather than asking.
4. **`mise run 2-check`.** Green before ticking anything.
5. **Tick it, or write why not.**
6. **Append to the log** — what was done, what was found, what changed here.

Never end a pass having neither ticked a box nor recorded why one cannot be
ticked. That is the only definition of progress here.

## The problem, in one line

The model describes nine join tables structurally, and `src/api/relations.ts`
reads that description to answer *who holds what* generically — while every
**write** to those same tables is hand-written, eight times, in six files, under
five verb conventions, with no two of them returning the same shape.

## Who it hurts

A school hires an assistant coach in March. There is no way to give her access
to the team.

`team_coaches` is the table carrying `HEAD_COACH`, `ASSISTANT_COACH` and
`TEAM_MANAGER` — the three relations that decide who may edit a team, enter a
roster or record attendance. The read side resolves all three from the model.
The only code that ever writes a row into it is a side effect of `teams.create`
(`src/api/teams.ts:134`), and the only code that deletes one is the cascade when
a team is deleted. There is no add-coach endpoint, and the Product Owner's model
has no action for one either — the only coach-shaped action is `SIGN_UP_AS_COACH`.

So coaching staff is fixed at the moment a team is created, forever. Nobody
decided that. It is what happens when each membership is built where somebody
needed it, and nobody needed that one.

## Why it happens

**The two halves of the same relation are built by opposite methods.**

The model gives every table-backed relation a full structural description —
`sourceTable`, `objectColumn`, `userColumn`, `throughTable`, `throughColumn`,
`filterColumn`/`filterValue`, `activeToColumn`. `TEAM_PLAYER` reads:

```
sourceTable: "player_teams", objectColumn: "team_id", userColumn: "user_id",
throughTable: "players", throughColumn: "player_id", activeToColumn: "to_date"
```

`src/api/relations.ts` consumes **all seven** of those columns to build SQL. Add
a relation upstream and the read side answers for it with nothing edited here.

The write side reads none of them. `registrations.ts` re-states that
`player_teams` links a team to a player and that ending a spell means setting
`to_date` — a fact the model already declares as `activeToColumn` and that
`relations.ts` already honours at line 92.

## What that shape costs elsewhere

- **A membership change has no single meaning to the client.** The eight
  "someone now belongs to something" procedures return eight different shapes:
  `{orgId,userId,role}`, `{teamId,playerId,fromDate}`,
  `{eventId,playerId,registeredAt}`, `{eventId,teamId,divisionId}`,
  `{gameId,userId}`, `{eventId,userId,addedAt}`, `{following}`, and one that
  returns nothing of the kind. No two agree. So the SPA cannot have one "a
  membership changed" handler, which is a direct cause of the ~40 hand-written
  cache invalidations spread across ~17 component files — Class C, whose exact
  count the block prints rather than asserts because two other plans are moving
  it.
- **Soft-delete is a per-endpoint decision.** `removePlayer` ends a spell by
  setting `to_date`; `removeMember` hard-deletes. Both are correct — the model
  says so, via `activeToColumn` being set on one and null on the other — but
  nothing connects the endpoint to the model's answer, so the next collection
  gets whichever the author remembers.
- **The GUI repeats the same asymmetry.** The five `event-*.tsx` components are
  one component written five times: query a collection under an event, render
  loading / empty / rows as `invite-row` with `data-testid={X-${id}}`, an
  add and a remove mutation, invalidate `orpc.events.key()`. Every identifier
  differs, so no text-similarity tool sees it.

## The architecture

### The invariant

> **A relation is described once, in the model. Both directions — who holds it,
> and how it comes to be held — derive from that description.**

The read half already satisfies this. This plan is about the write half.

### The prior art is in this repository, twice

This is not a pattern to import. It is a pattern this codebase already uses and
already got right:

- **`src/api/relations.ts`** turns the model's structural columns into SQL for
  every table-backed relation, generically.
- **`src/api/domain.ts`** does the same for read endpoints: `listOf(builder,
  key, path, policy)` — one line per resource, response schema derived from the
  table, route derived from the key.

`listOf` is the shape the argument turns on, because of how it handles the
dangerous part: **the policy is a required argument, not an option.** Its
docstring says why — "an endpoint factory that can produce an undeclared one is
how 'every generated table is an endpoint' turns into published personal data".

### The objection already on the record

`src/api/domain.ts` does not just omit writes, it **declines** them, in writing:

> Writes are absent on purpose. These rows are the PO's fixtures, loaded by
> /api/seed. When a feature needs to create one it gets a real endpoint with the
> two access-control questions ADR 009 requires — exactly the kind of thing a
> factory should not invent on anyone's behalf.

**Take this seriously; it is the strongest argument against this plan.** Writes
are more dangerous than reads, and a factory that guesses who may write is worse
than eight hand-written endpoints.

Two things about it, though. First, its objection is to a factory *inventing*
access control — and `listOf` itself answers that objection by making policy a
required argument; the same construction answers it for writes. Second, it was
written when ADR 009 existed, and the ADRs have since been deleted, so the
sentence now cites a document no reader can consult.

That does not make it wrong. It makes it **a decision to re-take deliberately,
with the evidence that has accumulated since**: eight collections, six files,
five verb conventions, eight return shapes, one relation with no write path, and
a soft-delete rule the model states and the code restates.

**If the re-taken decision is "still no", that is a legitimate outcome** and it
is recorded here with its reason, and Class A collapses to naming conventions
and return shapes only. Do not force the factory to justify the plan.

### Options considered

Four, one of them a deletion, one of them doing nothing.

| | what it does | costs | verdict |
|---|---|---|---|
| **Leave it; fix only the names and shapes** | eight endpoints stay, but they agree on verb and return shape | the model still has no influence on writes; the eleventh collection is still hand-built | **the fallback**, and what happens if the factory is refused |
| **`membershipOf(relation, policy)`, mirroring `listOf`** | one helper reading the model's own structural columns; the relation code and the action are required arguments | a write factory, against a recorded decision; the `filterColumn` and `throughTable` cases are genuinely fiddly | **yes, if the re-taken decision allows it** |
| **Delete the collections nothing uses** | `eventPlayers`, guardians and follow have thin GUI use | a real reduction — but plan-ownership owns what the GUI offers, and deleting a built endpoint to reduce a count is the worst reason to delete | **no** — this is the deletion option and it is wrong here |
| **Generate the endpoints from the model at build time** | no runtime factory | a transform between the repos, which AGENTS.md forbids in as many words and which this repo deleted once already | **no** |

**What is accepted by choosing the second:** a helper that is harder to read than
the endpoint it replaces, for the three collections with `throughTable` or
`filterColumn` set. The escape hatch is that a collection may opt out and stay
hand-written, with the reason on the line — the same shape as `domain.ts`'s
"deliberately NOT exposed" list.

## What this plan must not build

- **Do not merge files, and do not treat 229 as the problem.** Roughly half the
  `src` modules have exactly one importer — 52 of 109 on 2026-09-03 — and that is
  one page per route and one API module per router group. No box here moves a
  file for being small.
- **Do not chase verbatim duplication.** It is 230 lines in 28,383, under one
  percent. Measured, and it is the wrong measurement — this whole plan is what
  was found *after* that number came back clean.
- **Do not touch `src/domain/model/`.** It arrives verbatim via
  `mise run ops domain`.
- **Do not write a generator**, per the options table.
- **Do not add an action to the model.** The missing add-coach endpoint needs
  `ADD_TEAM_COACH` or similar, and that is the PO's. Record it; do not invent it.
- **Do not collapse `removePlayer` into `removeMember`.** One ends a spell and
  one deletes a row. The model distinguishes them via `activeToColumn`; any
  shared mechanism must read that column, not average the two behaviours.

## Scope: what belongs to the other two plans

| finding | whose |
|---|---|
| hand-written render payloads | [plan-seed-coverage.md](plan-seed-coverage.md) Phase 5 |
| empty tables and columns | plan-seed-coverage Phases 2–3 |
| a screen deciding what the model owns | [plan-ownership.md](plan-ownership.md) Phase 2 |
| which surfaces the GUI offers at all | plan-ownership Phase 5 |
| **how a membership is written** | **here** |
| **a component written once per case** | **here** |
| **a set enumerated twice** | **here** |

plan-ownership Phase 4 owns wiring invalidation for `follow` and
`acceptCoOrganizerInvite`. Class C below is the *reason* those are hand-wired;
do the structural half here and say so in both logs.

## Rules for this work

- **Every change is a deletion or a derivation.** If a box adds a concept, it is
  the wrong box.
- **A type must not get looser, and a policy must never be inferred.** Diff the
  generated document either side of a contract change: `mise run 1-dev -- ensure`,
  then `curl -s localhost:8787/openapi.json | python3 -m json.tool`. Any helper
  that can produce a procedure with no declared policy is refused outright —
  `mise run 2-check`'s authz step must still see every one.
- **One class per commit.**
- **`mise run 2-check` before committing**, not just `tsc`.
- **Never run two gates at once.** A second `mise run 2-check` while the first
  was winding down collided on port 4173 and reported 140 render failures that
  were entirely self-inflicted. Run it once and wait.

## Running unattended

### Decision rules, in priority order

1. **The model already describes it → derive from the model.** Never restate a
   relation's table, columns or soft-delete rule in a handler.
2. **A drifted pair that breaks something → fix the drift, then make that drift
   impossible**, in one commit.
3. **A write helper may never infer a policy.** Action and relation are required
   arguments or the helper is not built.
4. **Derivable only by widening a type or weakening a policy → do not.** Leave
   it, write the reason on the line.
5. **Two declarations of one type → keep the one nearest the model.**
6. **An export nothing imports → delete it**, unless it is a test seam or a
   documented escape hatch; say which on the line.
7. **Needs an action the model lacks → record under Needs the PO, skip, carry
   on.** Do not add to the model and do not stall.

### The bound, so this actually finishes

| class | the list it counts down | today | boxes |
|---|---|---|---|
| A | membership collections written by hand | 8, in 6 files | 7 |
| B | collection components written once per case | 5 | 3 |
| C | cache invalidations written at a call site | 38, in 16 files | 2 |
| D | maps enumerating one set that can disagree | 5 | 9 |
| E | concepts whose type is declared twice | 4 | 4 |
| F | vocabulary tables repeating a column group | 23 | 2 |
| G | exports and types nothing imports | 41 | 6 |
| H | verbatim blocks worth one edit | 1 | 1 |

**34 boxes over eight lists**, plus the definition of done. A and B are the
architecture; D through H are tidying and were the whole of the first draft.
**If a pass only ever ticks D–H boxes, it is avoiding the plan.**

### What stops the loop

- every box ticked, or
- every remaining one marked **Needs the PO**, **policy would weaken** or
  **decision re-taken as no**, with its reason — and if more than three land
  there, this plan was written wrong; say so rather than presenting it as done,
  or
- `mise run 2-check` cannot be made green for a cause outside this scope.

## Deriving the facts

```sh
python3 - <<'EOF'
import os, re, sys, glob, hashlib, collections
bad = 0
def p(label, n, says):
    global bad
    if n != says: bad += 1
    print(f"  {label:<50}{str(n):>4}   (says {says}){'' if n == says else '   <-- DIFFERS'}")
rd = lambda f: open(f, encoding="utf8").read()

# ── A: what the model describes, and what the write side ignores ─────────
v = rd("src/domain/model/vocabularies.ts")
g = v[v.index("export const RELATION ="):]
rows = re.findall(r'\{ code: "([A-Z_]+)", objectTypeCode: "(\w+)", via: "(\w+)", sourceTable: (\S+?),', g)
srcs = {s.strip('"') for c,o,via,s in rows if via == "table" and s != "null"}
print("\n  CLASS A — the model describes these; only the read side reads it\n")
p("join/source tables the model declares", len(srcs), 9)
structural = ["sourceTable","objectColumn","userColumn","throughTable",
              "throughColumn","filterColumn","activeToColumn"]
r = rd("src/api/relations.ts")
p("  structural columns relations.ts consumes", sum(c in r for c in structural), 7)

PAIRS = {  # collection -> (file, create-procedure)
 "org_members":("orgs.ts","addMember"), "player_teams":("registrations.ts","addPlayer"),
 "event_teams":("registrations.ts","registerTeam"), "event_players":("players.ts","registerForEvent"),
 "game_referees":("games.ts","assignReferee"), "event_co_organizers":("events.ts","addCoOrganizer"),
 "subscriptions":("notifications.ts","follow"), "guardians":("players.ts","signUpAsGuardian")}
def shape(f, n):
    m = re.search(r'export const '+n+r' = (?:pub|authed|viewer)(.*?)\.handler', rd("src/api/"+f), re.S)
    o = re.search(r'\.output\(\s*z\.object\(\{([^}]*)\}', m.group(1)) if m else None
    return tuple(sorted(re.findall(r'(\w+):', o.group(1)))) if o else ()
p("membership collections written by hand", len(PAIRS), 8)
p("  API files they are spread across", len({f for f,_ in PAIRS.values()}), 6)
p("  verb conventions among them", len({"add/remove","register/withdraw","assign/unassign",
                                        "follow/unfollow","signUp"}), 5)
p("  distinct return shapes (no two agree)", len({shape(f,n) for f,n in PAIRS.values()}), 8)
tc = rd("src/api/teams.ts")
p("  team_coaches add/remove endpoints", 0 if "addCoach" not in tc else 1, 0)

# ── B: the collection component, written once per case ───────────────────
ev = sorted(glob.glob("src/web/components/event-*.tsx"))
print("\n  CLASS B — one component, five instantiations\n")
p("event-* collection components", len(ev), 5)
# 4, not 5: event-settings.tsx is a form, not a collection. That is the box below.
p('  carrying className="empty"', sum('className="empty"' in rd(f) for f in ev), 4)
p('  carrying data-testid="event-', sum('data-testid="event-' in rd(f) for f in ev), 5)

# ── C–H: the tidying classes ─────────────────────────────────────────────
def files(*roots):
    for root in roots:
        for d, dirs, fs in os.walk(root):
            dirs[:] = [x for x in dirs if x not in ("node_modules","paraglide","migrations")]
            for f in sorted(fs):
                if f.endswith((".ts",".tsx")) and not f.endswith(".d.ts"): yield os.path.join(d,f)
allf = list(files("src","scripts","tests")); web = [f for f in allf if f.startswith("src/web")]
# PRINTED, not asserted: plan-ownership is actively wiring invalidation, so this
# moves for reasons that are not drift. Read the trend, not the number.
print("\n  CLASS C — invalidation decided at each call site (printed)\n")
inv = sum(len(re.findall(r'invalidateQueries\(', rd(f))) for f in web)
qcf = sum('useQueryClient()' in rd(f) for f in web)
print(f"  invalidateQueries() call sites                     {inv}   (was 38 on 2026-09-03)")
print(f"  files holding a useQueryClient()                   {qcf}   (was 16)")

def keys(path, name):
    m = re.search(r'export const '+name+r'(?::[^=]+)? = \{(.*?)\n\} as const', rd(path), re.S)
    return re.findall(r'^\s{2}["\']?(\w+)["\']?\s*:', m.group(1), re.M) if m else []
V, F = "src/db/vocabularies-schema.ts", "src/db/fixtures-schema.ts"
vt, vs = keys(V,"VOCABULARY_TABLES"), keys(V,"VOCABULARY_SCHEMAS")
print("\n  CLASS D — one set, written out by hand in several places\n")
p("VOCABULARY_TABLES entries", len(vt), 23)
p("VOCABULARY_SCHEMAS entries", len(vs), 22)
p("  queried but absent from the contract", len(set(vt)-set(vs)), 1)
print(f"       -> {sorted(set(vt)-set(vs))}   (read from D1 every call, then dropped)")
# PRINTED: plan-seed-coverage Phase 2 is adding tables here as this runs. It went
# 2 -> 5 in one afternoon, which is this class arriving faster than it is fixed.
gap = sorted(set(keys(F,"FIXTURE_TABLES")) - set(keys(F,"FIXTURE_SCHEMAS")))
print(f"  FIXTURE_TABLES with no FIXTURE_SCHEMA              {len(gap)}   (was 2 on 2026-09-03)")
print(f"       -> {gap}")
SIX = ["admin","organizer","coach","player","spectator","referee"]
rf = []
for f in allf:
    if f.startswith("src/domain/model/"): continue
    ls = rd(f).split("\n")
    for i in range(len(ls)):
        if all(re.search(rf'["\']{x}["\']|\b{x}\s*[:,]', "\n".join(ls[i:i+12]).lower()) for x in SIX):
            rf.append(f); break
p("files writing the six-role set out in full", len(rf), 6)
print("\n  CLASS E/F/H\n")
p("declarations of `Names`", sum(len(re.findall(r'^\s*export type Names =', rd(f), re.M)) for f in allf), 3)
p("object-type unions hand-written", sum(len(re.findall(
    r'type \w+ = "(?:EVENT|TEAM|GAME|PLAYER|ORG)"\s*\|', rd(f))) for f in allf), 1)
tabs = re.findall(r'sqliteTable\("(\w+)", \{(.*?)\n\}\)', rd(V), re.S)
core = {"code","nameEn","names","sort"}
p("vocabulary tables sharing code/nameEn/names/sort",
  sum(core <= set(re.findall(r'^\s+(\w+):', b, re.M)) for _,b in tabs), 23)
b = rd("src/api/base.ts").split("\n"); blk = lambda a,z: [x.strip() for x in b[a-1:z]]
p("identical lines in `authed` and `viewer`",
  sum(1 for x,y in zip(blk(118,124), blk(142,148)) if x==y and x), 7)
print(f"\n  {'ALL NUMBERS MATCH' if not bad else str(bad)+' DIFFER — fix the plan first'}\n")
sys.exit(1 if bad else 0)
EOF
```

Class G is knip's, and the gate runs it as `--include files,unlisted`, so
exports and types are not counted. That is why 41 have accumulated with every
gate green — invisible rather than tolerated:

```sh
bun x knip --include exports,types --no-progress
```

## The loop — one stage, walked until it converges

No phases. Every box is independent and shippable on its own; the order is the
decision rules, not the numbering.

**Priority when several are open:** a box that fixes a live defect, then one that
makes a whole class impossible, then one that only removes lines. Smallest diff
breaks a tie. **A and B before D–H** — the first draft of this plan was D–H only,
and that is what made it worth throwing away.

### Class A — a membership is written the way the model describes it

- [ ] **Line the eight up and read them side by side.** Table, verb, action,
      return shape, soft-delete or hard-delete, and which of the model's
      structural columns each one restates. This table is the evidence for the
      next box and belongs in this file. Do not write code first.
- [ ] **Re-take the `domain.ts` decision, explicitly.** Does a write helper with
      the relation and the action as *required* arguments answer the recorded
      objection, or not? Write the answer here either way, with the reasoning,
      because the next person will find that docstring and need to know it was
      considered rather than missed. **"No" ends Class A at the two boxes below.**
- [ ] If yes: **`membershipOf(relation, action, …)`** beside `listOf` in
      `src/api/domain.ts`, reading `sourceTable` / `objectColumn` / `userColumn`
      / `activeToColumn` off the model exactly as `relations.ts` does. Soft
      versus hard delete comes from `activeToColumn` and is never a parameter.
- [ ] If yes: migrate the collections with no `throughTable` or `filterColumn`
      first — `game_referees`, `event_co_organizers`. Leave `player_teams`
      (through `players`) and `org_members` (filtered by `org_role_code`) until
      the simple ones have shipped and the shape is proven.
- [ ] **One return shape for "a membership now exists"**, whether or not the
      helper is built. Eight endpoints returning eight shapes is the half of this
      class that needs no factory and no permission.
- [ ] **One verb pair.** Pick from the five and say which in this file; rename
      the rest. This is a breaking change to the OpenAPI document — check
      `src/web` for every call site, and note that no external integrator exists
      yet, which is what makes now the cheap moment.
- [ ] **`team_coaches` has no write path.** Record it under **Needs the PO**: the
      model has no add-coach action, so this is a commit in biz before it is one
      here. Say what it unblocks — coaching staff currently cannot change after a
      team is created.

### Class B — the collection component, written five times

- [ ] **Compare the five `event-*.tsx` side by side** and write down what
      genuinely differs. Expect it to be: the query, the mutation pair, and the
      cell contents of a row. Everything else — loading, empty, `invite-row`,
      `data-testid={X-${id}}`, the error paragraph, the save button's disabled
      state — is the same five times.
- [ ] Extract the shell, with the row contents as a render prop. **Testids must
      not change**, or the render tier's testid check will name every one of
      them; that check is the reason this is safe to attempt at all.
- [ ] `event-venues.tsx` is read-only and `event-settings.tsx` is a form, not a
      collection. Decide whether they belong in the shell or stay out, and write
      which — a shell that has to grow a flag for each exception is worse than
      five honest copies.

### Class C — which caches a write clears

- [ ] **Establish whether this is one class or 38 correct decisions.** List each
      mutation against what it invalidates; mark the wrong and the missing.
      `orpc.games.key()` appears 8 times, `orpc.events.key()` 8 times, and
      `src/web/components/entries.tsx` is the only place that knows withdrawing a
      team must also clear standings. **If none are wrong, close the class with
      that finding written here** — 38 correct hand-written decisions are not a
      defect. Note that Class A's single return shape is what would let this
      collapse; do this box *after* A.
- [ ] Only if the list finds real errors: the invalidation moves next to the
      mutation, in `src/web/lib/data.tsx`. Coordinate — plan-ownership Phase 4
      owns two of these.

### Class D — one set, written out by hand in several places

- [ ] **`inviteStatuses` reaches the browser.** The live defect:
      `src/api/reference.ts` queries all 23 vocabulary tables every call and
      `VOCABULARY_SCHEMAS` (line 274 of `src/db/vocabularies-schema.ts`) declares
      22, so the rows are read from D1 and dropped. Proven by parsing a full
      23-key payload through `ReferenceSchema` and getting 22 back. Fix it and,
      in the same commit, make the three maps unable to disagree — a mapped type
      over `VOCABULARY_TABLES` if the inference holds, the literal plus a
      type-level exhaustiveness assertion if it does not. The docstring's reason
      for the literal (`Object.fromEntries` erases the key literals and the
      endpoint loses its types) is correct and must be preserved.
- [ ] A worker test asserting `/api/reference` returns every key in
      `VOCABULARY_TABLES`, counted from the map rather than written as 23.
- [ ] `VOCABULARY` in `src/domain/vocabularies.ts` — the fourth copy of the same
      23 — derives from the model or is checked against it.
- [ ] **`STORED_ROLE` derives, like `STORED_ORG_ROLE` two lines above it.**
      `Object.fromEntries(ROLE.map(r => [r.code, r.code.toLowerCase()]))`.
- [x] `ROLES` in `src/web/pages/admin.tsx` comes from the model — it is
      `Object.values(STORED_ROLE)` as of `00f9566`. **Done by the other session
      working plan-ownership, not by this one**, which is corroboration rather
      than luck: the same restatement was found independently from the other
      end. Seven files became six while this plan was being written.
- [ ] `adminRoles` in `src/auth/admin-access-control.ts` derives its key set.
      Keep the docstring — it explains a *why* no derivation can.
- [ ] The three test copies — `tests/helpers/actors.ts`, `tests/helpers/auth.ts`,
      `tests/render/admin.spec.ts`. `tests/worker/write.test.ts` is **not** one:
      its `WRITERS`/`READERS` split is a partition with meaning.
- [ ] `FIXTURE_TABLES` (17) vs `FIXTURE_SCHEMAS` (15). Establish whether `games`
      and `gameReferees` are deliberately schema-less; say so on the line, or fix
      it as the same bug. Coordinate with plan-seed-coverage.
- [ ] **`scripts/check/sets.ts`** <!-- docs-check-ignore --> for whatever is left,
      beside `tables` in `scripts/check.ts`. **Last, not first** — every pair that
      derives needs no check, so writing it early gives it a list that is about
      to vanish.

### Class E — one concept, declared more than once

- [ ] **`Names`.** `src/web/lib/localizer.ts` says `Record<string, string>`;
      `src/domain/names.ts` says `Partial<Record<Locale, string>>`. The SPA's is
      not partial, so it claims every locale is present — the one thing
      `NamesSchema` exists to deny. Import from the domain. Expect fallout; **the
      fallout is the finding**, and each site is fixed rather than cast. Two
      declarations remain and that is right: `src/domain/model/names.ts` is the
      PO's.
- [ ] `ObjectTypeCode` in `src/web/components/follow.tsx` imports from
      `src/domain/vocabularies` instead of restating the union.
- [ ] `SessionUser` — `src/api/base.ts` and `src/web/lib/session.tsx`. One
      concept or two? If two, rename one.
- [ ] `ApiEvent` / `ApiTeam` — `src/domain/api.ts` infers from zod,
      `src/web/lib/api.ts` from `RouterClient`. Both derived, both used; decide
      which is canonical and say so where the loser was.

### Class F — 23 tables declaring the same columns by hand

- [ ] A shared column group. All 23 carry `code`, `nameEn`, `names`, `sort`.
- [ ] Confirm the drizzle types survive the spread and `drizzle-kit generate`
      emits **no migration**. Run it in a real terminal and read the output.

### Class G — exports nothing imports

- [ ] Widen the gate's knip step to include `exports` and `types`.
- [ ] **Triage all 41 before deleting any**, per AGENTS.md. Several are test
      seams — `tests/helpers/auth.ts` alone has eight. Write the category on the
      line for each survivor.
- [ ] The 2 "unused" devDependencies are **both false positives, verified**:
      `scripts/check.ts` runs `dependency-cruiser` as `depcruise` and
      `@inlang/cli` as `inlang`, and knip does not connect `bun x <binary>` to
      its package. Teach `knip.jsonc` about them so they stop reappearing.
- [ ] The unresolved import knip reports, `scripts/check.ts` →
      `scripts/lib/watch.ts`. Used and knip is wrong, or dead. Find out which.
- [ ] The 6 stale `knip.jsonc` entries it reports as removable.
- [ ] An exceptions list with a reason per line; the step fails on anything else.

### Class H — verbatim blocks worth one edit

- [ ] `authed` and `viewer` in `src/api/base.ts` share 7 identical lines
      resolving the session, differing only in the last. Extract it; keep both
      docstrings — one 401s and one returns null, and the shared code must not
      blur that.

## Definition of done, whole job

- [ ] The eight membership writes agree on a return shape and a verb pair, and
      either derive from the model or say in this file why they do not.
- [ ] No handler restates a relation's table, its columns, or its soft-delete
      rule. `activeToColumn` is read, not remembered.
- [ ] The five `event-*` components share a shell, or this file says why not.
      **No testid changed.**
- [ ] Class C is fixed or **closed with the finding written down**.
- [ ] `Names` is declared twice, both deliberate, the second one the PO's.
- [ ] No file outside `src/domain/model/` writes the six-role set in full, bar
      `tests/worker/write.test.ts` with its reason on the line.
- [ ] The knip step sees exports and types, with an exception list shorter than 41.

**The tests that it held** — to run, not to claim:

- [ ] Add a vocabulary in biz, sync, `mise run 2-check`. It appears on
      `/api/reference`, typed, with nothing edited in `src/db/`. Today it lands
      in three maps of four and is dropped from the response.
- [ ] Add a seventh role in biz, sync. Exactly one place needs editing.
- [ ] Add a table-backed relation in biz, sync. The read side already answers for
      it; the write side does too, or the gate names what is missing.
- [ ] `mise run 2-check` green; `-- --e2e` no worse than where it starts.
- [ ] Net-negative on lines, reported as a number in the log.

## Log

### Noticed, out of scope

- The reference handler ends in a cast to `z.infer<typeof ReferenceSchema>`,
  which is the mechanism by which the 22/23 drift reached production silently.
- `src/api/domain.ts`'s docstring cites "ADR 009", and the ADRs were deleted. A
  live decision resting on a document no reader can consult.
- `mise run 2-check` piped into `tail` reports `tail`'s exit status.

### Passes

- 2026-09-03 — **plan rewritten after the first draft was rejected, correctly.**

  The first draft measured duplication syntactically — verbatim block matching at
  window 8, key-set overlap, type-name collisions, import counting, knip — found
  0.8% duplicated lines, and concluded from that number that the codebase was
  already consolidated and the brief's premise was wrong. That conclusion does
  not follow. Low text similarity is exactly what "the same job done eight times
  under different names" looks like, and every finding in Classes A and B is
  invisible to all five of those detectors.

  It also generalised from one file: `orgs.ts` was read, the API layer was
  declared clean, and `events.ts` (866 lines), `games.ts` (916) and
  `registrations.ts` (584) were never opened. The five `event-*.tsx` components
  were listed and never compared. "No duplication was found" was written about a
  2,281-line notification cluster on the strength of a window-8 scan.

  What the semantic pass found, by lining the model up against the code rather
  than the code against itself:

  1. **The read side derives from the model and the write side does not.**
     `relations.ts` consumes all seven structural columns; eight membership
     collections in six files restate the same facts by hand, under five verb
     conventions, and **no two of the eight return the same shape**.
  2. **`team_coaches` has no write path at all** — only a side effect inside
     `teams.create`. Coaching staff is fixed at team creation. The model has no
     action for it either, so it is a gap spanning both repos.
  3. **`removePlayer` reimplements `activeToColumn: "to_date"`**, which the model
     declares and `relations.ts` already honours.
  4. **The five `event-*` components are one component.** Same skeleton, five
     sets of identifiers.
  5. **`src/api/domain.ts` already is this pattern for reads** — `listOf` with
     policy as a required argument — and explicitly declines it for writes. That
     objection is now in the plan as the strongest argument against it, with the
     decision framed as one to re-take rather than one to ignore.

  Five detectors written this session produced false positives, each caught by a
  check that took under two minutes. Recorded because the rate is the point — a
  measurement is a claim:

  1. "20 mutations invalidate nothing" — they call a local `invalidate` closure.
  2. "`video.tsx` has no importer" — it is `lazy(() => import(...))`.
  3. "The gate exits 0 while printing ERROR" — that was `tail`'s status.
  4. "Four procedures declare no policy" — a line-wrapped `.use(` the regex missed.
  5. "`team_coaches` is never written" — it is, inside `teams.create`.

  Two conditions of the tree:

  - **`mise run 2-check` is green** on a clean run: 2 unit, 378 worker, 219
    render, exit 0. An earlier run reporting 140 render failures was two gates
    colliding on port 4173.
  - **Another session is working here and committed this file twice mid-write.**
    `86caaaf` and `8cb600e` both carry `docs/plan-consolidation.md` under
    messages about unrelated work — a broad `git add` sweeping up an open file.
    Nothing was lost, but the history now attributes this plan to two commits
    that are not about it. Second occurrence of the failure AGENTS.md records
    from 2026-08-31. **Read what `git status` lists before a broad `git add`.**
