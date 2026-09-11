# Working here

This file is short on purpose. What must hold is **checked** under `tests/repo/`,
not remembered — so read the checks, not a list of past incidents.

New here? [Working conventions](docs/working-conventions.md) has the handful of
rules a check cannot express, and why each one exists.

## Plans and context live in the tree

`docs/` holds every plan and all project context. Keep it tidy — a messy `docs/`
is how work gets lost between sessions and after a crash.

Many agents work on this repo, in parallel and in turn. **Never** put a plan, a
note or any project context anywhere else — not in a private memory, not in a
scratchpad, not in a chat. The next agent cannot see those, and what the next
agent cannot see does not exist. If it matters, commit it: a check under
`tests/repo/`, a comment beside the code it is about, or a file in `docs/`.

## Use the same automation as the team

Use the repository's documented CLI for setup, testing, deployment, seeding,
credentials and cleanup. Read `package.json` and the CLI help before you start.
Agents and developers run the same commands and get the same behaviour.

Do not bypass it — no inline scripts, no custom API calls, no direct Wrangler
commands, no hidden environment overrides, no temporary checkouts that dodge a
check. **A one-off success is not a fix for the team.** Never claim a workflow
works based on a private workaround that a developer cannot reproduce through
the documented command.

If the CLI cannot do the job, extend the CLI: fix it here, document it, test it,
then use it. Ordinary source editing and Git operations are not a substitute for
these workflows.

## The CLI must not require superhuman developers

Keep the surface small and the steps **linear**. If using it requires a developer
to coordinate steps by hand, that is bad design — fix the design, not the
instructions.

## Fix things as you go

Fix what you can along the way. If you cannot, **say so clearly** and make sure
it is fixed next. Call out tech debt whenever you find it; the goal is to never
let it accumulate.

Write for a reader in a hurry: plain words, short sentences, the answer first.
