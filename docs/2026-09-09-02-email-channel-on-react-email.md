# Plan — the email channel, on React Email

Status: implemented 2026-09-09, every step ticked with its proof below. Re-cut
from the combined sign-in-and-email plan at the Product Owner's review that
morning; decided by the Product Owner the same day: emails are React-based,
and there is no magic link. What remains is a deploy, since staging is the
only place mail really leaves.

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
- **Two comments pointed at things that do not exist** (fixed in the last
  step). A deliverability document that was never written was cited as the
  authority on DNS by `src/mail/mailer.ts`, `scripts/ops/provision.ts` and
  `wrangler.toml`. And a `check:notifications` script, cited in
  `src/web/components/notification-settings.tsx`, was a stale name: the
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
- **Rendered with `react-dom/server` directly**, which resolves to React's
  edge build under workerd. `@react-email/components` supplies the
  primitives; its own `render` is not used, because it brings html-to-text
  and prettier into a Worker that only needs markup, and the text part is
  the message itself, not a conversion of the HTML.
- **The preview is a dev route, not a second server.** `/api/dev/email/<name>?locale=th`
  renders any template with the fixtures' names on localhost, behind the
  same gate as the outbox. React Email's preview app would have meant a
  Next.js development dependency for the same picture.
- **Opt-in.** An email preference is off until the reader turns it on, the
  rule `src/api/push.ts` already applies and the one the unsubscribe law
  expects. Only a verified address can be turned on.
- **No magic link.** `src/auth.ts:273` says why: a link in an inbox is a bearer
  credential that survives forwarding. The sign-in code's own plan is
  [the sign-in code, filled in by the phone](2026-09-09-01-sign-in-code-autofill.md).

## Steps

Ordered so each is provable on its own.

- [x] **Register the verified sign-in address as the EMAIL channel.**
      `src/api/email-channel.ts`, called from the session-create hook's
      `after` (`onSessionCreated` in `src/auth.config.ts`), never blocking a
      sign-in: a row for the address the code just proved, label `primary`,
      enabled and verified; a row at another address goes. Proof:
      `tests/worker/email-channel.test.ts` signs in and finds the row, plants
      a stale address and sees it replaced.
- [x] **A channel in the preferences API.** `setPreference` takes
      `channelCode`, PUSH by default; `following` returns `emailOn` (opt-in,
      the other way round from `muted`) and `email` (the address, and whether
      it may be used). Proof: the same Worker file turns EMAIL on and off for
      a type without touching the push mute, and a caller naming no channel
      still means push.
- [x] **The switch on the settings screen.** Per type, the registry's
      `Switch` beside the push checkbox, off until turned on, disabled with a
      sentence naming why while there is no verified address; the sentence
      names the address otherwise. Proof: `tests/render/email-settings.spec.ts`
      in EN, TH and JA, light and dark, plus the unverified, absent and
      switch-on cases (9 passed); `tests/repo/notifications.test.ts` green.
- [x] **React Email.** `src/mail/templates/`: `render.tsx` (layout,
      paragraphs, links, footer, `toHtml`), `frame.ts` (styles and the
      doctype, the one file allowed a string with a space), and one component
      per email — `otp`, `invite`, `game`, `reminder` — each composing subject,
      text and HTML from the Paraglide message the text part already was;
      `src/auth.ts` and `src/api/notify-queue.ts` call them. Proof:
      `tests/unit/mail-templates.test.ts` renders every template in every
      locale (12 passed); the outbox records the HTML part. Same day:
      `tests/repo/mail-templates.test.ts` reads each template's syntax tree
      and fails on JSX text, a two-word string or any Thai or Japanese script;
      the Worker bundle is in the log.
- [x] **Prove the unsubscribe round trip.** The Worker file asserts the game
      email carries `List-Unsubscribe` and the bulk sender, with the link in
      both the text and the HTML, and the sign-in mail carries the
      transactional sender, no header and no link at all.
- [x] **Correct the comments.** The DKIM claim in `src/mail/mailer.ts` now
      matches `scripts/ops/provision.ts`; the three citations of the
      never-written document point at the mailer and the provisioning record;
      the settings comment names `tests/repo/notifications.test.ts`; the
      docs-check markers are gone. Proof: docs-check green without them.
- [x] **One real email.** The spectator signs in, follows team_001, turns
      EMAIL on for scores, and the queue's own job for gam_002 lands one email
      in the outbox: bulk sender, unsubscribe header, HTML with the game link
      and the way out. Proof: the last test in
      `tests/worker/email-channel.test.ts`.

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
- 2026-09-09 — implemented, the same day, on "Now do it". The Worker bundle
  before and after, production build: 2,444,877 bytes (552.84 kB gzip) to
  2,920,613 bytes (647.61 kB gzip), which is React's edge server renderer
  and the mail primitives. Verified on the running dev server:
  `/api/dev/email/otp?locale=th` answers with `lang="th"` and the code as
  the headline. What only staging can show: a real inbox receiving the HTML
  part, and deliverability with the same zone key on both senders.
- 2026-09-09 — the two repository checks this work owed the gate are paid, so
  the whole tier is green again. Both were the model refusing an addition that
  had not been accounted for, which is what they are for.
  - `tests/repo/authz.test.ts` had no note for the mail preview route.
    `GET /api/dev/email/:name` is now in `HONO_ROUTES` saying what guards it:
    the outbox's own gate, and it reads neither the database nor the outbox —
    the code it shows is the literal `424242`, not anybody's issued one.
  - `following` grew four output paths — `email`, `email.address`,
    `email.verified` and `emailOn` — and the evidence ledger had never seen
    them. They are enrolled as **unreviewed**, beside every one of their
    siblings on that procedure: the fields are implemented and tested by the
    steps above, but a domain-coverage classification is a different and
    heavier claim, and that review is its own scheduled work. Enrolling them
    as reviewed to make a check pass is precisely what the ledger forbids.
    `bun run ops coverage domain --write` regenerated the report; the count
    moves from 1,375 items to 1,379, unreviewed 1,311 to 1,315.
  - Gate after the fix: 929 unit/repository/Worker checks and 344 rendering
    checks passed, with `bun run typecheck` and `bun run lint`. No application
    source was changed to make a check pass.
