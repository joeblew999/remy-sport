# Working conventions

How agents work in this repo. These are the conventions a check cannot express —
everything here failed once as a real incident, and none of it is derivable from
the code.

This file is deliberately short. The rule that governs it is the first one below:
when something must not recur, make it a check and delete the prose. If you fix
something here by adding a check, delete the paragraph in the same commit.

## Make it a check, not a paragraph

A session that starts by reading past incidents reasons inside their framing and
repeats their conclusions instead of reading the code. On 2026-09-05 the Product
Owner deleted a ~45 KB `AGENTS.md` of accumulated traps and four plan files for
exactly that reason: "its based on old stuff and making you into an echo chamber
that cant improve the code."

So: when something must not recur, make it a check under `tests/repo/` — a type,
a `satisfies`, a test — and write no prose. What genuinely cannot be checked goes
in a comment beside the thing it is about, not in a central file. Do not add a
"trap" paragraph after every fix; that habit is what produced the file that was
deleted.

The worked example is `tests/unit/remote-cli.test.ts`. Its header carries the
whole story of the repo's one reliably flaky test — the measurements that ruled
out a race, the shared-tree cause, the `git archive HEAD` fix and the coverage
it trades away — beside the code it explains. Nothing about it belongs here.

## Fix the repo, not your way around it

When something makes a task hard — a helper that cannot be imported, a tool that
lost its task, an MCP that cannot launch its browser — fix it in the repo as a
mise task, a `scripts/lib/prepare.ts` step or a guard. Do not work around it with
a scratchpad script.

Other agents hit the same friction, and a workaround outside the tree helps
nobody while hiding the defect. Commit friction fixes as their own commits, with
the friction named.

When asked to fix an area, finish it. A half-migrated state is worse than none.

## Nothing lives outside the tree

Many agents work here, in parallel and in turn. What the next agent cannot see
does not exist — so never keep a plan, a note or any project context in a private
memory, a scratchpad or a chat. If it matters, it is committed: a check under
`tests/repo/`, a comment beside the code, or a file in `docs/`.

## Tick the plan boxes yourself

Working a plan in `docs/`: tick each `- [ ]` the moment its step is done and
proven, with the proof written beside it. Add a dated log line when the plan
closes.

On 2026-09-06 the Product Owner could not tell whether a plan was finished —
an earlier session had done four of six steps and ticked nothing, so the document
said the work was untouched. "you should be checking the boxes as the plan is
done, not me."

## Stage explicit paths, and prove the commit clean

The main tree is always dirty with someone else's work. Stage by explicit file
path, never `git add -A` or a bare directory, and verify the commit on a clean
checkout before pushing.

On 2026-09-08, commit `e9ce101` swept five of another agent's test files into an
unrelated commit. Their libraries were never committed, so `origin/main` failed
to typecheck on a fresh clone while the dirty local tree passed. "passes in my
tree" is unproven until a clean checkout agrees.

## Use the registry, do not reinvent the widget

Every generic GUI element is its shadcn registry item. Bespoke surfaces are only
the sport media ones: court board, live video, the game summary row.

The theme is the registry's, not ours. The preset recorded in
`components-lock.json` decides colour, radius and type; no parallel token system
beside it, no heading-face override, no hand-written dark palette.

The Product Owner, 2026-09-08: "I want to NOT reinvent wheels … we fucked up by
not using shadcn from the start", and minutes later "we are meant to be using
their theme not ours!!!"

Much of this is already mechanised — `tests/repo/registry.test.ts` holds copied
components to the lock, and `tests/repo/styles.test.ts` holds the stylesheet's
type rules. What those cannot judge is the decision to hand-write a component at
all. Check the registry before writing one.

## Answer the direct question in the turn it is asked

When the Product Owner asks something mid-task — "is it type checked?", "are we
going in circles?" — lead the reply with the answer, then carry on. Do not
continue with tool calls and fold the answer into a later summary; the silence
reads as evasion.

Scope claims honestly: say which dimension was audited and which was not, and say
plainly when a finding only surfaced because they pushed.
