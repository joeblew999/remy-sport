# Project status — start here

## Active GUI plan

[Convert the GUI to shadcn](2026-09-08-01-typography-and-design-system.md)
is the current GUI work, under the Product Owner's rule of 2026-09-08: no
reinvented wheels, and their theme, not ours. Done and committed: Stage A,
B1 (shadcn's setup, the lock, the MCP server), the shell, the forms, and on
the same day every list, table, card, page frame, dialog and input, with our
own tokens removed for the preset's (`d2ae514`, `b97f92f`, `00286b2`,
`4f964f1`, `228a3c3`, `7461a5a`). The stylesheet is shadcn's output plus
three rules that say why. The gate is green: 898 unit/repository/Worker
checks, 334 rendering checks, 49 end-to-end checks with cleanup, 222
captures in light and dark. Accepted by the Product Owner on 2026-09-08
("it all looks fine") and deployed to staging as `e9ce101`; verified there
on 2026-09-09: 45 passed, four development-only skips, sessions ended.

[The top of the page on a phone](2026-09-08-02-mobile-top-of-page.md) is
complete: every step is delivered by the shadcn plan and ticked.

[GUI consistency plan](2026-09-07-06-gui-consistency.md) records the latest completed GUI work.
Status: implemented and verified locally, with a desktop Devices screenshot
limitation recorded as the next capture fix below. It aligns
page layout, controls, forms, feedback and responsive behavior across existing
screens. Final gate: 851 unit/repository/Worker checks, 312 rendering checks;
all 49 real-browser checks passed with cleanup.

[Connected GUI plan](2026-09-07-05-gui-connections.md) owns the completed foundation:
stable contextual navigation, game details, division-correct competition views,
linked teams/players/places and a compact shared shell. Implemented and verified
locally: 849 unit/repository/Worker checks, 295 rendering checks and all 49
end-to-end checks passed, including session cleanup. It provides concrete
journeys for domain GAP-05–08 without claiming exhaustive domain coverage.

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
desktop Settings instructions. Installed CLI: 0.153.4. After the terminal reload,
the `playwright-chrome` tools became available and `browser_tabs` with
`action: "list"` succeeded, returning tab 0 (current) at `about:blank`.
The user chose `http://localhost:8787` for the shared walkthrough. Started the
existing `bun run dev` command after connection refused; Vite became ready and
its local seed succeeded. Navigating through Playwright now shows **Remy Sport**
at that URL, with Discover, Live now, Teams, Organisations and Sign in visible;
the browser reports zero console errors (one development warning).
The user selected `/#/event/evt_002` and reported a bad layout. The first layout
pass reduces the title/header spacing, aligns tab content with the header,
uses four stat columns, aligns standings headers with their data, and separates
live team names and scores. Fixed the accompanying progress bug: live scores
were counted as finished games (22 instead of 18). TypeScript and both existing
event-overview phone rendering tests pass; desktop Chrome was visually checked.
Existing bundle-size/deprecated-build-option warnings remain recorded debt.
The subsequent connected-GUI implementation and final local verification are
recorded in the active GUI plan above. Next: review that live flow with the user.
Do not repeat installation or registration.
For future configuration reloads, `/quit` then `codex resume --last` resumes the
conversation. `/mcp` lists tools; it is not a documented reload command.
The earlier Computer Use permission error came from a different tool and does
not diagnose the Playwright extension.
Official host setup: <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>.

## Completed and verified

| Work | Evidence and limits |
| --- | --- |
| Connected GUI | Games replaces Overview/Schedule; independent division rankings; linked games, teams, players and places; URL/Back context. Final local gate and 49 browser checks passed. [Implementation and limits](2026-09-07-05-gui-connections.md#implementation-record--2026-09-07). |
| Staging browser verification | Latest, 2026-09-09 against `e9ce101`: **45 passed, four development-only skips, no retries**; admin impersonation, role switching, session cleanup and the restore of admin access passed. Earlier: two consecutive runs of 42 passed. [Rollout record](2026-09-07-03-staging-broadcast.md#final-result-two-consecutive-complete-passes). |
| Staging deployment | Last verified application: `e9ce101`, build `2026-09-08T07:38:13.662Z`. Local gate before publication: 898 unit/repository/Worker tests, 334 rendering tests, 49 browser checks. The deploy's own verification step reported "browser failed" because the shell's Bun was 1.3.14 against the 1.4.0 pin; repeated under the pinned Bun it passed. `scripts/lib/bun-pin.ts` now refuses an unpinned Bun before any command; that guard is committed, not yet deployed. |
| Shared staging test command | The CLI enables and measures temporary admin access, runs tests serially, restores prior access and verifies cleanup. The public admin login button remains hidden. [Behavior and remaining limitations](2026-09-07-04-staging-verification.md). |
| Coach access and session revocation | Coach grant corrections and browser device-revocation journeys are implemented. These do not close every permission/state combination. [Domain register](2026-09-07-01-react-domain-coverage.md). |
| Shared UI action gates | `Can`/`PlatformCan`, gate checks and a team-page permission matrix exist. Whole-app matrices and reveal mode are not complete. [Gate record](2026-09-06-03-one-gate.md). |
| Basic broadcasting | Recorded synthetic-camera delivery/stop/restart passed locally and on staging; the user confirmed a local physical-camera walkthrough. This does not prove per-game relay credential isolation. [Relay evidence](2026-09-07-02-relay-capabilities.md). |
| Tooling cleanup | TypeScript 7, Cloudflare Vite integration and repo-based copy/import checks landed. GitHub CI and Dependabot were removed by request. No Commander or mise task migration was adopted. |

## Remaining work

| Priority / state | Work | Where to continue |
| --- | --- | --- |
| Next GUI debt | The shadcn conversion is accepted and on staging. Left from its run logs: Base UI warns that an uncontrolled FieldControl changed its default value on the coach's squad edit from the player page. The Bun-pin guard is a deployment input, so the next staging test run needs a deploy first. | [Convert the GUI to shadcn — log](2026-09-08-01-typography-and-design-system.md#log) |
| Next capture fix | Desktop Devices screenshots intermittently stall in WebKit after data and fonts load. This reproduced in the baseline before the GUI migration; phone captures work. Context cleanup now retains a trace, and the CLI cleans up sessions/storage on failure. Do not call the whole screenshot walk verified. | [GUI consistency implementation record](2026-09-07-06-gui-consistency.md#implementation-record--2026-09-07); reproduce with `bun run shots -- --grep 'devices · ja · desktop' --trace on`. |
| In progress: separate automation work | Finish and commit the existing local-browser isolation edits. The working-tree CLI now uses 8788 and per-run storage; GUI verification observed startup, seed, session cleanup and storage removal. Lint import-time validation was corrected during GUI work. Developer data/session preservation and broader failure handling still need their own evidence. Keep `bun run dev` as the developer entry point without manual coordination. | [GUI verification and limits](2026-09-07-06-gui-consistency.md#implementation-record--2026-09-07); `playwright.config.ts`, `src/web/vite.config.ts`, `scripts/e2e.ts`, `scripts/lib/prepare.ts`. These pre-existing isolation edits remain uncommitted separately from the GUI change. |
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
