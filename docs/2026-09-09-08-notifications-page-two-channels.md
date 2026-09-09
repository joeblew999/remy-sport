# Plan — the notifications page, with two channels on it

Status: implementation changes present 2026-09-09; verification and checklist
reconciliation remain open. The working tree contains notification-settings and
translation changes; the style gate currently reports a muted-caption violation.
The proposal below is not a claim that those changes are accepted.

Two decisions taken by the
Product Owner the same day and recorded below; the rest is theirs to approve.

The Product Owner's report: *"we have push notifications and email notifications
and the page is just wrong and illogical now."*

They are right, and "now" is the load-bearing word. The page was coherent when
it answered one question — *can this browser be reached, and what for* — and it
was split onto its own route on 2026-09-09
([the split](done/2026-09-09-06-notifications-off-the-devices-page.md)) for exactly
the reason it is now incoherent: **email arrived and was fitted into a page
built for push.** It went in as one grey sentence and a second, differently
shaped switch on the end of each row. Nothing was re-thought around the fact
that there are now two channels.

This plan does that re-thinking. It also fixes four things that are not taste
but defects: a control that does nothing, a gate on the wrong tier, a preference
list nobody in the native app can touch, and a page that never says what it is
about.

## What is actually wrong

Ten findings, from reading
[`components/notification-settings.tsx`](../src/web/components/notification-settings.tsx),
[`pages/notifications.tsx`](../src/web/pages/notifications.tsx),
[`api/notifications.ts`](../src/api/notifications.ts),
[`api/push.ts`](../src/api/push.ts) and the model. The first five are defects.
The last five are the shape the Product Owner is reacting to.

### Defects

