# Plan — MoQ watching and broadcasting on shadcn

Status: proposed 2026-09-09. Planning requested; no application changes made.
This document owns the MoQ UI work. The [main-content plan](2026-09-09-07-main-content-on-the-registry.md)
owns the shared page architecture; the [relay record](2026-09-07-02-relay-capabilities.md)
continues to own transport and credential isolation.

## Outcome

Both Watch and Broadcast should look and behave like the rest of the shadcn
application. Keep the official MoQ media engine, and compose every ordinary
visible UI element from the repository's registry components: frame, controls,
status, loading, empty states and errors. Use the existing `base-nova`, stone,
Base UI preset, with its shipped spacing, typography, variants and theme.

This is an application composition of shadcn components. It does not require
publishing a new registry or inventing a second UI library. Custom elements
remain responsible for transport, codecs and rendering into canvas/video.

## Findings and corrections to the supplied example

Inspected `package.json`, `components.json`, the installed package declarations
and implementations, `moq-video.tsx`, `moq-elements.d.ts`, `pages/video.tsx`,
`styles.css`, the registry guard and existing media tests. Read `bun run ops --help`.

- Already installed: `@moq/watch` 0.5.3 and `@moq/publish` 0.4.6.
  Both depend on hang/net/signals; net 0.3.4 also has a repository patch.
  Do not follow the example's npm installation or introduce dependency upgrades
  into this UI change. Declare any new direct import through the shared
  dependency workflow if the implementation actually needs one.
- For these installed versions, register with `@moq/watch/element` and
  `@moq/publish/element`. Watch takes `url` plus `name` and a child `canvas`.
  It exposes `paused`, `muted` and `volume` properties; the example's `src`,
  `play()` and `pause()` are not its API. Publish needs a child video preview.
- shadcn Button and Alert are already used, but `SURFACE`/`HINT` hand-build the
  frame and caption. The page also has custom score/link styling. MoQ support
  tags remain in JSX, and unused upstream UI tags remain in typings/CSS.
  Replace support presentation with shadcn using the exported support functions;
  do not rely on a tag being registered as an incidental side effect.
- Confirmed defect: `useMoqStatus` reads `broadcast.status`; watch 0.5.3 exposes
  `broadcast.out.status`. Optional structural casts silently turn this mismatch
  into `idle`. Publish has a different broadcast API again.
- Confirmed behavior defect: `start()` sets React `source` immediately and the
  heartbeat starts from that selection. Permission still pending or denied can
  therefore be advertised by the application as broadcasting. Upstream
  `announce="source"` protects the relay announcement, not our database heartbeat.
- Initial relay-query loading is currently shown as “not configured”, because
  `useRelay` does not expose a separate pending state.

These defects are the first implementation work, not deferred polish. The
supplied sample's permanently LIVE label, disconnected React play state,
inactive volume button, hover-only controls and fixed dark palette must not
be copied.

