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
| Meeting test | In progress | [Hang two-person test page](2026-09-09-12-hang-meeting-test.md). Reuse media adapters without introducing meeting domain records. |
| MoQ screens | Implemented; live-media acceptance open | [Watching and broadcasting](2026-09-09-09-moq-on-shadcn.md). Shadcn controls checked directly; post-fix live delivery needs camera permission. No further e2e runs requested. |
| Public help | Implemented; discovery/integration work open | [Public help](2026-09-09-04-blume-public-help.md). Continue from “Current priority — external discovery and real API use”; use the help package's shared CLI. |

## Planned, waiting or paused

| Work | State | Next step / owning plan |
| --- | --- | --- |
| Adopting shadcn-places | Step 1 done; **waiting on a Product Owner decision** | [Adopting shadcn-places](2026-09-10-01-adopting-shadcn-places.md). Places moved out to their own repo and Worker — [shadcn-places](https://github.com/joeblew999/shadcn-places), live at https://shadcn-places.gedw99.workers.dev — where the source measurements and the corrections now live. This plan is only about what *this* app stops owning. Both listed bugs are fixed (2026-09-10): `tl` now reaches Intl as `fil`, held by a check over every released locale, and the identical-to-English rule lives in `tests/repo/messages.test.ts`. What remains is the decision itself — whether places stay vocabularies here — and the `CITY_CODES` `z.enum` blocker behind it. The service's Thai provinces are now 78 to this repo's 77, and 0% English against this repo's 85%. |
| Translation provenance | Recorded and checked 2026-09-10; none reviewed | [Say which languages a person has read](2026-09-09-19-translation-provenance.md). Twenty-six agent translations plus the English they came from; the older checks prove completeness, placeholder parity and script correctness, and none of them prove the copy reads naturally. `provenance` and `caveat` now on every model row, with a check that the question is answered — it does not gate release. A new rule fails any non-Latin locale shipping the English word, which found the four object types eleven languages were missing. Known weaknesses: `zh-HK` derived from `zh-TW`, `ur` set in Naskh not Nastaliq. |
| Installed-app Back | **Built 2026-09-10**; web-install device checks open | [Back navigation](2026-09-09-10-installed-app-back-navigation.md). Not a phone problem: **every installed surface loses *return*** — Android, iOS, Windows, Mac and the intended Tauri app for Windows and Mac, where a 1280px window has no chrome and no system back. Phones additionally lose *hierarchy*, because crumbs are folded away below `sm`; the registry's `breadcrumb-responsive` collapses rather than hides and answers that half. Both halves built: the shell's return control at every width, and the ancestors collapsing behind an ellipsis below `sm` instead of being removed. Three hand-rolled escapes deleted, including team's, which pointed at Discover though a team's parent is Teams. Open: iOS A2HS, Android installed, and the installed web app on Windows and Mac — no tier here reaches an installed app. **Tauri is later by decision**; it is designed for, not waited on. |
| Sign-in autofill | Implemented; phone acceptance open | [Sign-in code](2026-09-09-01-sign-in-code-autofill.md). Watch a real phone offer the emailed code. |
| Email channel | Deployed 2026-09-10; **one human check left** | [React Email](2026-09-09-02-email-channel-on-react-email.md). The deploy it was waiting for is done — staging and production both on `f2fcfba`. The seeded actors are `@bat.test` addresses no mail server delivers to, so what remains is a person opening a real inbox and confirming the email arrives, renders and is not filed as spam. |
| Environment install names | Verified locally; phone acceptance open | [Install names](2026-09-08-05-pwa-install-name-per-environment.md). Confirm localhost/staging labels on a phone. |
| Help after the notification move | Done 2026-09-10 | [Notifications off Devices](done/2026-09-09-06-notifications-off-the-devices-page.md). Help in all three locales told readers to manage notifications on the signed-in devices page, where those settings no longer are — wrong instructions rather than stale prose. Corrected in `notifications`, `troubleshooting` and two frontmatter descriptions, and the page's own name brought up to date: it is "Where you're signed in" now, which is what a reader looks for. |
| External iPhone links | Unresolved requirement | [Installed web-app links](2026-09-08-04-ios-installed-web-app-links.md). Resume only with evidence of a supported mechanism. |
| Remote development | Paused | [Remote development](2026-09-08-03-remote-development.md). Read the takeover record; remote startup remains paused pending identity integration and an isolated walkthrough. |

## Continuing engineering work

**These are standing registers, not plans.** They are worked down rather than
finished, and each now says so in its own status line. Counting them among
unfinished plans overstates what is outstanding — which is the mistake this
heading invited before it said this.

| Work | Owner and remaining scope |
| --- | --- |
| Domain coverage and product roadmap | [Domain register](2026-09-07-01-react-domain-coverage.md) owns field/action/relationship review, whole-app permission and state matrices (GAP-06–08), listing moderation, brackets, ranking history and AI suggestions (GAP-09–12). The archived gate/permission proposals are context, not a second backlog. |
| No router library | **A decision nobody has made.** `src/web/lib/router.tsx` is 315 hand-written lines with no routing dependency, in an app already using `@tanstack/react-query`. TanStack Router would supply keyed history and `canGoBack()`, typed search params and scroll restoration as library code rather than ours. Surfaced by [Back navigation](2026-09-09-10-installed-app-back-navigation.md), whose first draft was about to reinvent history keying one layer deeper — cut, and the feature no longer needs it. Not urgent: the router works, is tested, and its URL-carried `from=` trail suits an installed app better than history state, because it survives reload, a shared link and a cold launch from a notification. Open it when a routing need appears — typed search params, route-level code splitting, or a second hand-rolled history mechanism — not to add a button. |
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
