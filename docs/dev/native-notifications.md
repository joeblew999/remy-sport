# Native notifications on the Tauri app

Decided 2026-08-31. Not an ADR — those were dropped; the reasoning that belongs
beside code lives in code, and this file is here because it is a decision *not*
to build something, which leaves no code to hold it.

## What was actually true when this was written

Checked, not assumed. Three of the premises this was started from turned out to
be wrong, and one of them changes the answer.

| Claim | Reality |
| --- | --- |
| `src-tauri` targets `["app", "dmg"]`, capability is `core:default` only | **True.** One capability file, `desktop-schema.json`, no `platforms` key. `tauri-plugin-log` is the only plugin, and `plugins` in `tauri.conf.json` is empty. |
| No mise tasks for iOS or Android | **Wrong for iOS.** `tauri:ios:deps`, `tauri:ios:init` and `tauri:ios:dev` exist and are complete: CocoaPods is provisioned into `.gem/` on demand, the Xcode project scaffolds idempotently off `sources`, and the app runs in the Simulator against the local Worker. Right for Android — no `gen/android`, and `android` appears in `mise.toml` zero times. |
| `gen/apple` scaffolding is committed | **True**, icons and all. |
| `push.ts` returns `unsupported` for a Tauri webview | **True.** `pushState()` line 49 returns it before any feature detection, so the native app has no notification path at all. |
| The installed iOS PWA receives Web Push | **True**, and working since the VAPID keys were set. |
| A per-game Durable Object over WebSocket for live scoring | **Wrong. None of it exists.** No `durable_objects` binding, no `WebSocketPair`, no `@orpc/experimental-durable-iterator` in `package.json`. The only `DurableObject` in the tree is Cloudflare's ambient type in the generated `worker-configuration.d.ts`. Live scores are a **10-second poll**: `refetchInterval: 10_000` in `useLiveGames`. |
| `PushBody` is the single payload contract | **True**, since `sw.ts` began importing it from `src/api/push.ts`. |

The live-transport correction is the one that matters. It does not change the
recommendation, but it changes what Part 2 could be built on — see the note at
the end.

## a. Is native mobile a channel we are committing to?

**Not yet, and the repo says so more clearly than any argument would.**

The evidence points both ways and the balance is decisive:

*Toward committing.* The iOS path is further along than a standing start. Three
mise tasks provision and run it, `gen/apple` is committed, and there is real
Universal Links work — `src/routes/well-known.ts` serves
`/.well-known/apple-app-site-association`, and `mise.toml` has a whole tunnel
section existing **only** because Apple's CDN fetches that file from the public
internet and caches it per domain, so a named tunnel is required. Nobody builds
that by accident.

*Against.* All of it stops at "runs in the Simulator". `bundle.targets` is
`["app", "dmg"]` — macOS only. There is no `iOS` section in `tauri.conf.json`,
no signing configuration, no team identifier, no `macOS` signing block either.
There is no Android anything. And the AASA route "404s until configured", by its
own note. What exists is a development loop, not a distribution channel.

Meanwhile the installed PWA **is** a shipping mobile channel: it receives Web
Push today on iOS and Android, it is what `push_needs_install` exists to guide
people into, and it costs nothing per platform.

### What would have to be true to make APNs/FCM work worth it

Any *one* of these, and none currently holds:

1. **App Store distribution is a requirement**, for discovery or for an
   institution that will not accept "add to Home Screen". This is the most
   likely one to become true, and it is a business decision rather than a
   technical one.
2. **A capability the PWA cannot reach.** The one plausible candidate here is
   already being solved another way: live video uses MoQ over WebTransport
   (`src/web/lib/moq.ts`), and if a webview cannot carry it, that is an argument
   about the video stack, not about notifications.
3. **Notification delivery that Web Push measurably fails at.** iOS Safari Web
   Push has real limits — it requires installation, and iOS throttles background
   delivery. If match alerts are demonstrably arriving late or not at all for
   installed-PWA users, that is evidence. We have none: nothing measures
   delivery today, which is itself worth knowing.

Until one of those is true, native mobile push is work whose benefit is
speculative and whose cost is not.

## b. What background push on Tauri mobile actually costs

