# Project status — start here

Reconciled 2026-09-07 against `ed0a672`, current source and committed evidence.
This is the current status index. Dated checkpoints describe what was true when
written; they do not override this index. No application tests, remote probes
or dependency upgrades were run for this documentation reconciliation.

## Active handover: shared Chrome browser (2026-09-07)

The user already installed the Playwright Chrome extension so the user and agent
can work together in the same visible browser. Do not ask them to install it again.
The existing `.mcp.json` / `playwright-mcp.json` launches a separate WebKit browser;
it does not configure this shared Chrome connection.

Registered the missing local Codex server using the supported CLI:
`codex mcp add playwright-chrome -- bun x @playwright/mcp@0.0.79 --extension`.
The command succeeded. The installed package's help confirms extension mode
connects to running Chrome/Edge. No extension token or automatic consent bypass
was configured. The existing repo browser setup was left intact.

The user is in **Codex CLI in a terminal**, not the desktop app. Do not give
desktop Settings instructions. Installed CLI: 0.153.4. Next: exit with `/quit`,
then run `codex resume --last` from this repo to reload configuration and resume
the conversation. Verify `playwright-chrome` tools with `/mcp`, then connect to
the user's chosen tab. `/mcp` lists tools; it is not a documented reload command.
Browser attachment has **not** been verified. The earlier Computer Use permission
error came from a different tool and does not diagnose the Playwright extension.
Official host setup: <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>.

## Completed and verified

| Work | Evidence and limits |
| --- | --- |
| Staging browser verification | Two consecutive full runs: **42 passed, four development-only skips, zero retries** per run. Admin impersonation, returning to admin, role switching and cleanup passed. [Rollout record](2026-09-07-03-staging-broadcast.md#final-result-two-consecutive-complete-passes). |
| Staging deployment | Last verified application: `e1fa4dc`, build `2026-09-07T06:57:08.555Z`. Later commits repair tests/runner and document results. Local gate: 847 unit/repository/Worker tests, 289 rendering tests and local browsers passed before publication. |
| Shared staging test command | The CLI enables and measures temporary admin access, runs tests serially, restores prior access and verifies cleanup. The public admin login button remains hidden. [Behavior and remaining limitations](2026-09-07-04-staging-verification.md). |
| Coach access and session revocation | Coach grant corrections and browser device-revocation journeys are implemented. These do not close every permission/state combination. [Domain register](2026-09-07-01-react-domain-coverage.md). |
| Shared UI action gates | `Can`/`PlatformCan`, gate checks and a team-page permission matrix exist. Whole-app matrices and reveal mode are not complete. [Gate record](2026-09-06-03-one-gate.md). |
| Basic broadcasting | Recorded synthetic-camera delivery/stop/restart passed locally and on staging; the user confirmed a local physical-camera walkthrough. This does not prove per-game relay credential isolation. [Relay evidence](2026-09-07-02-relay-capabilities.md). |
| Tooling cleanup | TypeScript 7, Cloudflare Vite integration and repo-based copy/import checks landed. GitHub CI and Dependabot were removed by request. No Commander or mise task migration was adopted. |

## Remaining work

| Priority / state | Work | Where to continue |
| --- | --- | --- |
| Next independent product work | Review existing behavior one domain slice at a time: exact fields, relationships, permitted/refused actions, persistence and delivery. The committed report has **1,375 items: 64 classified, 1,311 unreviewed**. Unreviewed does not mean broken or unimplemented. | [Domain register, GAP-01 and GAP-05–08](2026-09-07-01-react-domain-coverage.md#work-register-and-execution-order); [generated inventory](react-domain-coverage.md). |
| Open relay work | Choose and prove a per-game credential design, including cross-game denial, expiry/revocation and browser transport compatibility. Ordinary relay setup is working; the old missing-token/403 blockers are historical. | [Relay investigation](2026-09-07-02-relay-capabilities.md#current-work). |
| Planned product features | Listing moderation before new public draws/rankings, then bracket generation/viewing, ranking history and AI bracket suggestions. These are **five model actions in four feature groups**, with accepted rules but implementation pending. | [GAP-09–12](2026-09-07-01-react-domain-coverage.md). |
| Open usability/coverage | Broaden phone/desktop, keyboard and English/Thai/Japanese review; permission/state matrices across surfaces; service-worker navigation/offline/update behavior. Existing passing cases do not establish exhaustive coverage. | Domain GAP-06–08; [who sees what](2026-09-06-02-who-sees-what.md). |
| Open test isolation | Cross-machine staging-run coordination, recovery after forced termination/power loss, and removing the ban test's effects on shared fixture sessions. These were not solved by the successful serial runs. | [Staging limitations](2026-09-07-04-staging-verification.md#still-open). |
| Needs recheck, not a confirmed current defect | Earlier Vite-config restart crash and the coach profile's insufficient content. Bundle-size and deprecated build-option warnings were also recorded. | [GUI walk](2026-09-06-01-gui-walk.md); [tooling history](2026-09-05-01-modern-tooling.md). |
| Stopped | Wider CLI redesign and automatic preparation of every workflow. Do not restart from the historical plan without a new task. | [Automation status](2026-09-07-04-staging-verification.md). |
| Deliberately excluded | GitHub CI/Dependabot. Dependency updates are local work; a future Vitest major requires a fresh compatibility check, not an automatic upgrade from an old checkbox. | [Dependency history](2026-09-05-02-latest.md). |

## Which document owns what

- This file owns the current overview and links; update it when a work item's status changes.
- The domain register owns detailed feature/coverage acceptance and dependencies.
- The staging rollout owns deployment and test-run evidence; the relay record owns media evidence.
- The generated inventory comes from its evidence ledger. Do not hand-edit its counts or promote classifications because unrelated tests passed.
- The September 5 tooling plans and September 6 GUI proposals are historical references. Their original checklists are not a second backlog. [Fewer dependencies](2026-09-05-03-fewer-dependencies.md) is completed history.
