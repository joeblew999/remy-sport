# Plan — complete automated staging verification

Status: planned; implementation has not started. Requested 2026-09-07.
This is the authoritative plan for staging test parity. The existing
[rollout record](2026-09-07-03-staging-broadcast.md) describes completed deploys;
[relay investigation](2026-09-07-02-relay-capabilities.md) owns GAP-03.

## Outcome

One `bun run deploy -- --env staging` must build and publish the intended source,
run every staging-applicable user journey against that deployed build, verify
external integrations, clean up its own changes, and report success only when
all required phases pass. Admin and impersonation checks must run automatically.
No manual demo switch or silent capability-based skip may be needed.

Staging uses fixture data and its own Cloudflare resources. It runs the same
application and authorization rules as production, with explicit test support.
Parity means equivalent testable user behavior; Vite hot reload, a local mail
outbox, and local telemetry storage are not production deployment features.
Physical-device installation and camera permission behavior remain separately
reported manual evidence, never implied by a synthetic-camera pass.

## Verified gaps in the current tree

- `scripts/deploy.ts` runs `check` and browser tests locally before publishing,
  then runs deployed smoke only. Real video verification is a separate command.
- `src/environment.ts` defaults staging admin fixture sign-in to off.
  `tests/e2e/admin-console.spec.ts` and `tests/e2e/authz.spec.ts` skip when
  `ADMIN_SIGN_IN` is false. A missing required capability therefore looks green.
- `src/auth.ts` treats `TEST_ADMIN_OTP` as an enable flag and issues the ordinary
  derived code. Merely giving that secret a random value does not make admin
  login use a private code. The runner uses one code for all actors.
- `scripts/ops/demo.ts` changes Worker versions through secret writes and its
  status check probes a non-admin. That is insufficient proof that admin access
  was enabled or disabled. Its broad `off` also deletes ordinary demo settings.
- `scripts/e2e.ts` compares HEAD to the deployed short commit. Documentation-only
  commits already make unchanged app/test source fail this check. Dirty source
  only warns, so an exact commit label is not itself proof of artifact identity.
- `tests/e2e/seed.setup.ts` prunes sessions before seeding. The teardown revokes
  other sessions belonging to shared fixture users and ignores cleanup failures.
  Fixture accounts are also used by people walking staging, so this can interfere.
- CI in `.github/workflows/check.yml` currently runs local checks only. Its
  cancellation policy cannot simply be reused for a shared staging deployment.
- The two development-only suites explicitly skip remote runs. Those exclusions
  are legitimate, but must be distinguishable from missing admin coverage.

## Decisions

1. Keep the local gate and add a mandatory deployed verification phase. Reuse
   the existing runner and journey specs; do not create a second copy of them.
2. Give the automated staging run bounded admin fixture access. Implement an
   actual separate admin code and server-enforced expiry, restricted to staging
   test accounts. Normal production authentication and policy stay unchanged.
   Never print the code or expose it through the public account picker.
3. Use run-owned accounts and records for mutating journeys. Share read-only
   reference fixtures, not mutable identities or session state. Serialize the
   entire shared staging deploy/verify lifecycle, including local CLI invocations.
4. Keep real staging mail, queue, storage and relay bindings. Add controlled test
   recipients/sinks and integration probes where needed; do not replace external
   behavior with successful mocks to claim delivery.
5. Missing required test capabilities, unexpected skips, exhausted retries,
   source drift, and incomplete cleanup are failures. Reports distinguish a
   published build from a verified deployment.

## Implementation sequence

### 1. Define the executable coverage contract

- [ ] Inventory every current E2E case and integration probe; classify as local
  only, both local and staging, or deployed integration. Generate the report from
  runner metadata, not a manually maintained total of test counts.
- [ ] Run admin account listing, impersonation, exit, role changes, bans,
  non-admin refusal, role-based screens, identity refresh, persistence, scoring,
  account/device sessions, and error journeys on staging.
- [ ] Add journey assertions after impersonation: open a real role-specific page,
  reload it, check a permitted action and a denied one, then restore admin and
  prove cached data no longer belongs to the impersonated user.
