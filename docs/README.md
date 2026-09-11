# Project work — start here

`docs/` holds unfinished work and living reference material.
[**Completed work and superseded plans → done/**](done/README.md) holds the history.
A shipped feature stays here if its acceptance checks or follow-ups are still open.

## Working rules

- [Working conventions](working-conventions.md) holds the rules a check cannot
  express — what stays out of private memory, staging commits in a shared tree,
  ticking plan boxes, and using the shadcn registry rather than reinventing it.
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
| Unify server routing on oRPC | Started 2026-09-11 | [Unify server routing](2026-09-11-01-unify-server-routing-orpc.md). Hono is removed; every endpoint becomes an oRPC procedure and `src/index.ts` becomes a prefix-dispatching fetch handler. Eight corrections to the brief are recorded at the top of the plan — most importantly that deleting Hono destroys the second rule in `tests/repo/authz.test.ts`, which enumerates every non-procedure route; its replacement must be green before that rule is removed. `GET /api/versions` is done and the build stamp is now a var rather than a define. Next: the remaining eight Part A endpoints. |

> **Eight plans moved to [done/](done/README.md) on 2026-09-10 with their device
> or credential acceptance still outstanding** — a one-off clearing by the
> Product Owner, not a change to the rule above. Each says **Acceptance pending**
> and what is owed: a phone for the install names, the sign-in code and back
> navigation; a camera for MoQ; a second person for the meeting test; a real
> inbox for email; Google credentials for public help. iOS links is superseded
> because no supported fix exists.

## Planned, waiting or paused

| Work | State | Next step / owning plan |
| --- | --- | --- |
| Adopting shadcn-places | Step 1 done; **waiting on a Product Owner decision** | [Adopting shadcn-places](2026-09-10-01-adopting-shadcn-places.md). Places moved out to their own repo and Worker — [shadcn-places](https://github.com/joeblew999/shadcn-places), live at https://shadcn-places.gedw99.workers.dev — where the source measurements and the corrections now live. This plan is only about what *this* app stops owning. Both listed bugs are fixed (2026-09-10): `tl` now reaches Intl as `fil`, held by a check over every released locale, and the identical-to-English rule lives in `tests/repo/messages.test.ts`. What remains is the decision itself — whether places stay vocabularies here — and the `CITY_CODES` `z.enum` blocker behind it. The service's Thai provinces are now 78 to this repo's 77, and 0% English against this repo's 85%. |
| Translation provenance | Recorded and checked 2026-09-10; none reviewed | [Say which languages a person has read](2026-09-09-19-translation-provenance.md). Twenty-six agent translations plus the English they came from; the older checks prove completeness, placeholder parity and script correctness, and none of them prove the copy reads naturally. `provenance` and `caveat` now on every model row, with a check that the question is answered — it does not gate release. A new rule fails any non-Latin locale shipping the English word, which found the four object types eleven languages were missing. Known weaknesses: `zh-HK` derived from `zh-TW`, `ur` set in Naskh not Nastaliq. |
| Help after the notification move | Done 2026-09-10 | [Notifications off Devices](done/2026-09-09-06-notifications-off-the-devices-page.md). Help in all three locales told readers to manage notifications on the signed-in devices page, where those settings no longer are — wrong instructions rather than stale prose. Corrected in `notifications`, `troubleshooting` and two frontmatter descriptions, and the page's own name brought up to date: it is "Where you're signed in" now, which is what a reader looks for. |
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
