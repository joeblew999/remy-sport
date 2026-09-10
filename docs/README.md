# Project work — start here

`docs/` holds unfinished work and living reference material.
[**Completed work and superseded plans → done/**](done/README.md) holds the history.
A shipped feature stays here if its acceptance checks or follow-ups are still open.

## Working rules

- Start or resume from the owning plan below. Record current status, the next
  concrete step and verification evidence in that plan; keep this index brief.
- When the agreed work is complete, move its plan into `done/`, update links and
  add it to the archive index in the same commit. Preserve its evidence.
- A superseded plan may move there only when its unfinished work has an explicit
  owner here. Label it **superseded**, never **completed**.
- Do not restart historical checklists or treat old test counts as current proof.
  Do not archive a plan merely because code was written or a different test passed.
- Follow the root [README](../README.md) for the shared development commands.
  `bun run test -- tests/repo/docs.test.ts tests/repo/docs-organisation.test.ts`
  checks document paths and keeps both indexes complete.

## Active implementation and review

| Work | State | Next step / owning plan |
| --- | --- | --- |
| Meetings | Implemented; live-media acceptance open | [Meetings](2026-09-09-13-meetings.md). Anyone may call anyone, invitees are notified on their own channels, and the room reuses the Hang media. Open: a real two-person call and the captures. |
| Meeting test | In progress | [Hang two-person test page](2026-09-09-12-hang-meeting-test.md). Reuse media adapters without introducing meeting domain records. |
| Team page | Implemented; full acceptance open | [Roster, Schedule and Manage tabs](2026-09-09-11-team-page-tabs.md). 32 targeted rendering checks, the browser journey and 36 captures pass. Whole-gate failures remain recorded in the plan. |
| MoQ screens | Implemented; live-media acceptance open | [Watching and broadcasting](2026-09-09-09-moq-on-shadcn.md). Shadcn controls checked directly; post-fix live delivery needs camera permission. No further e2e runs requested. |
| Notification settings | Steps 1–6 implemented; steps 7–8 open | [Two-channel notification page](2026-09-09-08-notifications-page-two-channels.md). One matrix, account-tier push gate, Roster Change's dead email cell removed and held by a (type, channel) check. Open: Forget on a device row, which needs a fingerprint-keyed `unsubscribe`, and the captures. |
| Public help | Implemented; discovery/integration work open | [Public help](2026-09-09-04-blume-public-help.md). Continue from “Current priority — external discovery and real API use”; use the help package's shared CLI. |

## Planned, waiting or paused

| Work | State | Next step / owning plan |
| --- | --- | --- |
| Pretranslated reference data | Proposed; sources measured, decisions taken, arranged to run unattended | [Reference data, starting with places](2026-09-09-16-pretranslated-reference-data.md). CLDR for countries (complete, free, and it retires the language picker's N×N matrix), dr5hn plus GeoNames for subdivisions, Wikidata for cities (CC0, th 83% over 100k). Ships as a separate public Worker with an oRPC contract and a shadcn registry item. PO decided 2026-09-09: publish separately, and dr5hn's ODbL is accepted. Open: a `LICENSE` file — this repo is public and declares none — and the `CITY_CODES` `z.enum` blocker. |
| Reference payload per locale | Proposed; measured, unowned until now | [`/api/reference` sends one language](2026-09-09-17-reference-payload-per-locale.md). Every reader downloads all twenty-seven languages to render one — 98 KB gzipped, 8,004 translated names. Trimming to the reader's locale plus its English fallback is 8–12× smaller on the wire. Distinct from the reference-data plan, which makes the N×N matrix cheap to *fill* and does nothing about the wire. |
| Browser tier flakiness | Proposed; cause not yet known, and said so | [The browser tier fails differently every time](2026-09-09-18-browser-tier-flakiness.md). A different spec nearly every run; at least six deploy attempts lost. Two environmental causes found and fixed 2026-09-09 (stale Vite dep cache, five-second assertion budget) and two wrong theories recorded so they are not chased again. Step 1 is to make one failure reproducible rather than guess a third time. |
| Translation provenance | Proposed; twenty-seven locales, none reviewed | [Say which languages a person has read](2026-09-09-19-translation-provenance.md). All twenty-seven are agent translations; the checks prove completeness, placeholder parity and script correctness, and none of them prove the copy reads naturally. Records provenance on the model rather than gating release. Known weaknesses: `zh-HK` derived from `zh-TW`, `ur` set in Naskh not Nastaliq. |
| Installed-app Back | Proposed; the trail it rebases on is now in `done/` |  [Back navigation](2026-09-09-10-installed-app-back-navigation.md). Check actual route history and mobile controls before implementing; installed iPhone/Android acceptance remains open. |
| Sign-in autofill | Implemented; phone acceptance open | [Sign-in code](2026-09-09-01-sign-in-code-autofill.md). Watch a real phone offer the emailed code. |
| Email channel | Verified locally; remote delivery open | [React Email](2026-09-09-02-email-channel-on-react-email.md). Verify real inbox delivery after the next authorised staging deployment. |
| Environment install names | Verified locally; phone acceptance open | [Install names](2026-09-08-05-pwa-install-name-per-environment.md). Confirm localhost/staging labels on a phone. |
| Help after the notification move | App change complete; help follow-up open | [Notifications off Devices](done/2026-09-09-06-notifications-off-the-devices-page.md). Verify/correct help in all three locales to point at Notifications. |
| GUI consistency captures | Implemented; capture limitation open | [GUI consistency](2026-09-07-06-gui-consistency.md). Recheck the recorded desktop WebKit Devices/Notifications capture stall. |
| External iPhone links | Unresolved requirement | [Installed web-app links](2026-09-08-04-ios-installed-web-app-links.md). Resume only with evidence of a supported mechanism. |
| Remote development | Paused | [Remote development](2026-09-08-03-remote-development.md). Read the takeover record; remote startup remains paused pending identity integration and an isolated walkthrough. |

## Continuing engineering work

| Work | Owner and remaining scope |
| --- | --- |
| Domain coverage and product roadmap | [Domain register](2026-09-07-01-react-domain-coverage.md) owns field/action/relationship review, whole-app permission and state matrices (GAP-06–08), listing moderation, brackets, ranking history and AI suggestions (GAP-09–12). The archived gate/permission proposals are context, not a second backlog. |
| Relay isolation | [Relay capabilities](2026-09-07-02-relay-capabilities.md): per-game credentials, cross-game denial, expiry/revocation and browser transport evidence. Basic media delivery is already proven. |
| Staging and automation | [Staging verification](2026-09-07-04-staging-verification.md): cross-machine coordination, forced-termination recovery and shared-fixture effects remain open. Wider CLI redesign is stopped, not completed. Recheck deployment identity through the CLI before rollout; old hashes are historical. |
| Earlier observations to recheck | [Historical GUI walk](done/2026-09-06-01-gui-walk.md): Vite-config restart crash and coach profile content were observations requiring a fresh check, not confirmed current defects. Bundle-size and deprecated build-option warnings remain recorded tooling debt. |

[Generated domain inventory](react-domain-coverage.md) is reference data, produced
from the evidence ledger. Do not hand-edit its counts or classifications.

## History and browser handover

[Archive index](done/README.md) lists completed work and superseded proposals.
The [previous project index](done/2026-09-09-project-status-checkpoint.md) preserves
historical deployment/test evidence and the shared-Chrome setup handover. The
Chrome extension connection was already established; do not ask to reinstall it.
