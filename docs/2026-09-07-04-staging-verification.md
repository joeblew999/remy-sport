# Developer automation: findings and required fix

Status, 2026-09-07: CLI redesign stopped by the user. The current authorized
work is running the full staging browser suite through the shared CLI, repairing
its blockers, and recording results. No GitHub CI is wanted. Staging runner
and test cleanup repairs are in progress; the broader CLI redesign is not implemented. Earlier attempted rewrites were removed. The earlier
mise migration decision is withdrawn: it was presented before the workflow was
understood. No replacement tool has been selected or installed.

The requirement in `AGENTS.md` is a small, linear workflow. Developers must not
coordinate prerequisites, test access, seeding or cleanup themselves. Putting
existing operations under fewer command names does not meet that requirement.

## What is disconnected

| Developer's job | Current implementation | Work left to the developer |
| --- | --- | --- |
| Start developing | `package.json` starts Vite directly; `scripts/lib/prepare.ts` separately installs dependencies, generates bindings, prepares credentials, migrates local D1 and installs browsers. | Remember setup after prerequisites change. Preparation comments incorrectly say every command runs it. |
| Verify a change | The check script runs static checks, build, Worker/unit/repository and rendering tests. `scripts/e2e.ts` runs browsers separately. The former GitHub CI used different preparation; the user has removed it. | Know which commands make a complete local gate. |
| Ship to staging | `scripts/deploy.ts` runs the local gate and browsers, builds, migrates, publishes, waits for that build, seeds and smoke-tests. | Provision resources/secrets separately and run remote browsers separately. Successful deployment does not establish that staging browser tests passed. |
| Test admin impersonation | `scripts/e2e.ts` probes admin access and skips admin tests when refused, printing manual demo-on/off commands. | Enable access, wait for propagation, run tests and disable access afterwards. |
| Finish testing | `tests/e2e/seed.setup.ts` prunes sessions; `tests/e2e/auth.teardown.ts` revokes other fixture sessions and ignores cleanup failures. | Deal with interference with other people/runs using those fixtures. A green suite does not establish successful cleanup. |
| Change the model | `scripts/model.ts` already orders model pull/copy, migration generation, local migration and checks. | Decide whether schema changes are renames when Drizzle asks. Automation cannot reliably infer that semantic decision. |
| Maintain the project | `scripts/ops.ts` mixes deployment internals, model tools, dependency updates, asset generation and native builds. | Understand a second catalogue and distinguish prerequisites from deliberate maintenance jobs. |

The seed already comes from `src/db/seed.ts` and the domain model. Another seed
system is unnecessary. Local uses workerd/local D1 through Vite; staging uses
Cloudflare services. They need matching application behavior and fixtures for
applicable tests, not identical infrastructure or exposed development routes.

## Measured and inspected defects

- `bun run deploy -- --help` succeeds and confirms the pipeline ends at smoke.
- `bun run ops -- --help` attempts installation before help. It failed here with
  a sandbox temp-directory permission error. Source also classifies `--help` as
  unknown, which would return exit 1 after installation.
- `bun run test:e2e -- --help` succeeds but shows Playwright help without the
  wrapper's environment option. Source runs remote preflight before forwarding
  help when a remote target is named, so that help would contact a deployment.
- `scripts/ops/demo.ts` switches admin access but verifies ordinary-user access.
  Ordinary seeded access stays enabled on staging, so this cannot verify the
  admin switch. Its off action deletes both OTP settings.
- `scripts/e2e.ts` sets admin capability on success but does not clear an
  inherited capability on refusal. Preflight session cleanup ignores failure.

No remote command ran during this audit. Previous results are in
[the rollout record](2026-09-07-03-staging-broadcast.md), and do not establish
complete staging verification. The intermittent admin refusal remains
unexplained; propagation is a possibility, not a proven diagnosis.

## Implementation order and acceptance

1. Make development and complete local verification own their prerequisites;
   run verification on the developer’s machine, with no GitHub CI. Keep deliberate maintenance
   explicit, but remove prerequisite operations from the daily command surface.
   Do not retain an `ops` catalogue as the solution.
2. Make staging deployment own required resource preparation, publish readiness,
   existing seed, measured admin access, remote browser tests and checked cleanup.
   Resource creation cannot invent missing account credentials: identify missing
   input before dependent writes. Preserve pre-existing sessions/settings and
   prevent overlapping staging runs from modifying shared fixtures.
3. Prove this through the documented commands: fresh local preparation, complete
   local gate, two staging passes without retries or unexpected skips, and a
   controlled failing test proving cleanup and nonzero exit. Distinguish
   publication from successful verification in the result.

Retain the existing specialist tools while fixing their connections: Bun, Vite
and the Cloudflare plugin, Wrangler, Drizzle, Vitest, Playwright and fnox. mise currently pins tools/environment. A task runner or CLI parser can
provide invocation and ordering; it cannot supply the app's admin-access policy,
fixture ownership or assertions. Do not promise those from a tool choice.

Native builds and dependency/model updates are real workflows, not disposable
commands. New coverage is separate from running the existing suites correctly;
[relay isolation](2026-09-07-02-relay-capabilities.md) remains open. This work does
not establish physical-phone behavior or delivery paths the suites do not test.

Commander was proposed in conversation but was not adopted or installed. No
new CLI framework or task runner is part of the staging test repair.
