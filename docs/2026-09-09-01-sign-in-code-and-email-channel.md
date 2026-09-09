# Plan — the sign-in code and the email channel

Status: proposed 2026-09-09, nothing implemented yet. This replaces a four-phase
proposal that was written without reading the tree. Most of that proposal's
first three phases are already built and committed; this plan records what is
actually true, what is genuinely left, and two proposals that contradict
decisions already recorded beside the code.

No code was changed and no tests were run to write this. Every claim below cites
the file it was read from.

## What the proposal assumed, and what the tree has

| The proposal said | What is actually there |
| --- | --- |
| "Swap the sign-in input for shadcn InputOTP with `autoComplete="one-time-code"`, `inputMode="numeric"`, `pattern={REGEXP_ONLY_DIGITS}`" | Already done. `src/web/pages/login.tsx:130` renders the registry's `InputOTP` with `pattern={REGEXP_ONLY_DIGITS}`; the component is `src/web/components/ui/input-otp.tsx`, installed through shadcn and recorded in `components-lock.json`. `input-otp` supplies `autocomplete="one-time-code"` itself. |
| "Update Better Auth's `emailOTP` plugin `sendVerificationOTP`" | Already wired. `src/auth.config.ts:262` registers `emailOTP`; `src/auth.ts:274` implements `sendVerificationOTP`, picks the locale from the requesting browser's `Accept-Language`, and sends a per-purpose subject and body through Paraglide messages. |
| "Add React Email with an `emails/` folder … bilingual via your existing Paraglide messages" | Not there, and see [Not recommended](#not-recommended) below. Copy already lives in Paraglide (`messages/`, `project.inlang`); a second template system would put email copy in two places. |
| "One `renderEmail(template, props, locale)` helper … auth emails and queue notifications both call it" | The reuse point already exists and is a different, better shape: `src/api/transports.ts` takes **a renderer per channel**, so a caller who has not written email copy cannot accidentally send push copy in an email. The file's header comment explains why one shared renderer was rejected. |
| "Wire the EMAIL channel consumer on the notification queue … with List-Unsubscribe headers" | Already done. `src/api/transports.ts` has the EMAIL transport; `src/api/unsubscribe.ts` supplies `unsubscribeHeaders`/`unsubscribeUrl`; `src/api/notify-queue.ts:251` and `:357` render EMAIL subjects and bodies for game and event notifications, in the reader's locale. |
| "Onboard a bulk sending subdomain … keep auth emails on the apex" | Already designed and implemented. `src/mail/mailer.ts` splits `transactional` from `bulk` (`DEFAULT_FROM` = `noreply@remy.ubuntusoftware.net`, `DEFAULT_BULK_FROM` = `notifications@notify.remy.ubuntusoftware.net`), defaults to transactional so a forgetful caller gets the safer identity, and `senderFor()` is what goes on the wire. |
| "Blocked on the environments decision" | Not blocked. Three environments are settled and in the build: `dev`, `staging`, `production` — see `src/web/vite.config.ts` and [a distinct install name per environment](2026-09-08-05-pwa-install-name-per-environment.md). |
| "Notification preferences screen … exposing EMAIL alongside PUSH" | Genuinely missing, and it is the real gap. See below. |

## What is actually left

### 1. The email channel reaches nobody

The transport, the copy, the unsubscribe headers and the preference schema all
exist. What does not exist is an **audience**: nothing ever writes a real user's
address into `userNotificationChannel` with `channel_code = 'EMAIL'`.

Searching the tree for the literal `"EMAIL"` finds it in the transport
(`src/api/transports.ts`), the unsubscribe route (`src/api/unsubscribe.ts:202`),
the two queue renderers (`src/api/notify-queue.ts`), and otherwise **only in
seeded fixtures** (`src/domain/model/entities.ts:650` onwards). Those fixture
rows are model data, not something a signed-in person can produce.

So today: a real user has no EMAIL channel row, the queue finds no email
recipients, and every notification email the app can render goes to nobody.
`src/api/transports.ts` predicted exactly this failure direction and called it
the right one — "a channel silently reaches nobody until somebody writes its
copy" — but here the copy is written and the audience is what is absent.

The work is: register the user's verified sign-in address as their EMAIL channel
row, and give them a switch for it.

### 2. The preferences screen is push-only

`src/web/components/notification-settings.tsx` is 369 lines and contains no
occurrence of `email` or `channel`. It is a device-push screen: a push switch,
then the five offered notification types. There is no per-channel dimension in
the UI even though `userNotificationPreference` is keyed by
(user, type, channel) and has been since it was written.

Adding EMAIL here is a shadcn job — `Switch`, `Card`, `Item` are already
imported in that file, and the Product Owner's rule of 2026-09-08 stands: the
registry's components, not new ones.

The EMAIL switch must be gated on a verified address. Better Auth already knows
whether the address is verified; an unverified address must never reach the
queue.

### 3. Emails have no HTML part

`Mail.html` and `Rendered.html` are optional and **nothing ever sets them** —
`html:` appears only at the two points that forward it (`src/mail/mailer.ts:99`,
`src/api/transports.ts:147`). Every email this app sends is plain text today.

That is not a defect: plain text is deliverable, translatable and honest. It is
worth naming so nobody assumes an HTML pipeline exists. If the Product Owner
wants branded email, that is a decision to take on its own, and the cheapest
route is a small HTML wrapper around the same Paraglide strings — not a second
copy system. See [Not recommended](#not-recommended).

### 4. Sign-in code ergonomics

Real, small, and unproven on a device:

- **No auto-submit.** `src/web/pages/login.tsx` has no `onComplete` on the
  `InputOTP`; the reader types six digits and then presses Sign in. On a phone,
  where the code may be autofilled in one tap, that second press is the whole
  remaining friction.
- **No `autoFocus`** on the code field after the email step, so an autofilled
  code has nothing focused to land in.
- **Tauri.** `one-time-code` autofill is a system-webview behaviour. The app
  ships a Tauri shell (`src-tauri/`); nobody has checked whether autofill fires
  there or whether it degrades to paste.
- **Device check.** Nobody has confirmed on a real iPhone that Apple Mail's
  parser offers the code. This joins the two device checks already outstanding
  in [installed web apps and links](2026-09-08-04-ios-installed-web-app-links.md)
  and [a distinct install name per environment](2026-09-08-05-pwa-install-name-per-environment.md)
  — one device session should close all three.

### 5. Tech debt found while checking: two dangling references

Both are comments pointing at things that do not exist. Neither breaks a build,
which is why they survived; both mislead the next reader, which is the cost.

- `docs/dev/email-deliverability.md` **does not exist.** It is cited twice, as
  the authority on DNS, at `src/mail/mailer.ts:44` and
  `scripts/ops/provision.ts:571`.
- `bun run check:notifications` **does not exist** — not in `package.json`, not
  in `mise.toml`, not in `scripts/ops.ts`. It is cited in
  `src/web/components/notification-settings.tsx` as the check that keeps the
  offered-types list in step with what the Worker actually sends, "in both
  directions". So that drift is currently unchecked.

The second one matters more than a dead link: it is a named guard that is not
there. Adding an EMAIL channel to that screen makes the list bigger and the
drift more likely, so the check should exist before the screen grows.

There is also a **correctness fix** for the deliverability claim. The proposal's
premise — a bulk subdomain earns its own reputation, so a bad bulk sender cannot
take sign-in down — is not true on this account today. `scripts/ops/provision.ts:566`
records that Cloudflare Email Sending is enabled **per zone**: `ubuntusoftware.net`
is enabled and every subdomain of it signs with the zone key, which is how
production already sends with `dkim=pass`. The subdomain split is still worth
keeping (it is free, and it is right the day sending moves per-domain), but the
protection it is assumed to give does not exist yet. `src/mail/mailer.ts:38-44`
still states the stronger claim and should be corrected to match.

## Not recommended

Two items in the proposal contradict decisions already recorded beside the code.
Raising them here rather than silently dropping them; the Product Owner can
overrule either, but the reasons are on the record.

- **A magic-link button as the Android fallback.** `src/auth.ts:271` says why
  there is no link: "A link in an inbox is a bearer credential that survives
  forwarding." Adding `magicLink` re-introduces exactly the credential shape
  that comment rejects, for a convenience that a working auto-submit largely
  delivers anyway. If the Product Owner wants it, it should be a decision about
  that risk, not a fallback slipped in beside an ergonomics fix.
- **React Email.** Email copy is already Paraglide's, in `messages/`, in EN/TH,
  reviewed in one place and asserted by tests. A `emails/` folder of React
  templates makes it two places, adds a dependency tree to a repo with a
  [fewer dependencies](2026-09-05-03-fewer-dependencies.md) plan behind it, and
  buys HTML — which nothing currently asks for (§3). If branded HTML is wanted,
  a wrapper function around the existing strings is the smaller answer.

## Steps

Ordered so each one is provable on its own. Nothing here is started.

- [ ] **Fix the two dangling references.** Either write
      `docs/dev/email-deliverability.md` or repoint the two comments at what is
      true; correct the DKIM-reputation claim in `src/mail/mailer.ts` to match
      `scripts/ops/provision.ts`. Add a check under `tests/repo/` that a
      doc path named in a source comment exists, so this cannot recur.
- [ ] **Make `check:notifications` real.** Implement the check its comment
      already promises — the offered-types list against every `typeCode:` the
      Worker sends, failing in both directions — and add it to `bun run check`.
      Proof: it fails when a type is removed from `OFFERED` and still sent.
- [ ] **Register a verified address as an EMAIL channel.** On email
      verification, write the `userNotificationChannel` row
      (`channel_code = 'EMAIL'`, `address_label = 'primary'`); remove it or mark
      it disabled when the address changes or is unverified. Proof: a unit test
      plus the dev outbox showing a notification email addressed to a real
      signed-in user, which no test can produce today.
- [ ] **Add the EMAIL switch to the settings screen.** Per channel, per type,
      in `notification-settings.tsx`, using the registry's `Switch` — disabled
      with its own sentence when the address is unverified, in the same style as
      the existing per-state push sentences. Proof: rendering tests in EN/TH,
      light and dark.
- [ ] **Prove an unsubscribe round-trip.** A bulk notification carries
      `List-Unsubscribe` and the transactional sign-in mail carries none —
      asserted against the outbox, which records `from` and `headers` exactly so
      this assertion is about what ships (`src/mail/mailer.ts:130-146`).
- [ ] **Auto-submit and focus the code field.** `onComplete` submits;
      `autoFocus` on entering the code step. Proof: an end-to-end check that
      types six digits and lands signed in without pressing a button.
- [ ] **Check the Tauri shell.** Confirm `one-time-code` autofill fires in the
      system webview or degrades cleanly to paste. Record which, either way.
- [ ] **Verify on a device.** One iPhone session: Apple Mail offers the code on
      the keyboard, and the two home-screen labels from the install-name plan
      differ, and the installed-app link behaviour from the iOS links
      investigation. Three outstanding device checks, one session.

## Acceptance

- `bun run check` is green, including `check:notifications` and the new repo
  check for doc references named in comments.
- A signed-in user with a verified address can turn EMAIL on for a notification
  type and receive that notification by email, shown end to end through the dev
  outbox — not asserted from the transport in isolation.
- Bulk mail carries `List-Unsubscribe`; sign-in mail carries none; both are
  asserted against captured wire headers.
- Six typed digits sign the reader in with no second press.
- No comment in `src/` names a file or a command that does not exist.

## Decisions the Product Owner still owns

- Magic link: yes or no, against the forwarding risk recorded in `src/auth.ts`.
- HTML email: whether plain text stays the answer.
- Whether SMS stays in the vocabulary but hidden until there is a Thai provider.
  Nothing in this plan touches it; the schema already carries the channel.
