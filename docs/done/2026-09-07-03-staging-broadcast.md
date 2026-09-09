# Staging broadcasting rollout

Archive: completed (2026-09-09). The requested staging verification finished. Ongoing isolation limits remain in ../2026-09-07-04-staging-verification.md.

Current work: [project index](../README.md). Original evidence follows.

Current result (2026-09-07): staging application `e1fa4dc` was verified by
**two full browser runs, each 42 passed, four development-only skips and zero
retries**. Temporary admin access was restored and verified disabled after
each run. See [final evidence](#final-result-two-consecutive-complete-passes)
and [current project status](../README.md).

The checkpoints below preserve the rollout history. Earlier failures,
missing access and pending commits are superseded where later results say so.

All environments use the same `main` branch; only environment configuration
differs. No feature branch is used for this rollout.

Development passed real-relay synthetic video delivery, stop/restart, and the
user's physical-camera Broadcast/Watch walkthrough. Production remains unchanged.

- [x] Fix deployment build selection: the gate creates a production artifact
  before the staging build, so choosing the first `dist/*/wrangler.json` can
  publish the wrong Worker. Require the requested Worker and pinned account.
- [x] Commit the reviewed pending relay implementation on `main`, including
  credential renewal handling, and credential-log redaction patch. Keep other
  shared working-tree changes outside this rollout's commits.
- [x] Pass the repository gate and local end-to-end checks for that checkout.
- [x] Build and deploy the staging Worker, preserving its dashboard-issued
  relay credentials. Verify the served build identity and deployment smoke.
- [x] Verify synthetic Broadcast/Watch delivery and stop/restart on staging.

Scope remains staging. Cloudflare's relay-wide credentials do not establish
per-game isolation; GAP-03 in the relay investigation remains open.

## Clean main verification

Committed main `dfe7b75` passed `bun run check`, including 285 rendering
checks, in an isolated checkout and database. The full local browser suite
passed all 41 checks on port 8788 with retries disabled. An earlier full run
had a login failure; the admin suite passed separately, then the complete
suite passed without concurrent builds. The cause of that earlier failure
was not established. Port 8787 remains available for the user's development.

The video probe now accepts an explicitly named staging target and checks
both its configured origin and the server's reported environment. It uses
existing staging fixture sign-in and never changes relay or auth secrets.

## Staging deployed and verified — 2026-09-07

- Main revision: `fbcd6c5bbabd2d7d894eec072b6ae137a27f96f6`.
- Served build identity: `2026-09-07T05:24:16.872Z`, confirmed through
  `/api/versions` with branch `main` and environment `staging`.
- Cloudflare version: `27f750bd-56e6-40df-879d-15a5df946312`.
- Worker: `remy-sport-staging`; origin:
  <https://staging-remy.ubuntusoftware.net>.
- Applied outstanding migration `0017_current_coach_access.sql` and the standard
  idempotent seed to `remy-sport-staging-db`. Existing secrets were preserved.
- `bun scripts/deploy/smoke.ts --env staging` passed all applicable checks;
  four checks were explicitly skipped by the existing staging/mail policy.
- `BASE_URL=https://staging-remy.ubuntusoftware.net bun tests/integration/cloudflare-video.mjs --env staging`
  passed actual video delivery, healthy-connection retention, capture/video stop,
  and watcher recovery after restart through the staging relay. The probe used
  Chrome's synthetic camera and cleaned up its broadcast and session.

Production was not deployed or reconfigured. Physical-camera staging delivery
has not been independently checked; the earlier user walkthrough was local.
Per-game relay credential enforcement remains GAP-03, so this rollout does not
claim private game-level isolation. Unrelated shared-tree changes remain pending.

## Full working-tree rollout — 2026-09-07

All 75 pending files were committed as `5b25d76` and pushed to `origin/main`
at the user's request. The full staging deployment pipeline passed: typecheck,
lint, build, model checks, 841 unit/repository/Worker tests, rendering checks,
local end-to-end checks, migration, publish, seed, and deployment smoke.
The smoke suite retained its four documented staging-policy skips.

- Staging `/api/versions` confirmed commit `5b25d76`, branch `main`, environment
  `staging`, and build `2026-09-07T05:31:59.111Z`.
- Cloudflare version: `3c7399f4-1de2-4e00-af3a-c79241dff9b4`.
- The staging synthetic-camera probe passed separate-page video delivery,
  healthy-connection retention, capture/video stop, and playback after restart.
- Production was not deployed. Physical-camera staging verification and the
  existing GAP-03 relay-isolation limitation remain as described above.

## Browser run from the normal checkout — 2026-09-07

Main `b1f9ffa` was deployed through `bun run deploy -- --env staging` with build
`2026-09-07T06:03:35.634Z`. The existing local gate and staging smoke passed.
The subsequent staging browser run used the existing E2E CLI with retries
disabled: 35 passed, 11 skipped (four development-only cases and seven admin
cases). This is not a complete staging browser pass.

An ad hoc wrapper enabled the staging admin override and successfully probed
admin login, but the E2E CLI's subsequent preflight refused admin login and
skipped those tests. The cause of that differing result is not established.
The wrapper removed its override afterward and observed fixed-code admin login
refused. It is not a supported team workflow and must not be repeated; the
shared CLI must own and verify the required lifecycle, as AGENTS.md now requires.

The earlier temporary checkout was removed after its 19 saved sessions were
verified signed out. The normal checkout's final auth teardown passed. Next:
reproduce and fix admin preflight through the shared automation before claiming
all staging-applicable tests pass.

## Shared staging browser workflow repair — 2026-09-07

The user stopped the wider CLI redesign and requested complete staging testing
through the team's commands, with no GitHub CI. Commits `98adfb6` and `e1fa4dc`
implement the staging repair and remove the GitHub workflow and Dependabot files.
No CLI framework or task runner was installed.

The shared E2E command now owns temporary staging admin access, measures actual
sign-in, restores the prior override, and verifies cleanup. It refuses to skip
admin tests after failed staging preflight. A run gets its own saved session
state; cleanup ends recorded sessions individually and verifies their original
cookies no longer authenticate. Setup no longer prunes other sessions. Role and
ban assertions restore their tested state in finally blocks.

Failures exposed on the old `b1f9ffa` deployment:

- The login-picker assertion assumed test admin access also made the admin
  publicly selectable. It now asserts that staging continues to hide that button.
- A redundant second admin preflight contradicted the first successful sign-in;
  it has been removed. The access probe measures the capability, and auth setup
  must still obtain a real admin session. The underlying intermittent refusal
  was not conclusively diagnosed.
- The role switcher requested the local outbox on staging. The application now
  uses the code supplied with the permitted account list, as the login picker
  already does. The failing role-switch assertion remains intact.

Actual failing runs returned nonzero and verified admin access disabled again.
The last old-deployment run had 41 passes, the role-switch failure, and four
explicit development-only skips. Regression tests additionally cover failure
restoration, preserving a pre-existing override, cleanup failure, and refusing
automatic test access on production.

The first deployment attempt stopped before publication: import-rule fixtures
were being written into src while another repo test scanned it. The fixtures
now overlay the real import graph in memory. The restarted gate passed all 847
unit/repository/Worker tests and 289 rendering tests. Final deployment and
remote results will be recorded below after completion.

Remaining scope limits: this is not the wider CLI redesign. There is no
cross-machine staging-run lock or automatic recovery after SIGKILL/power loss.
The ban test still uses the seeded player and can revoke that player's sessions
as part of the behavior under test. Removing broad teardown revocation does
not establish that every test preserves every pre-existing fixture session.

Staging was then published at `e1fa4dc`, build `2026-09-07T06:57:08.555Z`.
The local gate and smoke passed; remote verification initially failed, and the
CLI correctly reported “published, but verification did not complete.” The test
login helper could navigate before LoginPage's success redirect completed, so
it now waits for the login screen to leave. Player editing now awaits its actual
RPC save response and form completion before asserting the refreshed value.
The first added response wait incorrectly matched REST, causing a timeout; it
was corrected to match the browser's RPC request. Staging runs now use one
worker because the suite shares mutable seeded fixtures. Assertions remain;
retries remain disabled. The complete successful remote runs are recorded below.

### First complete pass

`bun run test:e2e -- --env staging --retries 0` exited 0 against deployed
`e1fa4dc`: **42 passed, 4 skipped, 0 failed**, in 2.1 minutes. The skips are the
two Vite entry tests and two development-service-worker tests. Every admin test
ran, including impersonation, stop impersonation, role/ban controls, non-admin
refusals and the repaired role switcher. Session teardown passed. The runner
verified the temporary admin override disabled and the deployed application
inputs still matching. The second consecutive pass also completed successfully, as recorded below.

### Final result: two consecutive complete passes

The same command ran again without changes to the tests: **42 passed, 4
explicit development-only skips, 0 failed**, in 2.3 minutes, exit 0. Both runs
used retries 0 and one worker, and both completed the admin and authorization
projects. Both checked session teardown and verified temporary admin access
disabled afterward. The final application-input comparison still matched the
live `e1fa4dc` deployment. Test/runner fixes are pushed in `f9d738f`.

The staging browser verification requested here is complete. The local gate
passed 847 unit/repository/Worker tests, 289 rendering tests, and its browser
suite before publication; remote smoke passed with its four existing policy
skips. No production deployment or GitHub CI run was used for this work.
The broader CLI and fixture-isolation limitations above remain explicitly open.
