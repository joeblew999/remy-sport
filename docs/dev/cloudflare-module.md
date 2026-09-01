# Cloudflare access: one module

Design record, written before any code moved. The decisions here are the ones
that are dangerous to make *during* a migration, so they are settled first and
separately.

## Why

Fifteen scripts talk to Cloudflare. `mise.toml` carries eighteen wrangler
invocations of its own. Nothing owns the boundary, so each caller re-decides
the same four things — credential, account, target environment, what an error
means — and roughly forty-five of them decide independently.

The credential rule alone exists in **three different shapes across seven
sites**: a shell block in five `mise.toml` tasks, a TypeScript env→fnox
fallback in `scripts/tunnel-setup.ts`, and a demand-or-explain in
`scripts/cf-audit.ts`. Config resolution is duplicated twice —
`scripts/cloudflare.ts` exports a resolved reader and `scripts/check-envs.ts`
imports wrangler's directly.

The cost is not untidiness. On 2026-09-01 the wrangler OAuth token turned out to
record `d1:write` while every account-scoped D1 call answered 10000, and every
other product answered normally on the same token. Only provisioning noticed,
because only provisioning distinguishes *"could not ask"* from *"absent"* —
that distinction lives in one function in `scripts/cf-provision.ts` and nothing
else can reach it. Fourteen other callers would have read the same failure as
"not there" and carried on. A day was lost and a bug was twice nearly filed
against Cloudflare.

## Decision 1 — `--env` is declared by the operation, never by a global rule

Two rules exist today and they contradict each other:

- `scripts/cf-provision.ts` demands `--env` always, plan and apply alike.
- `scripts/cf-d1.ts` states the opposite for part of its surface: a remote
  write requires `--env`; a local or read-only operation does not.

**`cf-d1.ts`'s rule is the correct one, and it does not become a single global
policy.** The module's target resolution takes the *operation's own
declaration* rather than applying one rule to everything.

Merging them wrong fails in two directions, and the second is the serious one:

- Make `--env` universally required and `setup` breaks — it runs local
  migrations and has never passed one.
- Make it universally optional and a remote write stops naming its target.
  That does not error; it silently resolves somewhere, and the somewhere is
  production. Same class as the `database_id` write that pointed production at
  the wrong database on 2026-08-20, and it fails the same way: quietly, doing
  the right thing to the wrong account resource.

The subtlety that must not be lost when this is implemented: **the provisioning
plan declares an explicit target even though it writes nothing.** Not because
it mutates — it does not — but because it must resolve identically to the apply
it describes. A plan that defaults while its apply demands is a plan describing
a different run from the one that follows it, which is the whole reason plan
and apply share one code path. The declaration is the operation's statement of
intent, not a fact mechanically derived from "does it write".

So the module never infers a target requirement from a command name, a
subcommand, or whether a call happens to mutate. Each call site says what it
needs, and the two spellings are distinct: *this operation requires an explicit
target*, and *this operation is local and needs none*.

## Decision 2 — the account id asserts, it does not merely provide

The account is pinned once in `mise.toml`'s `[env]`, and nothing verifies that a
caller actually reached that account. That is a latent bug, not untidiness: a
credential valid for a different account produces confident, wrong, successful
output.

Once the module owns the account id, a caller reaching Cloudflare against a
different one **refuses**. Cheap to implement, and the same family as the
could-not-ask/absent distinction — both are the module declining to let an
ambiguous answer read as a definite one.

## Decision 3 — "could not ask" is a module concern

The unreachable/absent distinction moves into the module and applies to all
fifteen callers, not just provisioning. This is the single highest-value part of
the work: it is what today's incident was, and it is currently one private
function away from every caller that needs it.

It pairs with the refusal rule already consolidated in
`scripts/cf-provision.ts`: an outcome that could not be determined refuses in
apply mode rather than being skipped.

## Decision 4 — scope boundary

Only Cloudflare-touching shell moves out of `mise.toml`. In practice that is
the `deploy` pipeline and `cf:wait`.

The 402 lines of shell in run blocks include `biz:sync` (78) and `dev` (58),
which have nothing to do with Cloudflare. Draining those is a different
argument, and bolting it on is what turns a landable refactor into a week of
work. They stay.

## Order

Each step lands as its own commit with a green deploy between them.

0. **Revert** the half-migrated shell-snippet attempt, so this starts clean.
   *(Done — it was never committed; a working-tree discard.)*
1. **Stand up the module and migrate `scripts/cf-provision.ts` only.** It
   already contains most of the surface, so this is mostly extraction.
   The old `cf-ensure` was not dead and was not deleted: no task invoked it,
   but it owned resolved-config reading and the `database_id` write, so it
   *became* the module — renamed to `scripts/cloudflare.ts`, which is where
   the boundary now lives. Its name was the problem, not its contents.
2. **Migrate the remaining clients, one per commit, in ascending risk:**
   `scripts/cf-demo.ts` → `scripts/cf-audit.ts` → `scripts/tunnel-setup.ts` →
   `scripts/cf-d1.ts` → `scripts/check-envs.ts` → `scripts/versions.ts`.

   The first three are off the deploy path. The last three are on it and go
   last, together, because each can block every deploy: `cf-d1.ts` runs twice on
   the path, `check-envs.ts` runs inside `check`, and `versions.ts` feeds
   `cf:wait`.
3. **Delete the thirteen unreferenced one-line wrangler aliases**, then collapse
   the `cf:d1:*` family into one task taking a subcommand.

## Where this can break the deploy

Four specific hazards, all on the path:

- **`scripts/versions.ts` feeds `cf:wait`.** `cf:wait` compares a `_generated`
  stamp against the origin. Change this script's output shape and the deploy
  hangs five minutes, then fails — with the new code already published. Migrate
  it last and diff its output before and after.
- **`scripts/cf-d1.ts` is on the path twice** — once inside `setup` (local
  migrations, no `--env`) and once as the pipeline's remote seed (with one). It
  is also where Decision 1 is cashed in. Getting that wrong breaks `setup` or
  points a remote write at production.
- **`scripts/check-envs.ts` runs inside `check`.** It reads config
  independently today; moving it onto the module's reader changes what it sees,
  and a false positive there blocks every deploy rather than one task.
- **Standalone remote-D1 tasks have no credential of their own.** They work
  inside `deploy` purely because the pipeline exports one and children inherit.
  Giving the module a resolver fixes that, but it changes the standalone tasks'
  behaviour in the same commit that changes the pipeline's.

Working in our favour: a credential mistake mid-migration now refuses rather
than silently skipping, so every hazard above fails loudly.
