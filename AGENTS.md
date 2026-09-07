# Working here


`AGENTS.md` is short on purpose:
what must hold is checked under `tests/repo/`, not remembered.

fix things along the way if you can. If you cant then make sure you tell me and make sure the broken things or badly done things is fixed next. I want to avoid tech debt all the time. Communicate when you find tech debt.

Communicate in a way that is easy to understand.

docs folder has all your plans, etc so you can pick up things in case your crash or between sessions.  its vital you manage the docs folder so its does not get into a mess !!!

Many agents work on this repo, in parallel and in turn. Never save a plan, a
note or any project context outside it — not in a private memory, a scratchpad
or a chat. What is there is invisible to the next agent, and what the next agent
cannot see does not exist. If it matters, it goes in the tree and is committed:
as a check under `tests/repo/`, as a comment beside the code it is about, or
as a file here.

Plans must go into the docs folder.

## Use the same automation as the team

Use the repository's documented automation CLI for setup, testing, deployment,
seeding, credentials and cleanup. Read `package.json` and the CLI help first.
Agents and developers must use the same commands and get the same behavior.

Do not replace or wrap those workflows with inline scripts, custom API calls,
direct Wrangler commands, hidden environment overrides, or temporary checkouts
that bypass a CLI check. A one-off success is not a fix for the team.

If the CLI cannot do the required job, fix or extend the CLI in the repository,
document and test that change, then use it. Keep setup, verification and cleanup
in that shared automation, including failure handling. Never claim a workflow
works based on a private workaround that developers cannot reproduce through
the documented command. Ordinary source inspection, editing and Git operations
are not replacements for these application workflows.
