# Project status checkpoint — before the September 9 tidy-up

Archive: superseded (2026-09-09). This preserves the old index and browser
handover. Counts, deployment identities and open/closed labels below are dated
claims, not current status. Use [the current index](../README.md).

# Project status — start here

## Reference reviews

- [oRPC's Blume documentation and LLM retrieval](2026-09-09-03-orpc-blume-review.md): cloned, built and tested locally; findings and reproduction commands. No adoption change.

## Open plans

- [Team page sections as tabs](2026-09-09-11-team-page-tabs.md):
  proposed 2026-09-09; planning only. Replace the duplicate-looking header jump
  links and stacked content with Roster, Schedule and permission-controlled
  Manage tabs, following the event page pattern and preserving old section URLs.
- [Back navigation in the installed app](../2026-09-09-10-installed-app-back-navigation.md):
  proposed 2026-09-09; planning only. Shared shadcn Back control, safe app
  history and named fallbacks for fresh deep links, with automated and actual
  iPhone/Android installed-app acceptance checks.
- [MoQ watching and broadcasting on shadcn](../2026-09-09-09-moq-on-shadcn.md):
  proposed 2026-09-09; planning only. Shared registry frame and working controls
  for both surfaces, with typed MoQ state. Fix the obsolete watcher status path,
  premature broadcast heartbeat and loading state as part of the work. Also wire
  the real-media probe into the shared browser test workflow before acceptance.
- [Public Remy Sport help](../2026-09-09-04-blume-public-help.md): isolated Fumapress package implemented and verified locally. Separate dependencies/build/Worker; no app asset merging. App build, typecheck and lint pass. The two email-related repo checks it found failing were the email work's, and are fixed below; the whole tier is green. Use `bun run ops docs check`.
- [The sign-in code, filled in by the phone](../2026-09-09-01-sign-in-code-autofill.md)
  is implemented 2026-09-09. The Product Owner's question — how ChatGPT signs
  you in from an emailed code without opening the mail app — is answered
  there: the phone's autofill does it. The code field is focused as the step
  opens and the sixth digit signs the reader in, proven in the rendering and
  browser tiers. Open: one phone session to watch Mail offer the code, which
  also covers the two install labels and the iOS links check.
- [The email channel, on React Email](../2026-09-09-02-email-channel-on-react-email.md)
  is implemented 2026-09-09. A verified sign-in registers the address as the
  reader's EMAIL channel, the settings screen has an opt-in email switch per
  type, and every email the app sends is a React Email template composed
  from the Paraglide message it already was, with a repo check that keeps
  words out of templates. Proven end to end through the dev outbox; a real
  inbox and deliverability are staging's to show after the next deploy.
  The two checks it owed the gate are paid: the mail preview route is listed
  in `HONO_ROUTES` with how it is guarded, and the four `following` email
  fields are enrolled in the evidence ledger. 929 unit/repository/Worker and
  344 rendering checks pass, with typecheck and lint.
- [The notifications page, with two channels on it](2026-09-09-08-notifications-page-two-channels.md)
  is **proposed 2026-09-09, nothing implemented**, at the Product Owner's report
  that the page is wrong and illogical now that push and email both live on it.
  Email was fitted into a page built for push and nothing was re-thought around
  there being two channels. Five defects found, not just shape: the push
  preferences are gated on *this browser* holding a subscription although a
  preference is an account fact, which also locks the native app out entirely;
  the frozen rows still read as ticked; Roster Change offers an email switch
  with no EMAIL renderer behind it; and `data.following` — the page's own
  subject — is fetched here and thrown away. Two decisions taken the same day:
  one matrix with Push and Email as columns, and Roster Change loses the cell
  rather than gaining a template. Needs the Product Owner's approval of the
  steps before any code changes.
- [One navigation trail, on every screen](2026-09-09-09-navigation-trail.md)
  is implemented 2026-09-09, at the Product Owner's report that organisations
  drill in and back out and the other entry points do not. Fifteen headers had
  three habits: ten passed their own name as a crumb, Discover passed an
  unlinked "Home" as well, and a team passed nothing — so a team reached from
  the directory, a schedule or a player had no way back from any of them. The
  rule now: crumbs are the ancestors, each linked; the page is the `h1` at the
  end; a top-level screen passes nothing. The trail is in the site header, where
  the title already went. `tests/repo/navigation.test.ts` fails any crumb
  without an href.
- [Main content on the registry, like the sidebar already is](2026-09-09-07-main-content-on-the-registry.md)
  is **implemented 2026-09-09**: shadcn's own `dashboard-01` shell for our preset
  was fetched from the registry and adopted — inset sidebar, the page title as an
  `h1` in the site header, the block's header-height and sidebar-width variables,
  its `px-4 lg:px-6` gutters and `@container/main`. Before that, `--control-height:
  44px` was applied to every pointer, so every control was 20-37% taller than the
  preset draws them; it is a `pointer: coarse` rule now, and the render tier's
  assertion of 44px on Desktop Safari — a check that actively held the preset out
  — was corrected. Lists stay `RowGroup` by the Product Owner's decision. Dark,
  Thai and Japanese have not been looked at under the new shell. It began as a report
  that the sidebar (which they call the drawer) looks right and all the main
  content does not. Measured: the sidebar is nine registry primitives used as
  shipped, while our pages carry 140 hand-picked type classes and 100 overrides
  of size, padding, radius or gap on registry components, and `page.tsx` invents
  a second type scale. The font is not the fault — the preset's font is Inter
  and we apply it. `tests/repo/styles.test.ts` reads only `styles.css`, so the
  drift moved to the JSX where nothing checks. Stage 1 needs the Product
  Owner's decision before any code changes.
- [Notifications off the devices page](2026-09-09-06-notifications-off-the-devices-page.md)
  is implemented 2026-09-09, at the Product Owner's question that Devices is
  really an authentication concern. It is now: `/#/devices` holds sessions and
  nothing else, and the settings that had grown an email address moved to
  `/#/notifications`, taking `MANAGE_OWN_NOTIFICATION_CHANNELS` with them — the
  declaration had been sitting on the page rather than on the code that answers
  it. Each page names the other's device list, which is what the two being
  adjacent used to do. Open, for the help lane: `sites/help` still tells readers
  the settings are on the devices page.
- [A distinct install name per environment](../2026-09-08-05-pwa-install-name-per-environment.md)
  is implemented, verified locally and committed on 2026-09-09:
  `remy-localhost`, `remy-staging`, the plain name in production, from one
  table that both the build and a repo check import. Open: confirming the
  two labels on a phone.
- [Why iPhone links open Safari](../2026-09-08-04-ios-installed-web-app-links.md)
  is an accepted, unresolved requirement: no supported iOS mechanism opens an
  installed web app from an external link. Resume only on credible evidence
  of one; the upstream issue is linked there.
- [Remote development without manual coordination](../2026-09-08-03-remote-development.md)
  is paused, and committed on 2026-09-09 as taken-over work: `ops tunnel`,
  `ops tunnel status` and `ops tunnel -- --run` work without the identity
  plugin, `ops remote status|stop` work, and `ops remote` startup refuses
  with its reason until the plugin is wired and verified in isolation. The
  remote walkthrough has not been done. Read its takeover record before
  resuming.

## GUI

[Convert the GUI to shadcn](2026-09-08-01-typography-and-design-system.md)
was recorded here as **complete on 2026-09-08, and it was not**. Read that as a
warning before trusting a "complete" in this file. What it did was real: the
stylesheet moved onto the preset and elements became registry components. What
it never did was the other half — the composition. The bespoke layer did not
go away, it moved from CSS into JSX, where the guard that was meant to catch it
did not look, so the file stayed green while 140 hand-picked type classes and
100 overrides of registry components accumulated. Three things it missed were
still in the tree a month later: `--font-heading`, which the preset defines and
`ops ui theme` drops; `--control-height: 44px` applied to every pointer, making
every control 20-37% taller than the preset draws it; and the page architecture,
which was ours throughout. The Product Owner found all three by looking at the
screen. See [main content on the registry](2026-09-09-07-main-content-on-the-registry.md)
for what was actually done about it on 2026-09-09.

What that plan did deliver, under the Product Owner's rule of 2026-09-08: no
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
| Shared staging test command | The CLI enables and measures temporary admin access, runs tests serially, restores prior access and verifies cleanup. The public admin login button remains hidden. [Behavior and remaining limitations](../2026-09-07-04-staging-verification.md). |
| Coach access and session revocation | Coach grant corrections and browser device-revocation journeys are implemented. These do not close every permission/state combination. [Domain register](../2026-09-07-01-react-domain-coverage.md). |
| Shared UI action gates | `Can`/`PlatformCan`, gate checks and a team-page permission matrix exist. Whole-app matrices and reveal mode are not complete. [Gate record](2026-09-06-03-one-gate.md). |
| Basic broadcasting | Recorded synthetic-camera delivery/stop/restart passed locally and on staging; the user confirmed a local physical-camera walkthrough. This does not prove per-game relay credential isolation. [Relay evidence](../2026-09-07-02-relay-capabilities.md). |
| Tooling cleanup | TypeScript 7, Cloudflare Vite integration and repo-based copy/import checks landed. GitHub CI and Dependabot were removed by request. No Commander or mise task migration was adopted. |

## Remaining work

| Priority / state | Work | Where to continue |
| --- | --- | --- |
| Next | Deploy main to staging: it is ahead of the deployed `e9ce101` by the Bun-pin guard, the forms fix, the taken-over install name, the sign-in autofill and the email channel on React Email, and a staging test run refuses until they match. Then what only staging and a phone can show: a real inbox receiving the HTML mail, Mail offering the sign-in code, the two install labels. Then the product roadmap below, starting with listing moderation. | [Convert the GUI to shadcn — log](2026-09-08-01-typography-and-design-system.md#log); [install name](../2026-09-08-05-pwa-install-name-per-environment.md) |
| Next capture fix | Desktop Devices screenshots intermittently stall in WebKit after data and fonts load. This reproduced in the baseline before the GUI migration; phone captures work. Context cleanup now retains a trace, and the CLI cleans up sessions/storage on failure. Do not call the whole screenshot walk verified. | [GUI consistency implementation record](2026-09-07-06-gui-consistency.md#implementation-record--2026-09-07); reproduce with `bun run shots -- --grep 'devices · ja · desktop' --trace on`. |
| Local test isolation | Committed with the GUI conversion: the e2e tier runs on 8788 with per-run storage, cleans up sessions and storage on failure, and refuses a staging run from a tree that differs from the deployment. Developer data and session preservation across restarts, and broader failure handling, still need their own evidence. `bun run dev` stays the developer entry point. | `playwright.config.ts`, `scripts/e2e.ts`, `scripts/lib/local-browser.ts`, `scripts/lib/deployed-source.ts` |
| Next independent product work | Review existing behavior one domain slice at a time: exact fields, relationships, permitted/refused actions, persistence and delivery. The committed report has **1,379 items: 64 classified, 1,315 unreviewed**. Unreviewed does not mean broken or unimplemented. | [Domain register, GAP-01 and GAP-05–08](../2026-09-07-01-react-domain-coverage.md#work-register-and-execution-order); [generated inventory](../react-domain-coverage.md). |
| Open relay work | Choose and prove a per-game credential design, including cross-game denial, expiry/revocation and browser transport compatibility. Ordinary relay setup is working; the old missing-token/403 blockers are historical. | [Relay investigation](../2026-09-07-02-relay-capabilities.md#current-work). |
| Planned product features | Listing moderation before new public draws/rankings, then bracket generation/viewing, ranking history and AI bracket suggestions. These are **five model actions in four feature groups**, with accepted rules but implementation pending. | [GAP-09–12](../2026-09-07-01-react-domain-coverage.md). |
| Open usability/coverage | Broaden phone/desktop, keyboard and English/Thai/Japanese review; permission/state matrices across surfaces; service-worker navigation/offline/update behavior. Existing passing cases do not establish exhaustive coverage. | Domain GAP-06–08; [who sees what](2026-09-06-02-who-sees-what.md). |
| Open test isolation | Cross-machine staging-run coordination, recovery after forced termination/power loss, and removing the ban test's effects on shared fixture sessions. These were not solved by the successful serial runs. | [Staging limitations](../2026-09-07-04-staging-verification.md#still-open). |
| Needs recheck, not a confirmed current defect | Earlier Vite-config restart crash and the coach profile's insufficient content. Bundle-size and deprecated build-option warnings were also recorded. | [GUI walk](2026-09-06-01-gui-walk.md); [tooling history](2026-09-05-01-modern-tooling.md). |
| Stopped | Wider CLI redesign and automatic preparation of every workflow. Do not restart from the historical plan without a new task. | [Automation status](../2026-09-07-04-staging-verification.md). |
| Deliberately excluded | GitHub CI/Dependabot. Dependency updates are local work; a future Vitest major requires a fresh compatibility check, not an automatic upgrade from an old checkbox. | [Dependency history](2026-09-05-02-latest.md). |

## Which document owns what

- This file owns the current overview and links; update it when a work item's status changes.
- The domain register owns detailed feature/coverage acceptance and dependencies.
- The staging rollout owns deployment and test-run evidence; the relay record owns media evidence.
- The generated inventory comes from its evidence ledger. Do not hand-edit its counts or promote classifications because unrelated tests passed.
- The September 5 tooling plans and September 6 GUI proposals are historical references. Their original checklists are not a second backlog. [Fewer dependencies](2026-09-05-03-fewer-dependencies.md) is completed history.