- [ ] Exclude only the Vite entry and legacy dev-worker cases from the remote
  project, with named reasons. Test the built service worker separately below.
- [ ] Make required admin refusal fail preflight. Explicitly set the child
  process admin capability to true or false; never inherit a stale shell value.
- [ ] Add repository/unit checks proving the staging project selects the required
  suites and its report rejects missing tests and unexpected skips.

Acceptance: deliberately disabling admin support fails staging preflight before
journeys run; the report cannot call an admin-skipped run complete.

### 2. Make source and environment identity reliable

- [ ] Run deploy from an immutable snapshot of the intended committed source;
  reject unexplained dirty source for a release. Keep local development usable.
- [ ] Record full source revision, build ID and a deterministic digest covering
  application, migrations, model, dependencies, build configuration, and tests.
  Define exclusions narrowly for docs-only changes and validate that definition.
- [ ] Match deployed identity before and after remote verification. Permit
  documentation-only HEAD changes only when the tested source digest matches;
  never add a general mismatch bypass. Initial migration from older build
  metadata requires a fresh deploy, not a guessed match.
- [ ] Resolve and verify staging environment, hostname, account, Worker, D1,
  storage and queues before remote writes. Refuse production in the staging
  verification lifecycle regardless of ambient environment variables.

Acceptance: different app/test/config source fails; a docs-only commit succeeds
with matching digest; a deployment changing during the run invalidates results.

### 3. Automate admin test access and isolation

- [ ] Extend the existing auth policy to use a distinct staging admin test code
  with a bounded server-enforced expiry. Test that ordinary fixture codes cannot
  authenticate an admin, and expired access cannot issue new admin sessions.
- [ ] Pass the private code only to the test runner's admin login helper. Keep
  ordinary fixture login and the admin impersonation UI working as real flows.
- [ ] Establish exclusive ownership before enabling access. Refuse conflicting
  active runs or a pre-existing unmanaged override; do not overwrite unknown
  credentials. Do not use broad demo-off to delete unrelated configuration.
- [ ] Account for every secret update creating a Worker version: wait for the
  expected build and access state after setup and teardown, and record final
  deployment version. Use the existing secret mechanism, not a new public admin
  bypass endpoint. Preserve existing relay and auth credentials.
- [ ] Remove the run's override and revoke the sessions it created, including
  underlying admin and impersonated sessions. Disabling OTP alone does not end
  sessions. Verify refusal and session invalidation independently.
- [ ] Expiry must bound access after process death; add reconciliation for an
  interrupted run before the next run starts. Handle timeout, cancellation and
  setup failure with the same idempotent cleanup. A hard kill must not leave
  indefinite privileged sessions; test the chosen session expiry/revocation
  mechanism as well as the OTP deadline.

Acceptance: real staging admin login, impersonation and exit pass; normal users
cannot impersonate; forced interruption leaves no indefinitely valid test admin
access, and rerunning reconciles only the previous run's owned resources.

### 4. Make data and session cleanup dependable

- [ ] Create a unique run ID and private auth-state directory per target/run.
  Provision test actors with the model's required relationships using existing
  authenticated admin/domain operations where possible.
- [ ] Replace shared mutable fixture usage in role, ban, organisation, player,
  scoring and device tests. Reserve explicit fixtures for the read-only baseline.
- [ ] Remove blanket prune/revoke-other behavior from suite-wide setup/teardown.
  Device tests may revoke their own run-owned user's sessions as their subject.
- [ ] Track created rows, sessions and mutations by run; restore pre-existing
  state in guaranteed cleanup even when an assertion fails. Do not rely on
  INSERT OR IGNORE to repair altered fixture state.
- [ ] Replace swallowed cleanup errors with bounded retries, verified outcomes,
  and a nonzero result plus actionable recovery information when unresolved.
- [ ] Add a scoped stale-run reconciliation path; no global database reset and
  no production data import. Keep credentials and browser storage out of Git
  and reports; expire/delete local auth state after cleanup.

Acceptance: two consecutive full runs pass with no owned residue, a failed run
can be recovered, and a human's pre-existing staging session survives both.

