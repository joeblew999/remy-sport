# Plan — the email channel, on React Email

Status: proposed 2026-09-09, nothing implemented. Re-cut from the combined
sign-in-and-email plan at the Product Owner's review. Decided by the Product
Owner the same day: emails are React-based, and there is no magic link.

## What is true today

Read from the tree; no code was changed to write this.

- **The pipe exists and reaches nobody.** `src/api/transports.ts` has the EMAIL
  transport, one renderer per channel by design; `src/api/notify-queue.ts:251`
  and `:357` render game and event email in the reader's locale;
  `src/api/unsubscribe.ts` supplies List-Unsubscribe and records an opt-out.
  `src/api/push.ts:113-123` picks recipients from enabled
  `userNotificationChannel` rows that hold an explicit preference
  (`tests/worker/push.test.ts:1179`: an unstated EMAIL preference means no).
  But no code path writes a real person's EMAIL row: the literal
  `channelCode: "EMAIL"` appears only in the unsubscribe opt-out and in the
  seeded fixtures (`src/domain/model/entities.ts:650`). Every notification
  email the app can render goes to nobody.
- **The API and the screen are push-only.** `src/api/notifications.ts` pins
  `channelCode: "PUSH"` in eight places. `src/web/components/notification-settings.tsx`
  is a push switch and the five offered types; no channel appears in it.
- **Every email is plain text.** Nothing sets the `html` field on a mail;
  `src/mail/mailer.ts:99` and `src/api/transports.ts:147` only forward it. Each
  email's whole body is one Paraglide message per locale — `email_otp_body`,
  `email_invite_body`, `email_game_text`, `email_reminder_text` — so for plain
  text there is already exactly one source per email.
- **Two sending identities, one reputation.** `src/mail/mailer.ts` sends
  transactional mail from `noreply@remy.ubuntusoftware.net` and bulk from
  `notifications@notify.remy.ubuntusoftware.net`, but
  `scripts/ops/provision.ts:560-573` records that Cloudflare Email Sending is
  enabled per zone, so both sign with the zone key and the split earns no
  separate reputation yet. The comment at `src/mail/mailer.ts:38-44` still
  claims it does.
- **Two comments point at things that do not exist.** A deliverability
  document, `docs/dev/email-deliverability.md`, <!-- docs-check-ignore --> was
  never written and is cited by `src/mail/mailer.ts:44`,
  `scripts/ops/provision.ts:571` and `wrangler.toml:315`. And
  `bun run check:notifications`, cited at
  `src/web/components/notification-settings.tsx:43`, is a stale name: the
  check exists as `tests/repo/notifications.test.ts`, both directions, and
  runs in the gate.

## Which emails, and which half of this plan touches them

The plan has two halves, and they cover different sets. The template half
(React Email) is every email the app sends. The channel half — the audience,
the switch, opt-in, unsubscribe — is notifications only. Sign-up is not a
separate email: signing in is signing up (`src/web/pages/login.tsx`), so a
first-time address that redeems the code gets an account, and the code mail
is the only thing it ever receives.

| Email | Sent from | Sender | Templates | Channel, switch, opt-in, unsubscribe |
| --- | --- | --- | --- | --- |
| The sign-in code | `src/auth.ts:291`, per purpose: sign in, verify email, change email | transactional, `noreply@remy.ubuntusoftware.net` | yes | no — always sent, no preference, no `List-Unsubscribe`, no link |
| The co-organiser invitation | `src/auth.ts:266` | transactional | yes | no — always sent to the invited address |
| Game start | `src/api/notify-queue.ts:260` | bulk, `notifications@notify.remy.ubuntusoftware.net` | yes | yes |
| Game end | `src/api/notify-queue.ts:262` | bulk | yes | yes |
| Event reminder | `src/api/notify-queue.ts:361` | bulk | yes | yes |

The bulk sender and the `List-Unsubscribe` header are attached in one place,
`src/api/transports.ts:137-148`, which only the queue reaches; the two
transactional mails never pass through it. The unsubscribe step below asserts
that split on captured headers.

