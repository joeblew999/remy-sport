# Plan — the browser tier fails differently every time

Status: proposed 2026-09-09. Evidence collected; no fix attempted yet, and the
distinction matters — two *environmental* causes were found and fixed on
2026-09-09, and what remains is the part that was not explained.

`bun run test:e2e` passes, then fails, then fails differently, with nothing
changed between runs. It has cost at least six deploy attempts.

## The evidence

Every failure observed on 2026-09-09, in order, on one unchanged tree:

| Run | Result | Spec |
| --- | --- | --- |
| deploy | 3 failed | `connected-gui:31`, `orgs:87`, `spa-login:61` |
| deploy | 3 failed | `connected-gui:4`, and two others |
| local | 49 passed | — |
| local | 49 passed | — |
| deploy | 2 failed | `connected-gui:4`, `devices:62` |
| local | 6 passed (`connected-gui` alone, 18s) | — |
| local | 2 failed (`connected-gui` alone, 42s) | `connected-gui:4` and one more |
| local | 49 passed (1.5m) | — |
| local | 1 failed (1.9m) | `orgs:32` |
| deploy | 49 passed | — |

**A different spec nearly every time.** That is the signature of an environment
problem rather than a broken test, and it is why "run it again" has been the
response and why that response keeps costing deploys.

Note the pairing of the two `connected-gui`-alone runs: 6 passed in 18 seconds,
then 2 failed in 42 seconds, same command, same tree, minutes apart. Whatever
this is, it correlates with the run being slow rather than with any assertion.

## What was already found and fixed, so nobody looks for it twice

Both landed 2026-09-09 in `playwright.config.ts` and both were proved before
being changed:

- **A stale Vite dependency cache.** Vite pre-bundles dependencies under
  content-hashed names and re-optimises after ordinary editing. A page holding
  the previous HTML then requests a hash that no longer exists: the dep
  directory held one build of `libav` while the page asked for an older one, the
  app failed to load, and the specs failed somewhere that looks nothing like a
  cache. The webServer command now removes the dep directory, which is the same
  isolation rule the tier already applied to its storage.
- **A five-second assertion budget.** These tiers run against a dev server that
  compiles a route on first request, and the app fetches `/api/reference`
  before it can render a label. Raised to fifteen seconds. This hides nothing:
  an expect timeout governs only how long a *failing* assertion waits.

**Step 1 cost a deploy verification, which was worth knowing.** Turning tracing
on edits `playwright.config.ts`, and `scripts/e2e.ts` refuses to test a remote
origin when the tree differs from what is deployed — it classed that file as
application code. The refusal printed `staging is running e5ee560, and HEAD is
e5ee560`, the same hash twice, and advised checking out the commit already
checked out. Fixed on 2026-09-10 in the same commit as this step: the Playwright
configs are exempt (they are `tests/` in everything but location, and nothing
bundles them), and the refusal now names the files that tripped it. A guard that
cannot say what it caught is one people re-run instead of read.

**Two things were also wrongly blamed and are recorded so they are not chased
again.** The web-server readiness budget was raised from 60s to 180s on the
theory that seed growth had made startup marginal — then the server was timed
and starts in **10 seconds**. And `orgs.spec.ts` mutating `adisorn.b@bat.test`
was blamed on contention with specs signed in as that actor; those specs use
only that actor's *storage state*, which does not change org membership. Neither
was the cause.

## What is left, stated as a question and not an answer

After both fixes, one run in two still fails. The honest position is that the
remaining cause is **not yet known**, and this plan's first job is to find it
rather than to guess a third time.

What is known:

- `fullyParallel: true`, `workers: 2`.
- `retries: process.env.CI || !isLocal ? 2 : 0` — **local runs get no retries**,
  so a single flake fails a deploy. Staging and CI get two.
- `trace: "on-first-retry"`. Combined with the line above that means **no
  local failure has ever produced a trace**, which is why ten runs of evidence
  amount to a list of spec names and nothing about what the pages were doing.
- The failures cluster on assertions that follow either a navigation or a
  mutation — the first moment a page needs data it does not yet have.
- `test:render` covers the same screens against a **built** bundle and is
  stable at 408 passed, as is the unit tier at 1062. Whatever this is, it is
  specific to the dev-server tier.

That last point is the strongest clue available and the reason to suspect the
environment rather than the product.

## The decisions

| Question | Decision |
| --- | --- |
| Add retries locally to make deploys green? | **No.** That converts a known problem into an unknown one and would have hidden every fact in the table above. The tier's value is that it fails. |
| Chase each failing spec? | **No.** Six specs have failed once or twice each; fixing them one at a time treats the symptom and there is no evidence any individual test is wrong. |
| Then what first? | **Make one failure reproducible.** Everything above is a sample of one run. A loop that runs the tier until it fails, keeping the trace, turns this from anecdote into a thing that can be read. |
| Is the dev server the suspect? | It is *a* suspect and the leading one, but it has not been demonstrated. A Playwright trace would record what the page was actually doing — and none exist, which is step 1. |

## Steps

- [x] **1 · Turn tracing on for the loop, because there is none today.**
      `trace: "on-first-retry"` and `retries: 0` locally are mutually exclusive:
      a trace is written on the first retry and there is no first retry, so
      **every local failure this session produced no trace at all** — checked,
      there are none on disk. The loop must run with tracing forced on, or the
      next step is impossible. This was a hole in this plan's own first draft.
      **Done 2026-09-10:** `trace: "retain-on-failure"` in `playwright.config.ts`
      — records every test, keeps the recording only when one fails, so a green
      run leaves nothing behind.
- [x] **2 · Reproduce on demand.** A loop that runs `test:e2e` until it fails,
      keeping the trace and the webServer log for the failing run, and recording
      how many runs it took. Without this the rest is guesswork.
      **Done 2026-09-10:** `bun run ops flake` — `scripts/ops/flake.ts`. Runs a
      tier until it fails, copies `test-results`, `playwright-report` and the
      output into `.playwright/flake/<timestamp>-<tier>/`, prints the
      `show-trace` command. `--runs N`, `--tier render`, and `-- <filter>` to
      pass a spec filter through. It stops at the first failure: the point is to
      catch one, not to measure a rate.
- [ ] **3 · Read the trace, not the assertion.** The failure message says an
      element was missing; the trace says what the page had actually received —
      whether the request was slow, failed, or never made. That distinction is
      the whole answer and is currently unknown.
- [ ] **4 · Name the cause in this file before changing anything.** Same
      discipline that found the dep cache: measure, state, then fix. Two wrong
      theories have already been paid for.
- [ ] **5 · Fix it, and prove the fix the way it was found** — the loop from
      step 2 run enough times to mean something, with the number written down.
- [ ] **6 · Then consider retries.** Once the cause is known and fixed, whether
      local runs should retry is a real question with an informed answer. It is
      not one now.

## Not in this plan

- **Raising timeouts further.** Fifteen seconds is already generous for a
  local page. If that is not enough, the problem is not patience.
- **Reducing `workers` to 1.** It would probably help and it would also hide
  the cause, cost every run time, and leave the tier fragile the day it goes
  back up.
- **The reference payload.** It is one input to the timing and it has its own
  plan — [`/api/reference` should send one language](2026-09-09-17-reference-payload-per-locale.md).
  It is not established as the cause here, and this plan should not assume it.