Sources checked 2026-09-09: [MoQ project](https://github.com/moq-dev/moq),
[MoQ site](https://moq.dev/), and [shadcn Base UI Card composition](https://ui.shadcn.com/docs/components/base/card).
The installed `node_modules/@moq/{watch,publish}/element.d.ts`, watch
`broadcast.d.ts`, and both `support/index.d.ts` are the version-specific API
evidence. The MoQ documentation URLs attempted did not load; API conclusions
above come from the shipped packages. No exhaustive claim about the absence
of third-party MoQ registry components is needed for this plan.

## Component and interaction design

| Surface | Composition and behavior |
| --- | --- |
| Shared frame | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter. Keep the preset's defaults. A contained 16:9 media area is the only black region; controls and text follow light/dark theme. Reserve the area even while upstream hides its child. |
| Watch controls | Always-visible footer with Button play/pause, mute/unmute, labelled Slider for volume, and fullscreen Button when supported. Use Lucide icons and accessible translated names. Resume means watching live again; no seek bar or DVR promise. |
| Watch state | Badge plus description for waiting, connecting, playing, paused, reconnecting and ended. Actual decoded-frame progress determines whether playback is working; server `isBroadcasting` is a discovery hint, not proof of delivery. Distinguish blocked audio and offer an explicit user action to enable it. |
| Broadcast controls | Button actions for camera, supported screen capture, and stop. Show requesting permission, capturing/connecting, broadcasting, reconnecting, stopped and actionable failure. Keep stop available during connection recovery. Preview remains muted to avoid feedback. |
| Loading/empty/errors | Skeleton for config loading; existing shadcn-based EmptyState for no game/no configured relay; Alert and retry Button for permission, capture and connection failures. Fatal capability gaps disable the affected action; a working fallback remains usable. |
| Game context | Preserve teams, score, venue, game/event navigation and action gates. Align context with existing shared page and registry primitives, coordinating with the main-content plan. |

The normal status line contains human-readable messages. Remove broadcast names
and raw transport state strings from the main flow; keep useful diagnostics in
existing analytics and test evidence without exposing tokens. All visible copy,
including controls and support explanations, goes through Paraglide in English,
Thai and Japanese. Status announcements use a restrained live region; no
per-frame announcements. Controls work with touch and keyboard without hover.

## Implementation sequence

1. **Make the media state truthful.** Introduce a small typed React adapter for
   each installed element, separate from the shadcn presentation. Use their real
   types instead of optional unknown-property casts. Synchronize control and
   observed state, with scoped subscriptions or a documented polling bridge and
   cleanup. Verify the source/capture failure API before choosing the bridge;
   do not assume DOM media events exist on a custom element. Start the app
   heartbeat only after actual capture and publish readiness, without requiring
   a viewer (encoding is demand driven). Clear it on capture ending/failure,
   stop, denied renewal and navigation; retain the server stale-time safeguard.
   Cover pending config separately. Preserve token renewal, source cleanup,
   encoder settings, reconnect delay, discovery-less watcher recovery and session
   reporting. Preserve paused/muted/volume intent across recovery remounts.
2. **Build the shared shadcn frame and Watch.** Keep app-owned compositions
   outside `components/ui/`. Reuse installed primitives; add the missing Slider
   through `bun run ops ui add slider`. Bind every control to the adapter and
   prove audio activation and fullscreen failure behavior on supported browsers.
   Replace upstream support presentation using `@moq/watch/support` results.
3. **Move Broadcast onto the same frame.** Bind capture controls to observed
   state; handle permission rejection, absent devices and browser-ended screen
   sharing. Use `@moq/publish/support` for capability data, with the actual screen
   capture API checked separately. Preserve per-game authorization and its
   revocation behavior. Fit the video-page context into shared registry patterns.
4. **Remove the old UI and prevent drift.** Delete SURFACE/HINT, unused upstream
   UI/support tag declarations and obsolete chrome CSS after usages are gone.
   Keep only documented media sizing rules needed for canvas/video rendering.
   Never hand-edit the hash-locked registry copies. Add a narrow repository guard
   against upstream MoQ UI/support elements returning to the app and against
   bypassing the typed adapter; use behavioral tests for state correctness.
5. **Verify through team automation and record evidence.** Complete the checks
   below, update this plan and the docs index, and commit the implementation in
   coherent steps. Do not mark the work complete from screenshots alone.

## Verification and acceptance

- Adapter/component tests: actual installed property paths; pending config;
  waiting/playing/stalled/paused distinctions; synchronized volume/mute; denied
  capture never starts a heartbeat; source ending withdraws it; unmount and
  renewal denial release capture and timers; watcher remount preserves controls.
- Render tests: both pages at phone/desktop widths, light/dark, all three
  languages, keyboard focus and labels, visible touch controls, each loading,
  unavailable and error state. Extend `tests/render/moq-page.spec.ts` and retain
  capability coverage in `moq-support.spec.ts`. Mocked frames do not prove media.
- Run `bun run ops ui check`, then `bun run check` and `bun run test:e2e` through
  the documented workflows. Run `bun run shots` for the relevant video pages
  and inspect the resulting captures. Recheck any concurrently changed files
  before editing; shell/page/style work was already uncommitted during planning.
- Real media: preserve the separate publisher/watcher proof of distinct decoded
  frames, healthy playback, stop/release and restart in
  `tests/integration/cloudflare-video.mjs`; extend it for playback controls and
  denied capture. **Automation debt:** this script currently advertises a direct
  invocation with a separately running dev server and is not wired into the
  package CLI. Integrate it into `bun run test:e2e` with shared lifecycle and
  cleanup before using it as acceptance evidence. If relay credentials are
  unavailable, report that limitation explicitly; a skip does not pass delivery.
- Exercise real camera/audio and phone behavior through the existing walkthrough
  workflow where automation cannot prove them. Record browser/version and limits.
  Per-game credential isolation remains separately tracked in the relay plan;
  this UI work must preserve access checks without claiming to solve isolation.

Done means both surfaces use the same shadcn frame and primitives, every offered
control works, displayed state matches observed media state, capture is released
correctly, the shared checks pass, and real media evidence is recorded. Deployment
is a subsequent action; this planning request does not publish changes.