### The plugin

`tauri-plugin-notification` — the official one, already in the Tauri
organisation — **does local notifications only**. It wraps
`UNUserNotificationCenter` on Apple and `NotificationCompat` on Android: it
shows a notification the app itself creates, while the app is running or
scheduled ahead of time. It does not register with APNs, has no device token,
and receives nothing from a server. Assuming otherwise is the single easiest
mistake to make here, which is why this paragraph exists.

Remote push on Tauri v2 mobile is **not covered by a first-party plugin**. It
needs a community crate or one written here, and either way it must bridge two
platform SDKs from Rust. I am deliberately not naming a specific community crate
and a maturity rating: the honest statement is that this is outside the
first-party surface, and anything picked would need its own evaluation at the
time — a version number written down today would be stale and would read as more
researched than it was.

### Account and platform setup

- **Apple.** A paid Developer Program membership, an App ID with the Push
  Notifications capability, an APNs auth key (`.p8`), the key ID and team ID as
  Worker secrets. Provisioning profiles and signing, none of which exists here
  yet — there is no signing configuration at all.
- **Google.** A Firebase project, `google-services.json` in the Android app <!-- docs-check-ignore --> , FCM
  server credentials as Worker secrets. Plus the Android target that does not
  exist.
- Both are per-environment — and there are three environments now, not two, so
  this is a third and fourth credential pair per environment. They would become
  two more `SecretGroup` entries in `scripts/cf-provision.ts`, which already
  carries the all-or-nothing rule that makes a half-written pair a refusal
  rather than a silent rotation.

### Schema

`userNotificationChannel` is `(userId, channelCode, address, addressLabel,
secret, localeCode, isEnabled, verifiedAt)` with a unique index on
`(channelCode, address)`. A device token fits that shape without a migration in
spirit: `channelCode` becomes `PUSH` still or a new code, `address` holds the
token, `secret` is null because APNs and FCM need no per-subscription encryption
keys — unlike Web Push, where `secret` carries `p256dh` and `auth`.

The real cost is not the column. It is that `audienceFor` in `src/api/push.ts`
currently selects `channelCode = "PUSH"` and hands every row to one sender. A
second transport means the audience query returns rows of two kinds and the
caller must fan out by kind — which is a change to the one function every
notification in the product flows through.

### A second sender

`src/api/webpush.ts` signs a VAPID JWT and encrypts the payload per subscription
(`p256dh`/`auth`, RFC 8291). APNs is a different shape entirely: an HTTP/2
request to Apple with a JWT signed by the `.p8` key, no payload encryption, a
different error vocabulary for a dead token. FCM is a third shape again.

So `sendToRows` grows a branch, or gains a `Sender` interface with three
implementations. That is tractable — it is the sort of thing this codebase does
well — but it is a week of work with credentials, per-platform failure modes and
no way to test delivery except on real devices, for a channel we have not
committed to.

## c. Recommendation

**Do not build background mobile push yet.** The installed PWA already serves
mobile notifications, the native app is a Simulator-only development loop rather
than a distribution channel, and the cost above is real and per-platform.

Revisit when App Store distribution becomes a requirement — that is the trigger
most likely to fire — or when there is evidence that Web Push delivery is
failing users on iOS. Note that we cannot currently produce that evidence, which
is a smaller and more useful thing to fix first.

**Do build local notifications**, which is what shipped alongside this document.
They are worth having whichever way the above goes: the desktop app is a real
target today (`dmg`), and someone with the app open watching a match should be
told when the score changes without staring at the tab. It shares the
`PushBody` contract and `notificationUrl()` with the web path, so if native
remote push is ever built, the display and routing layer is already there and
only the *transport* is new.

### One thing Part 2 could not build on

The implementation was specified to render from "the existing live-scoring
WebSocket". There isn't one — live scores are polled every 10 seconds. So the
native notifier observes the same polled query the UI already uses and fires
when a score it has seen changes.

That is a weaker trigger than a push: it is bounded by the poll interval and it
only runs while the app is open, which is the case being served anyway. It is
also the right seam. If a WebSocket or Durable Object arrives later, only the
*observation* changes; the payload shape, the display and the tap routing do
not.
