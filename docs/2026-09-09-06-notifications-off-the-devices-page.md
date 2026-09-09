# Plan — notifications off the devices page

Status: implemented 2026-09-09, the same day it was asked for.

The Product Owner's question: does some of what is on Devices belong somewhere
else, given that Devices is really an authentication concern? It does. This
splits one page into two and moves a misplaced model declaration with it.

## What Devices held, and why it stopped working

`/#/devices` answered two unrelated questions on one screen.

- **Where am I signed in?** The session list, with sign-out per session and
  sign-out-others. Authentication, straightforwardly: Better Auth's
  `/list-sessions` and `/revoke-session`, per ADR 014.
- **How do I get told about things?** The whole `NotificationSettings` card —
  push on/off for this browser, the native path, the test notification, the
  browsers registered to receive notifications, and per-type preferences.

Holding them together was a deliberate decision, recorded in a comment on the
page and pinned by a test: two lists both say "this device", the sessions are
not the subscriptions, and *adjacent, the difference is visible; apart, it is a
coincidence of wording nobody can be expected to notice*. That reasoning was
sound for two device lists. Three things have since made it the wrong trade.

1. **Email is not a device.** The email channel landed the same day: the panel
   now carries an address, whether it is verified, and an email switch per
   notification type. A reader who wants to be emailed about scores has no
   reason to look under Devices, and the page's name no longer describes half
   of what is on it.
2. **The model declaration was on the wrong surface.**
   `MANAGE_OWN_NOTIFICATION_CHANNELS` — "add / remove / verify / enable /
   disable" a channel — was declared with `@answers` on `pages/devices.tsx`,
   whose own controls are all sessions. The thing that actually answers it is
   the channel list inside `components/notification-settings.tsx`. The
   declaration was only defensible because the two shared a page, so the
   coverage report pointed at a page that does not do the work.
3. **The repository already spoke as if they were separate.**
   `tests/helpers/surfaces.ts` has carried `notifications` and `sessions` as
   two named surfaces resolving to the same URL, with a comment saying they are
   "Sessions, not subscriptions — a different list". Every test navigates
   through it, so the architecture was already modelled as two surfaces; only
   the router disagreed.

Length is a fourth, smaller reason: on a phone the email switches sat below a
session list, a push toggle, a native note, a test button and a browser list.

## What replaces the adjacency argument

The old comment is right that splitting removes the thing that made the two
lists distinguishable. So the split does not simply drop that protection — it
replaces proximity with saying so:

- Each list is titled for what it is: "Where you're signed in" against
  "Devices receiving notifications".
- Each page carries a sentence naming the other list and what it is instead,
  with a link to it. The distinction is now stated rather than inferred from
  layout, which does not depend on the reader noticing two panels are adjacent.
- The test that pinned the adjacency now pins this instead: neither list is on
  the dashboard, each is on its own page, and each page links to the other.
  A test that only asserted "not adjacent" would protect nothing.

## The split

| Page | Route | Answers | Holds |
| --- | --- | --- | --- |
| Security | `/#/devices` (unchanged) | sessions | the session list, sign out one, sign out others |
| Notifications | `/#/notifications` (new) | `MANAGE_OWN_NOTIFICATION_CHANNELS`, `MANAGE_OWN_NOTIFICATION_PREFERENCES`, the four `RECEIVE_*` | push for this browser, native, test, registered browsers, email address, per-type push and email |

`/#/devices` keeps its route deliberately. It is the one a bookmark, the
account menu and the screenshot walk already point at, and it keeps the meaning
the Product Owner named: Devices is the authentication page.

The notification card loses its own header, because the page header now carries
that title; keeping both would print "Notifications" twice on one screen.

## Steps

- [x] **A route and a page.** `notifications` added to `PAGES`; `pages/notifications.tsx`
      renders the header, the signed-out prompt and the settings panel.
      Registered in `main.tsx`, which is a `Record<Page, …>` so a missing screen
      would not compile.
- [x] **Devices keeps only sessions.** `NotificationSettings` and its import are
      gone from the page, and its `@answers MANAGE_OWN_NOTIFICATION_CHANNELS`
      moved to the component that holds the channel list.
- [x] **The test notification lands where the settings now are.**
      `src/api/notifications.ts` sent the reader to `#/devices?pushtest=`, which
      after the split is a page that cannot show the confirmation. It now sends
      them to `#/notifications?pushtest=`.
- [x] **Both ways in.** The account menu gains Notifications beside Devices, and
      each page links to the other with a sentence saying what the other list is.
- [x] **One line of test vocabulary.** `surfaces.ts` points `notifications` at
      the new route; `sessions` stays. No spec navigates by URL, so no
      navigation changed anywhere else.
- [x] **The coverage map follows the code.** `userNotificationChannel`'s surface
      is the notification settings component rather than the devices page, and
      the report is regenerated.
- [x] **Photographed.** The screenshot walk gains `notifications`; `devices` now
      photographs the sessions page alone.

## Done when

Devices shows sessions and nothing else; notifications live on their own route
with the email switches on it; the model declaration sits on the surface that
answers it; each page names the other list; the test notification's tap
confirmation still arrives where the reader was sent; and the gate is green.

## Log

- 2026-09-09 — implemented. Gate: 929 unit/repository/Worker checks, 345
  rendering checks and **49 browser checks** passed, with `bun run typecheck`,
  `bun run lint` and `bun run check:model`. The domain coverage report
  regenerated with the moved surface; item counts are unchanged, since a
  surface moving is not a field appearing.
- 2026-09-09 — two things the split exposed rather than caused, both fixed.
  - `tests/render/devices.spec.ts` — the *sessions* spec — navigated by the
    `notifications` surface. Harmless while both resolved to one URL, and
    exactly the mislabel that sharing a page hides. It opens `sessions` now.
  - Two browser checks were failing before this work and would have been
    blamed on it: the shared `signInThroughLoginForm` helper still pressed
    Sign in after filling the code, which the sixth-digit submit had already
    disabled. Recorded in full in
    [the sign-in plan's log](2026-09-09-01-sign-in-code-autofill.md#log),
    which owns that change.
- 2026-09-09 — **for the help lane, not done here.**
  `sites/help/content/notifications.mdx` tells the reader to open the
  "Signed-in devices" page and use its notification settings. After this split
  that is wrong: the settings are on `/#/notifications`. The help package is
  another agent's working tree and was deliberately not edited from here. It
  needs a content correction in all three locales.