## Decided

- **React Email, in the Worker, under one rule.** Every word comes from a
  Paraglide message; a template holds structure only. A repo check fails on a
  literal sentence inside a template. That rule is what keeps one source of
  truth once an email has an HTML part; the alternative, a second message per
  email holding the HTML, is the duplication the rule exists to prevent.
- **The cost is accepted and measured.** `react-dom/server` joins the Worker
  bundle, which is 2.4 MB today. The size before and after goes in the log.
  No build-time rendering machinery: it would keep the preview from matching
  what ships.
- **Opt-in.** An email preference is off until the reader turns it on, the
  rule `src/api/push.ts` already applies and the one the unsubscribe law
  expects. Only a verified address can be turned on.
- **No magic link.** `src/auth.ts:273` says why: a link in an inbox is a bearer
  credential that survives forwarding. The sign-in code's own plan is
  [the sign-in code, filled in by the phone](2026-09-09-01-sign-in-code-autofill.md).

## Steps

Ordered so each is provable on its own.

- [ ] **Register the verified sign-in address as the EMAIL channel.** On
      session creation — `databaseHooks.session.create` in
      `src/auth.config.ts:189` is the one chokepoint every sign-in passes —
      upsert the `userNotificationChannel` row: EMAIL, label `primary`, the
      address the code just proved, enabled. When the address changes, the old
      row goes. Proof: a Worker test signs in and finds the row, so the seeded
      fixtures stop being the only EMAIL rows in existence.
- [ ] **A channel in the preferences API.** `src/api/notifications.ts` takes
      and returns `channelCode`, PUSH by default so every existing caller is
      unchanged. Proof: the Worker tests for preferences run for EMAIL as well
      as PUSH.
- [ ] **The switch on the settings screen.** Per type, an EMAIL switch beside
      the push one, the registry's `Switch`, disabled with its own sentence
      while the address is unverified. Proof: rendering tests in EN, TH and JA,
      light and dark, and `tests/repo/notifications.test.ts` still green.
- [ ] **React Email.** One component per email in a new folder beside
      `src/mail/mailer.ts`, each returning subject, text and HTML from Paraglide
      strings in the given locale; `src/auth.ts` and `src/api/notify-queue.ts`
      call them instead of assembling copy at the call site. Proof: the dev
      outbox shows both parts; a Worker test renders every template in every
      locale. The same day: the repo check that fails on a literal sentence in
      a template, and the Worker bundle size before and after, in the log.
- [ ] **Prove the unsubscribe round trip.** A bulk notification carries
      `List-Unsubscribe` and the sign-in mail carries none, asserted against
      the outbox, which records `from` and `headers` exactly
      (`src/mail/mailer.ts:130-146`).
- [ ] **Correct the comments.** The DKIM claim in `src/mail/mailer.ts` matches
      `scripts/ops/provision.ts`; the three citations of the never-written
      document point at the provisioning record instead; the settings comment
      names `tests/repo/notifications.test.ts`. Then the docs-check markers
      here and in `docs/README.md` go. Proof: docs-check green without them.
- [ ] **One real email.** A signed-in person with EMAIL on receives a game
      notification, end to end through the dev outbox. Proof: the capture, in
      the log.

## Done when

A signed-in person with a verified address can turn email on for a
notification type and receive that notification, with an HTML part, shown end
to end through the dev outbox; bulk mail carries `List-Unsubscribe` and sign-in
mail carries none, asserted on captured headers; every template's words come
from Paraglide and a check says so; the Worker bundle's growth is written down;
and no comment in the tree names a file or a command that does not exist.

## Log

- 2026-09-09 — written, re-cut from the combined plan (`aa27225` to
  `1df0b5c`) at the Product Owner's review. Kept from it: the audience finding,
  the push-only API and screen, plain text today, the per-zone DKIM
  correction, the single-source rule. Dropped: the comparison with a proposal
  nobody in the repo can read, the essay on a decision the code already made,
  and a step to build the offered-types check, which already exists.
