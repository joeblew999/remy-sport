# Plan — the browser tier fails differently every time

Status: **done, 2026-09-10.** Two causes, both found by reading a trace rather
than guessing, both fixed and both proved. Step 8 — whether local runs should
retry — is left open on purpose and is now a real question with an informed
answer available.

1. **Vite re-optimising a dynamically-imported dependency mid-run** and
   reloading every open page, discarding whatever a test had navigated to.
2. **The people picker moving the submit button between `mousedown` and
   `mouseup`**, so the browser fired `click` on the form and nothing submitted.
   A product defect a reader meets too, not a test defect.

`bun run ops flake --runs 15`: **15 of 15**, against run 3 of 8 before.

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

## The cause, found 2026-09-10

**Vite re-optimises dependencies mid-run and reloads every open page.** The
first page to execute `import("virtual:pwa-register")` — a *dynamic* import, so
the initial dependency scan cannot see it — makes Vite discover
`workbox-window`, re-bundle, and broadcast a full reload:

```
[vite] (client) dependency optimized: workbox-window
[vite] (client) optimized dependencies changed. reloading
```

A test whose page is reloaded loses whatever the SPA had navigated to. It does
not error; it goes back to the URL the document was opened at and waits for an
element that will never appear, until the **per-test** budget expires.

### How it was found

`bun run ops flake` caught it on run 3 of 8. The trace shows the failing page
booting twice:

| | |
| --- | --- |
| 00:54:58.307 | `GET /` — first document |
| 00:54:58.480 | `GET /main.tsx` — first boot |
| 00:54:59.8 | five `/rpc/…` calls, all 200 — the app is healthy |
| 00:55:00.229 | `GET /dev-sw.js?dev-sw` → **-1**, cancelled |
| 00:55:00.258 | `GET /` — **reload**, 29 ms later |
| 00:55:00.281 | `GET /main.tsx` — second boot |
| 00:55:11.703 | `POST /rpc/games/get` — still alive, still on the game page |

The test clicked its team link at 00:55:00.28 — the same instant as the reload.
The click's hash navigation was discarded, the page came back at the `goto` URL,
and `tab-schedule` never existed. `[vite] connecting` and `Lit is in dev mode`
each appear twice in the console, confirming two boots.

Reproduced deterministically: wipe `node_modules/.vite`, start the dev server,
open one WebKit page. The **first** page fetches `/` and `/main.tsx` twice one
second apart; the second and third pages fetch them once.

### What was ruled out, and on what evidence

- **Vite HMR reacting to another agent's edit of the shared tree.** This was the
  leading theory going in, and it is wrong: Vite logs `[vite] page reload <file>`
  for an HMR reload and the console has no such line. The tree was also clean and
  untouched for the whole run.
- **The legacy `/sw.js` kill switch,** whose worker does `client.navigate()` on
  purpose. `/sw.js` is never requested in the trace — only `/dev-sw.js?dev-sw`.
- **`virtual:pwa-register`'s autoUpdate reload.** `main.tsx` supplies
  `onNeedReload`, which replaces `window.location.reload()` in that path.
- **The service worker claiming an uncontrolled page.** Five fresh WebKit
  contexts against a *warm* server: no reload, every time.

The `-1` on the service-worker script and the four
`Fetch API cannot load … due to access control checks` page errors are
**consequences** of the reload cancelling in-flight requests, not causes. WebKit
reports a fetch aborted by navigation that way, and reading them as CORS errors
is what sent the first hour in the wrong direction.

### Why it survived this long

- **`test:render` cannot see it.** It runs against a built bundle, which has no
  dependency optimiser. That is the clue the last draft called the strongest, and
  the reason it pointed here.
- **`dev-entry.spec.ts` cannot see it either.** It counts entry loads with
  `performance.getEntriesByType`, which is reset by the reload it is trying to
  catch. It is a guard against a self-importing entry, not against a second boot.
- **`expect: { timeout: 15_000 }` could never have helped.** The failure is
  `Test timeout of 30000ms exceeded` — Playwright's *per-test* budget, which is
  still the default 30s. Raising the assertion budget addressed a different
  number entirely.
- **This tier wipes `node_modules/.vite` before every run** — added 2026-09-09 to
  fix a genuine stale-hash problem. That fix is correct and guarantees a cold
  optimiser on every single run, which is what makes this fire every single run.
  One fix created the conditions for the other to be constant.

## What was left, stated as a question — and how it read before the answer

Kept as written on 2026-09-09, because the answer came from the last bullet in
this list and a plan that edits away its own reasoning teaches nothing. At the
time: after both fixes, one run in two still failed, the remaining cause was
**not known**, and this plan's first job was to find it rather than guess a
third time.

