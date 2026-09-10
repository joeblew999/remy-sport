# Staging automation — completed work and remaining limits

Status: **standing record, not a plan.** The staging verification task it was
opened for is complete and the wider CLI redesign was stopped by the user; what
remains is a record of limits — cross-machine coordination, forced-termination
recovery, shared-fixture effects — that other plans cite as *the automation
record*. It stays here so those citations resolve, and it does not close.

Reconciled 2026-09-07. Start with [project status](README.md). The staging
verification task is complete; the wider CLI redesign was stopped by the user.
No GitHub CI, new CLI framework or task runner is part of this work.

## Completed

- `bun run test:e2e -- --env staging --retries 0` owns temporary admin access,
  measures actual sign-in and refuses to silently skip admin tests.
- Staging tests run serially using the existing domain seed. Each run records
  its sessions and verifies their cleanup. Broad session pruning/revocation was
  removed from setup/teardown; tested role/ban changes use finally restoration.
- The runner restores the pre-existing admin override state and verifies it.
  The public login picker hides the admin even while tests can sign in as admin.
- `bun run deploy -- --env staging` now includes the remote browser suite after
  publish/readiness/seed/smoke. Failed verification reports that publication
  happened but verification did not complete.
- Source comparison permits test/documentation repairs against unchanged
  deployed application inputs; application changes require deployment.
- Two consecutive remote runs passed: **42 passed, four development-only skips,
  zero retries** each. Admin tests, session cleanup and restoration to disabled
  admin access passed. Failure runs also returned nonzero and restored access.

The [rollout record](2026-09-07-03-staging-broadcast.md#final-result-two-consecutive-complete-passes)
contains commits, counts, the discovered application bug and its fix. These are
recorded results, not a new external verification performed for this doc update.
Local and staging use different infrastructure; applicable application behavior
and seed data are shared. Staging does not expose the local mail outbox.

## Still open

- No cross-machine staging-run lock or automatic recovery after SIGKILL/power loss.
- The ban test still acts on a seeded player and can revoke that player's
  pre-existing sessions. Individual teardown is not proof of total fixture isolation.
- Setup remains separate from development; the local check command and browser
  suite remain separate. Remote resource/credential preparation is still separate
  from deployment. The larger linear CLI redesign is stopped, not completed.
- The old ops help/install behavior and standalone demo on/off verifier remain
  legacy defects. The repaired staging runner does not use that demo workflow.
- The original intermittent contradictory admin preflight was not conclusively
  diagnosed. The duplicate probe was removed; real admin setup and complete
  browser journeys now pass. Do not label propagation as a proven root cause.

## Decisions retained

Use the team's documented commands, with setup and cleanup inside shared code;
no ad hoc API wrappers or temporary checkouts to bypass checks. Keep the existing
Bun, Vite/Cloudflare plugin, Wrangler, Drizzle, Vitest, Playwright and fnox tools;
mise pins tools/environment. Commander was proposed but not adopted or installed.
The earlier mise task migration proposal was withdrawn. GitHub CI and Dependabot
were removed. Native builds and model/dependency maintenance remain real work;
no command renaming or deletion is authorized by this reconciliation.

## Verification findings — 2026-09-09 team-tabs run

The full local check hit two 5-second Worker timeouts in `tests/worker/me.test.ts`
and `tests/worker/projection-equivalence.test.ts`, plus the current notification
style violation. Rendering was also running on this machine; these timeouts
need a serial recheck before being called application defects. The full browser
suite reported an organisation unknown-email assertion failure in
`tests/e2e/orgs.spec.ts`; the team navigation failure was a stale exact-href
selector after the trail began adding query parameters, corrected in the team
work. No whole-gate pass is claimed.

The browser CLI also interprets a positional spec path as another project after
its final `--project authz` argument. A focused run via the supported `--grep`
option works; positional forwarding needs a CLI fix and regression test before
claiming all Playwright options are passed through.
