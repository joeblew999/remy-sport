# iOS installed web app links — no supported fix identified

Status: **unresolved requirement; implementation deferred because no supported
iOS web-app fix has been identified; awaiting upstream guidance.** Updated 2026-09-08.

## Upstream issue

The Product Owner filed
[pwa-install #174 — known workarounds for iOS external link capturing after A2HS](https://github.com/khmyznikov/pwa-install/issues/174).
Read on 2026-09-08: **open, with no comments**. The report asks whether a
workaround exists; it does not establish a maintainer-confirmed limitation or
an available fix. Check this issue for replies before resuming investigation.

## Report and scope

On iOS, links open Safari even after the user installs the web app using
Add to Home Screen (A2HS). Opening links in the browser before A2HS is not
the reported problem.

The Product Owner confirms that this link-opening behavior already works on
**Mac desktop for both localhost and the project's environments**. Preserve
that working behavior; this report concerns iOS after A2HS.

The Product Owner also tested notifications in the installed iOS web app and
reports that **notifications work** (2026-09-08). Preserve that working behavior.
The result of tapping a notification and navigating to its destination has not
been specified; do not infer that result or external-link handling from this test.

This concerns the web app. Native Tauri work, Universal Links and
`src/routes/well-known.ts` are outside this task.

## Steps to reproduce

The Product Owner's upstream issue documents the following staging/Apple Notes
reproduction. It has not been independently run by the agent.

1. On the iPhone, open **Safari** and visit
   **https://staging-remy.ubuntusoftware.net/**. Wait for the app to load.
2. In Safari, tap **Share → Add to Home Screen → Add**. If an **Open as Web
   App** option is shown, leave it enabled.
3. Go to the iPhone's **Home Screen** and tap the newly added app icon.
   Confirm the app opens in its own window, without Safari's address bar.
4. Open **Apple Notes** and create a new note. Paste this exact URL:
   **https://staging-remy.ubuntusoftware.net/**
5. Finish editing the note, then **tap the URL in the note**.
6. Observe which opens: **Safari with its address bar**, or the **installed
   web app without Safari's address bar**.

**Expected:** step 5 opens the installed staging web app.

**Actual result reported upstream:** step 5 opens Safari, even though the staging
web app was already added to the Home Screen in step 2.

The upstream report supplies the staging URL and Apple Notes as a link source.
The exact iOS version remains unrecorded. Keep the Product Owner's report
distinct from any later independent verification.

## Decision

There is no supported iOS fix to implement from the evidence gathered so far.
Remove `launch_handler` and its proposed manifest assertion from this task:
they do not solve the reported iPhone behavior. Do not change the working Mac
behavior or shared Vite configuration for this report.

Opening the Home Screen icon is the available workaround for opening the
installed app. It does not carry the destination of the tapped external link
and does not satisfy the requirement.

No decision, approval or device walkthrough is required from the Product Owner
to reach this conclusion. The report is accepted. Further testing could document
the behavior more precisely, but is not itself a fix and must not be presented
as a route guaranteed to produce one.

## Evidence and limits

- Link capture determines whether the browser opens an installed app. Launch
  handling controls how it opens after that decision. Adding `launch_handler`
  does not provide the missing iOS link-capture capability.
  [Chrome navigation management documentation](https://developer.chrome.com/docs/capabilities/pwa-navigation-management)
- WebKit's [Launch Handling request](https://bugs.webkit.org/show_bug.cgi?id=257785)
  was open when reviewed on 2026-09-08. That fact alone is not proof about all
  historical iOS link behavior, and future launch-handler support alone would
  not establish that external links open Home Screen web apps.
- The source manifest already declares `id: "/"`, `start_url: "/"`,
  `scope: "/"` and `display: "standalone"`. No manifest defect explaining the
  reported behavior was demonstrated. This was source inspection, not a check
  of the deployed manifest or the phone's installation.
- Mac support is confirmed by the Product Owner. For context, Apple's external
  link-opening feature for Mac web apps arrived with Sequoia, after Sonoma
  introduced web apps. [WebKit's Safari 18 announcement](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)
- No independent iPhone walkthrough was performed. The exact iOS version was
  not recorded. Do not turn that missing detail into another
  prerequisite for acknowledging the reported problem.

## Other developers' reports

Checked 2026-09-08. Recent reports first; dates below are publication/event
dates, not search-engine crawl dates.

- **2026-07-24 — direct match:** Danny Moerkerke's
  [The State Of Link Capturing in PWAs](https://modernwebweekly.substack.com/p/the-state-of-link-capturing-in-pwas)
  describes his cross-platform test of clicking emailed links. His iOS result
  is that links open the default browser despite installation. He separately
  reports successful opening of installed PWAs through notification taps. The
  article does not specify the tested iOS version. Record these as his observed
  results; do not adopt its manifest advice without independent verification.
- **2026-05-13 — related implementation experience:** Konstantin Shkurko's
  [Mobius 2026 talk](https://mobiusconf.com/en/archive/2026%20Spring/talks/20010414-pwa-instead-of-the-app-store-experiences-of-replacing-a-native-ios-app-and-technical-limitations/)
  describes a banking team's migration from native iOS to a PWA, including
  deep-linking difficulties and a deferred-link workaround. The talk abstract
  does not demonstrate that ordinary external links can open an already
  installed iOS PWA. It is related evidence, not an exact reproduction or fix.

Historical context (not recent reports):

- [WICG/pwa-url-handler #43 — Deep links on iOS/Safari](https://github.com/WICG/pwa-url-handler/issues/43),
  opened 2022-02-19, reports that links open the browser despite an installed
  iOS PWA, with separate browser/app storage adding to user confusion. The
  repository is now archived; this is historical evidence, not an active fix.
- [Oracle's PWA support guidelines](https://docs.oracle.com/en/cloud/paas/integration-cloud/visual-developer/guidelines-using-pwa-support.html)
  explicitly list iOS deep links opening Safari instead of the installed PWA
  as a limitation of their supported PWA workflow.
- [Joplin's iOS PWA deep-link discussion](https://discourse.joplinapp.org/t/deep-links-in-joplin-mobile-web-pwa-ios/45203),
  dated 2025-05-04, asks for the same capability and proposes a native-app,
  Shortcuts and backend workaround. The post is a proposal, not evidence of a
  verified general solution for ordinary links after A2HS.

These sources corroborate that other developers encounter the limitation.
No verified solution meeting this project's web-app requirement was found in
them. No comments were posted to these discussions or to upstream issue #174.

## When to resume

Resume implementation only when there is credible evidence of a supported iOS
web-app mechanism for the requested behavior, or a demonstrated project defect
with a supported fix. Check the mechanism against primary documentation and the
actual device before proposing code changes. Do not promise that a future
Safari release or a manifest member will automatically solve this.

A future fix must open the original linked page in the installed iPhone web app
and preserve the confirmed Mac behavior on localhost and the environments.
Automated manifest checks alone cannot establish this. Until then, retain the
requirement as unresolved; do not label it fixed or assign speculative work.

## Change record

2026-09-08: recorded the Product Owner's successful notification test in the
installed web app. Notification-click navigation remains unspecified. Only
this plan changed.

2026-09-08: linked the Product Owner's upstream issue #174, recorded its open
status with no comments at inspection, and aligned the reproduction provenance
with the published report. Only this plan changed; no upstream comment was posted.

2026-09-08: corrected the plan to remove the unrelated manifest implementation,
the required device investigation and unsupported future promises. Recorded
Mac success and the unresolved iOS requirement. This correction changed only
this plan; no README, application code, server or deployment was changed.