What was known:

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

**It was the answer.** A built bundle has no dependency optimiser, which is
exactly what distinguished the stable tier from the flaky one. The clue was
written down a day before it was understood.

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
- [x] **3 · Read the trace, not the assertion.** The failure message says an
      element was missing; the trace says what the page had actually received —
      whether the request was slow, failed, or never made. That distinction is
      the whole answer and is currently unknown.
      **Done 2026-09-10:** the trace said the page had received a *second copy of
      itself*. Table above. The assertion was never the subject.
- [x] **4 · Name the cause in this file before changing anything.** Same
      discipline that found the dep cache: measure, state, then fix. Two wrong
      theories have already been paid for.
      **Done 2026-09-10:** written above before a line of `src/` changed, with
      four ruled-out theories and the evidence for each — including the one this
      session started out believing.
- [x] **5 · Fix it, and prove the fix the way it was found** — the loop from
      step 2 run enough times to mean something, with the number written down.
      **Done 2026-09-10:** `optimizeDeps: { include: ["workbox-window",
      "workbox-precaching"] }` in `src/web/vite.config.ts`, bundling them at
      startup when no page is open to reload. Proved twice:
      - **Directly.** Wipe `node_modules/.vite`, cold start, open one WebKit
        page. Before: the first page fetches `/` and `/main.tsx` twice, and the
        server logs `dependency optimized: workbox-window` /
        `optimized dependencies changed. reloading`. After: once each, and the
        server logs no optimiser event at all.
      - **At the tier.** `bun run ops flake --runs 12`: runs 1–5 passed, run 6
        failed **for a different reason** — no second boot in its trace, and no
        optimiser line anywhere in its now-piped server log. See below.
      `bun run build` unchanged (exit 0, 369 precache entries).
- [x] **6 · The second cause: the form moves out from under the click.**
      Found by run 6 above, and *not* the same thing. **A `click` event only
      fires on the element that received both `mousedown` and `mouseup`. If they
      land on different elements the browser fires `click` on their nearest
      common ancestor instead — and a click on a `<div>` or a `<form>` does not
      submit anything.**

      `orgs.spec.ts:54` fills the add-member email, clicks submit, and waits for
      `org-members-error`, which never arrives. What the trace says:
      - The click completed — "performing click action / click action done" —
        and the submit button carries `__playwright_target__`, so Playwright's
        hit-target check passed. It aimed correctly and reported success.
      - The email held `nobody@example.invalid` at click time, so `required` was
        satisfied and constraint validation was not the blocker. (Nor was the
        combobox: it is not `required`.)
      - **No `addMember` request followed.** The mutation was never sent, so
        there was no error to render and the assertion was waiting for something
        nothing would produce.
      - The people picker's inline list carried `data-list-empty` during the
        fill and **not** during the click: `people.list` resolved in between.
        That list sits above the email field and the submit button, so
        populating it moves the button down by up to `max-h-56` — 224px.

      Proved against the engine, with no app, no server and no auth: a WebKit
      page with a form whose spacer grows during `mousedown`.
      ```
      shift during mousedown: false  → form: SUBMITTED   click fired on: BUTTON#go
      shift during mousedown: true   → form: no-submit   click fired on: FORM#f
      ```
      Which is the whole failure: a reported-successful click, no submit, no
      request, no error. It is timing-dependent because the window is the few
      milliseconds between the two mouse events, which is why it is rare.

      **This is a product defect, not a test defect.** A reader reaching for
      "Add" while the picker loads misses it in exactly the same way, and is
      told nothing. The fix is to stop the list changing the height of the form.
- [x] **7 · Prove step 6 the way step 5 was proved** — the shift probe green
      both ways, and the loop run enough times to mean something.
      **Done 2026-09-10:**
      - **The engine, both ways.** A WebKit form whose spacer grows during
        `mousedown` submits nothing and fires `click` on `FORM#f`; without the
        shift it submits and fires on `BUTTON#go`.
      - **A guard that fails without the fix.** `tests/render/meetings.spec.ts`
        asserts the send button does not move as the picker's list fills or
        empties. Reverted the fix: the button jumps 94px and the test is red.
        Restored: green. It polls until two reads of the box agree, because the
        dialog animates in and the first version of the test was measuring that
        instead — 623.2, 626.8, 628.5 across three reads with no interaction.
      - **The tier: `bun run ops flake --runs 15` → 15 of 15, no failure.**
        Against run 3 of 8 before cause one was fixed, and run 6 of 12 with only
        cause one fixed.
      `bun run check` green throughout: 1097 unit, 409 render.
- [ ] **8 · Then consider retries.** Once the cause is known and fixed, whether
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