### 5. Cover deployed behavior that local tests cannot prove

- [ ] Run deployed smoke, then all applicable browser journeys on WebKit and
  Chromium with mobile and desktop coverage selected deliberately.
- [ ] Add built-PWA checks with service workers enabled: manifest/icons/screenshots
  return correctly, shell installs into the worker cache, a fresh browser sees
  the current build, and a browser controlled by the previous deployed worker
  updates to the new build. Capture the previous-build browser before publish.
- [ ] Integrate `tests/integration/cloudflare-video.mjs` using run-owned game and
  actors. Require decoded frames in a separate watcher, healthy retention,
  capture stop and restart recovery. Ensure the CI browser/runtime supports the
  actual relay transport; browser installation is a pipeline prerequisite.
- [ ] Inventory email, push/queue, and storage user journeys against existing
  tests. Add deterministic staging delivery probes to controlled recipients,
  a subscribed test browser and an owned uploaded object; validate consumption
  and read-back, not just configuration or enqueue success. Add bounded waits
  and cleanup. Missing integration prerequisites fail their required phase.
- [ ] Keep GAP-03 explicit: the current Cloudflare probe proves media delivery,
  not per-game credential isolation. Link its separate closure criteria and
  require them before claiming private broadcasts are production-ready.

Acceptance: intentionally breaking the staged Worker, an external binding, or
asset delivery fails the corresponding named phase. Physical-device claims and
relay-isolation claims remain separate from browser-suite success.

### 6. Wire the lifecycle into deploy and CI

- [ ] Extend `scripts/deploy.ts` to orchestrate: local gate → staging ownership and
  test setup → prior-build PWA capture → staging build → migrate → publish →
  identity wait → fixture preparation → smoke → deployed journeys/integrations
  → guaranteed cleanup/access restoration → final identity/policy verification.
  Keep publication and verification outcomes independently visible.
- [ ] Make `bun run test:e2e -- --env staging` reuse the same setup/verify/cleanup
  lifecycle for an already deployed matching build. Do not duplicate lifecycle
  logic or rerun deployment implicitly.
- [ ] Add CI staging deployment/verification on trusted main revisions and a
  manual rerun entry. Provision only the required staging permissions and browser
  prerequisites. Untrusted PRs keep the existing credential-free local gate.
- [ ] Queue staging runs instead of cancelling an active remote mutation. The
  ownership mechanism must also protect CLI runs, not only GitHub jobs.
- [ ] Retain a redacted machine-readable result and useful browser artifacts:
  source/build/version, environment, tests expected/executed, skips, first-attempt
  failures and retries, integration evidence, cleanup and final access state.
  Exclude auth storage and capability-bearing URLs from traces/logs.
- [ ] Mark retry-recovered tests as flaky; do not silently advertise a clean pass.
  Final rollout acceptance below requires full runs without retries.
- [ ] If post-publish checks fail, exit nonzero and report that staging was
  published but verification failed. Do not auto-rollback across migrations.
  Preserve the failure evidence and reconcile test access/resources first.

Acceptance: the single deploy command and CI job cannot succeed after a remote
suite, integration or cleanup failure; production is untouched.

## Final verification and completion

- [ ] Pipeline failure-path tests cover missing admin capability, source mismatch,
  wrong environment, setup failure, browser failure, delivery timeout, cancellation,
  cleanup failure and an overlapping deploy attempt.
- [ ] Existing repository checks remain green; update misleading comments in
  deploy, demo, auth helpers and teardown to match final behavior.
- [ ] Run two complete staging deploy/verify cycles with retries disabled. The
  second exercises upgrade from a previously installed PWA. Every required test
  executes; only the explicit local-only exclusions remain.
- [ ] Perform an intentional controlled failed run and interrupted run, prove
  cleanup/recovery, then complete another clean verification.
- [ ] Commit/push implementation and the measured report; update the existing
  rollout record with deployed identity and remaining manual checks. Keep this
  plan's checklist current rather than adding a second progress document.

Full staging automation is complete when the lifecycle above passes. Production
promotion remains a separate deployment decision, with physical-device evidence
and the existing relay-isolation limitation stated accurately.