**1. The push column is gated on the wrong thing.**
[`notification-settings.tsx:367`](../src/web/components/notification-settings.tsx#L367)
disables every type checkbox unless `state.status === "on"` — whether **this
browser** holds a subscription. But a preference is an **account** fact:
`userNotificationPreference` is keyed on `userId`, and
[`audienceFor`](../src/api/push.ts) reads it for every device the account has.
So a reader who registered their phone and then opens the page on a laptop finds
every push preference frozen. They cannot manage their phone from their laptop,
and nothing on the page says why.

**2. The frozen checkboxes still read as ticked.**
The same rows are `checked={!muted}`, and absence of a preference means *on* for
push ([`wantsChannel`](../src/api/push.ts#L184)). With push off in this browser
the reader sees five ticked, greyed boxes — which reads as "you are getting all
of these" at exactly the moment nothing is being delivered here.

**3. In the native app nobody can set any preference, ever.**
`status` is `native` / `native-off` / `native-denied` in Tauri, never `on`, so
the `!== "on"` test disables the whole list permanently. A native reader who
also has a registered phone cannot mute anything from the app.

**4. An email switch that can never deliver.**
`OFFERED` includes `ROSTER_CHANGE`, and every row gets an email switch. But
[`registrations.ts`](../src/api/registrations.ts) has **no `EMAIL` renderer** for
it, and says so deliberately: *"a channel with no copy is not sent on… that is
the Product Owner's call, and this is what the code looks like before they make
it."* Turning that switch on writes a preference row nothing will ever read.
`tests/repo/notifications.test.ts` compares **types**, not (type, channel) pairs,
so nothing catches it. This is the precise failure that check was written to
prevent, one dimension along.

**5. The page loads its own subject and throws it away.**
`data.following` — the teams, events and players this reader follows, with names
already resolved — is fetched here and never rendered; the list lives on Home.
Nothing on this page fires unless you follow something, and the page never says
so. A reader following nothing sees a full set of switches that cannot produce
a single notification.

### Shape

**6. One question, two widgets, opposite polarity.**
Push is a `Checkbox` that starts ticked (opt-out). Email is a `Switch` that
starts off (opt-in). Same row, same question — *do you want this?* — answered
with two different controls pointing two different ways. The server's asymmetry
is correct and deliberate (`wantsChannel`, and the reasoning above it is sound);
exposing it as two widgets is not.

**7. Email is labelled five times and push not at all.**
`m.email_channel()` renders on every row beside its switch, because there is no
column to carry it. The checkbox has no label at all.

**8. The two channels are not peers on the page.**
Push gets three blocks — a toggle, a test button with five result states, and a
device list under its own heading. Email gets one `Muted` sentence, filed inside
*What to hear about*, which is a different question. `MANAGE_OWN_NOTIFICATION_CHANNELS`
promises add / remove / verify / enable / disable; for email the page offers
none of the five, though `userNotificationChannel.isEnabled` exists on the row
and [`unsubscribe.ts`](../src/api/unsubscribe.ts) can already switch a type off
from a link in a mail.

**9. The page's own words describe half of it.**
`notifications_intro` is *"Get a notification when a game you follow tips off,
changes score, or ends"* — no email, no event reminders, no roster changes.
`push_devices` is *"Devices receiving notifications"*, which now names the whole
page while listing only browsers.

**10. The model groups these and we ignore it.**
Every `NOTIFICATION_TYPE` carries a `categoryCode` — LIVE, REMINDER, TEAM — and
`NOTIFICATION_CATEGORY` is already in the localised vocabulary map as
`notificationCategories`, so `label("notificationCategories", …)` works today in
all three locales. The five offered types are listed flat.

## The two decisions, taken

| Question | Answer | Consequence |
| --- | --- | --- |
| One matrix, or a section per channel? | **One matrix.** Types as rows, Push and Email as two labelled columns, the same control in both. | Both channels become peers, the label moves to a column header, and "am I getting this twice" is one glance instead of a scroll. |
| Roster Change email: write the template, or stop offering it? | **Stop offering it**, with the reason on the cell. | No new copy. A repo check then makes every offered (type, channel) pair prove a renderer exists, so it cannot drift back. |

The matrix does **not** change `wantsChannel`. The server keeps opt-out push and
opt-in email; the page stops rendering that difference as two kinds of control,
because a control shows the reader's actual state either way.

## The shape it becomes

```
Notifications
About the teams, events and players you follow — on this device, or by email.

┌ What you follow ─────────────────────────────────────────────┐
│  Assumption College U16 Boys                          Team   │
│  Bangkok Schools League                              Event   │
│  ─ nothing here means nothing below can fire ─               │
└──────────────────────────────────────────────────────────────┘

┌ Where notifications go ──────────────────────────────────────┐
│  This device        on          [Turn off]  [Send a test]    │
│  Safari on Mac (app)         · this device        [Forget]   │
│  iPhone                             off           [Forget]   │
│  ────────────────────────────────────────────────────────    │
│  Email              gedw99@gmail.com · verified              │
└──────────────────────────────────────────────────────────────┘

┌ What to hear about ───────────────────── Push ──── Email ────┐
│  Live                                                        │
│    Match Start                            [x]        ( )     │
│    Score Update                           [x]        ( )     │
│    Match End                              [x]        ( )     │
│  Reminder                                                    │
│    Event Reminder                         [x]        ( )     │
│  Team                                                        │
│    Roster Change                          [x]         —      │
│                                                  push only   │
└──────────────────────────────────────────────────────────────┘

These are the browsers registered to receive notifications, not where your
account is signed in: Signed-in devices →
```

Three sections answering three questions in the order a reader asks them:
**what is this about**, **where can it reach me**, **what for**. Today the page
answers the second, then the third, and never the first.

Group headings are the model's categories, not ours. A cell that cannot deliver
is empty with its reason beside it, not a live control that silently does
nothing.

## Steps

Ordered so each stage is shippable on its own and the defects land before the
cosmetics. Nothing here needs a schema change.

- [x] **1 · The page says what it is about.** Render `data.following` — already
      fetched and discarded — as the first section, reusing `components/following.tsx`
      rather than a second copy. Its empty state says that nothing below can fire
      until you follow something, with a link to Discover. Rewrite
      `notifications_intro` to name both channels and more than games; three
      locales.
- [x] **2 · The push gate moves to the account tier.** Replace
      `state?.status !== "on"` on the type rows with "this account has at least
      one enabled PUSH channel" — which `notifications.devices` already returns.
      Fixes defects 1 and 3 together: a laptop can manage the phone's
      preferences, and the native app is no longer locked out. `state` keeps
      governing *this device's* controls only — the toggle, the test button —
      which is the one thing it actually knows about.
- [x] **3 · A frozen row states its reason.** When the push column is genuinely
      unusable — no registered device on the account — the column is disabled
      **and says so** once, at the column head, instead of five ticked grey boxes
      that read as consent. New message, three locales.
- [x] **4 · Every offered cell proves a renderer exists.** A `CHANNELS_FOR`
      table beside `OFFERED` naming which channels each type is offered on, and
      `tests/repo/notifications.test.ts` extended from types to **(type, channel)
      pairs**, in both directions: a renderer with no cell cannot be reached, a
      cell with no renderer does nothing. Roster Change's email cell goes, with
      "push only" beside it. This is the check that makes decision two permanent.
- [x] **5 · The matrix.** `FieldSet` / `FieldLegend` / `FieldGroup` / `Field` /
      `FieldDescription` from `components/ui/field.tsx` — the registry item every
      other form in the app already uses, and the wheel the Product Owner's rule
      of 2026-09-08 says not to reinvent. One `FieldSet` per model category,
      legend from `label("notificationCategories", code)`. Two columns, one
      control type, labelled once at the head from
      `label("notificationChannels", "PUSH" | "EMAIL")` — the model's own names,
      like the type names already are, rather than the hardcoded
      `m.email_channel()`.
- [x] **6 · The two channels sit together.** Rename the section to *Where
      notifications go* (`push_devices` currently claims the whole page while
      listing only browsers) and put the email address in it, beside the
      browsers, as the row it is. The address keeps its three states — none,
      unverified, verified — as a row rather than a sentence filed under the
      wrong heading.
- [ ] **7 · The device list can be acted on.** Every row gets **Forget**, and
      the `device_not_registered` warning gets the button its prose currently
      describes ("turn them off and on again"). Needs one API addition:
      `unsubscribe` takes an endpoint, and the endpoint is deliberately never
      returned to the client — correctly, it is a bearer capability. So a new
      input keyed on the **fingerprint** the list already carries, matched
      server-side by recomputing `deviceFingerprint` over the caller's own rows.
      Scoped to the caller, like `unsubscribe` already is. The sibling Devices
      page gives every session a Sign out button; this list gives none.
- [ ] **8 · Photographed and walked.** `notifications` is already in the
      screenshot walk; it gains the signed-in matrix in light and dark across
      the three locales, and a rendering spec per state that the type list is
      live with push off in this browser but registered elsewhere — the defect
      in step 2, pinned so it cannot come back.

## Open, and not decided here

- **Which types are offered at all.** Five of fourteen, because only five have
  senders, and the repo check holds that in both directions — so growing the
  list means writing the triggers first. `DAILY_DIGEST` and `WEEKLY_DIGEST` are
  the obvious email-shaped candidates and nothing sends them. Not in this plan.
- **A master off for email.** `userNotificationChannel.isEnabled` exists on the
  EMAIL row and nothing reads or writes it from the UI, so "stop all email"
  can only be done one type at a time, or from a link in a mail. Worth a switch;
  needs the Product Owner to say whether a channel-level off should override the
  per-type ons or merely look like it does.
- **The help content is still wrong.** `sites/help/content/notifications.mdx`
  tells readers the settings are on the Signed-in devices page. Carried over
  unfixed from [the split](done/2026-09-09-06-notifications-off-the-devices-page.md#log);
  it is another agent's working tree. Three locales.

## Done when

The page opens with what it is about; push preferences are settable from any
signed-in browser and inside the native app; no control on the page stores a
preference nothing reads, and a repo check holds that per channel, not just per
type; both channels are named by the model in one matrix grouped by the model's
categories; the email address sits beside the browsers it is a peer of; every
device row can be acted on; and the gate is green.

## Log

- 2026-09-09 — proposed, at the Product Owner's report. Two decisions taken the
  same day: one matrix rather than a section per channel, and Roster Change
  loses its email cell rather than gaining a template. Nothing implemented.
- 2026-09-09 — **tech debt found while reading, recorded here so it is not lost.**
  Findings 1–5 above are defects that predate this plan and are not caused by it.
  Finding 4 in particular is a check that exists and is one dimension short:
  `tests/repo/notifications.test.ts` proves every type can be muted and every
  switch corresponds to a sender, but says nothing about channels — so the day
  EMAIL was added as a second channel, its own guard stopped covering the thing
  it was written for. Step 4 pays it.

## Log — implemented 2026-09-09

Steps 1–6 done. What each one actually changed:

- **1.** `Following` now renders at the top of `/#/notifications`, the same
  component Home uses. `data.following` was fetched by the settings panel and
  discarded; the page never said that nothing below fires unless you follow
  something.
- **2.** `pushReachable` is `devices.devices.some(d => d.enabled)` — the account,
  not this browser. Fixes both halves of the defect at once: a laptop can now
  manage a phone's preferences, and the native app is no longer permanently
  locked out, because its status is `native` and never `on`.
- **3.** When no device is registered the column is off and says so once, at the
  head, instead of five ticked grey boxes that read as consent.
- **4.** `CHANNELS_FOR` names the channels each type is offered on, and
  `tests/repo/notifications.test.ts` gained a second rule comparing **(type,
  channel)** pairs in both directions. Proven to bite: putting `EMAIL` back on
  `ROSTER_CHANGE` fails with *"offered on EMAIL and nothing renders it"*.
  Association is per file, which is coarser than per call site and documented as
  such in the check.
- **5.** One matrix: `FieldSet` per model category with `FieldLegend` from
  `label("notificationCategories", …)`, two columns headed from
  `label("notificationChannels", …)`, and the **same control in both** — the
  checkbox-beside-a-switch asked one question with two widgets pointing two
  ways. `ROSTER_CHANGE`'s email cell is *Push only* text, not a control.
- **6.** The section is *Where notifications go*, and the email address is a row
  in it beside the browsers rather than a caption filed under *What to hear
  about*, which asks a different question.

Six messages added in three locales. 360 rendering checks pass, including the
email matrix in three locales and both schemes.

### Still open

- **Step 7 — Forget on a device row.** Needs the API addition the plan
  describes: `unsubscribe` keyed on the fingerprint the list already carries,
  matched server-side. Not started.
- **Step 8 — the captures.** `notifications` is in the walk and was not re-shot;
  the desktop capture also hits the known WebKit stall recorded in the status
  index.
- The three items under *Open, and not decided here* are unchanged.
