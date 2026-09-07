# Plan — run the existing browser tests on staging

Status: planned; implementation has not started. The attempted CLI rewrite was
removed. The tool decision below supersedes the Bun-script orchestration assumed
by the steps that follow; those steps describe required behavior, not final commands.

## Tool decision — 2026-09-07

Use mise for tool versions AND task orchestration. It is already installed and
used by CI; its declared dependencies, ordered tasks, task help and dry runs
replace orchestration implemented by custom command dispatchers. This explicitly
revises the earlier no-mise-tasks decision in the modern-tooling plan.

Keep Bun for dependencies and TypeScript execution; Vite with the Cloudflare
plugin for development/build; Wrangler for Cloudflare operations; Vitest and
Playwright for tests; fnox for the existing local secret workflow; GitHub Actions
to invoke the same mise workflows in CI. Do not add another task runner or build
a replacement CLI framework. Domain-specific code remains only where these tools
do not supply the required behavior, including fixture policy and test-access
verification. Tool selection does not itself fix those application-specific gaps.

Sources checked: [mise task execution](https://mise.jdx.dev/tasks/running-tasks.html),
[task configuration](https://mise.jdx.dev/tasks/task-configuration.html).
No task migration or tool upgrade was performed when recording this decision.

## The fix

`bun run deploy -- --env staging` already checks the app locally and publishes
staging. Extend it to run the existing browser suite against the deployed app,
including admin impersonation, before reporting successful verification.

Use the existing deploy script, E2E runner and tests. Keep production policy
unchanged. Keep Vite entry and development-worker tests local, because those
features do not exist in a deployed build.

## Three steps

- [ ] **Prepare staging test access.** Automate the existing staging admin test
  switch and confirm a real admin sign-in succeeds. Make unavailable admin access
  fail preflight instead of skipping admin and authorization suites. Set the
  runner's measured admin capability explicitly, without inheriting shell state.
- [ ] **Run the existing tests after publish.** After migration, publish, build
  readiness and seed, run `bun run test:e2e -- --env staging` alongside the
  existing smoke verification. Require the deployed source/build to match the
  source being tested. Run against the deployed revision; documentation-only
  HEAD changes do not justify bypassing the identity check or designing a new
  source-digest system for this fix.
- [ ] **Clean up and report honestly.** Restore the test-access state owned by
  this run, end its test sessions, and verify the result on success and failure.
  Tests or cleanup failing must return nonzero. Report "published, verification
  failed" when that is what happened. Do not roll back database migrations
  automatically or delete unrelated secrets.

## Existing problems to fix as part of those steps

These are concrete prerequisites, not a new test framework:

- `scripts/ops/demo.ts` verifies a non-admin and its broad off action deletes
  both demo secrets. Verify admin access directly and change only the staging
  override owned by the run. Secret writes create Worker versions: wait for
  propagation and confirm the build is still the intended one after cleanup.
- `TEST_ADMIN_OTP` currently enables the ordinary fixed code; its value is not
  the admin code. Do not describe it as a private admin credential. Limit the
  automatic switch to fixture-only staging, handle normal cancellation, and
  detect unfinished setup before starting another run. Do not claim a finally
  block guarantees recovery from a killed process.
- Shared fixture teardown currently revokes other sessions and hides errors.
  Limit cleanup to sessions/mutations created by the suite, restore changed
  roles and bans even after failed assertions, and surface failed cleanup.
  Prevent overlapping staging runs while they share mutable fixtures.
- Fix any failures exposed by running the existing suite remotely. Preserve
  the assertion unless evidence shows it tests a development-only behavior.

## Done when

- [ ] One staging deploy command runs all existing staging-applicable browser
  tests, including admin impersonation and non-admin refusal, without a manual
  demo command or unexpected skips.
- [ ] Two consecutive staging runs pass with retries disabled, and a controlled
  failing run proves cleanup runs and verification returns nonzero.
- [ ] Tests leave pre-existing staging sessions intact and restore their own
  changes; final admin test-access state is verified.
- [ ] Relevant repository checks pass. Commit and push the implementation and
  record actual results in the existing [rollout record](2026-09-07-03-staging-broadcast.md).

## Separate follow-up

New PWA upgrade coverage, additional email/push/storage delivery probes, a new
CI deployment workflow, and a broader move to run-owned fixtures are deferred.
Revisit them after the existing suite runs reliably on staging; this change does
not claim those new capabilities. Real video delivery keeps its existing probe.
The [relay isolation investigation](2026-09-07-02-relay-capabilities.md) remains
open independently. Physical-phone verification remains manual.
