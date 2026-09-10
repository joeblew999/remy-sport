# Copy and controls that tell the truth

Archive: completed (2026-09-09). Back to [current work](../README.md).

The Product Owner, looking at the Meetings dialog: *"meeting says 'Create Test
Room'. that's just plane wrong."*

It was, and the button was the visible end of two larger faults. Both are fixed
and both are now held by a check rather than by anybody remembering.

## 1 · The experiment's copy on the product's dialog

`pages/meeting-test.tsx` is the dev-only two-seat Hang experiment. It came
first, so it owned the obvious message keys — `meeting_create`, `meeting_join`,
`meeting_peer_hint` — and when the real feature shipped on the same media
transport it inherited that vocabulary along with it:

| Where | Said | Should have said |
| --- | --- | --- |
| The invite button | "Create test room" | "Send invitations" |
| A room you opened by link | "No meetings yet." | "This meeting is not one of yours." |
| Each waiting participant | "Waiting for the other participant" | "Waiting for {name}." |
| A room with nobody else in it | "Waiting for the other participant" | "Nobody else has joined yet." |

Every other check was green throughout: the keys existed, all three locales
carried them, and the copy rules confirmed no string was hardcoded. None of
them asks what a sentence *says* on the screen it is on.

- [x] **The namespace is split.** The experiment's seventeen strings are
      `meeting_test_*` in all three locales — free to say "test room", because
      nothing else renders them. The product has its own.
      Proof: `bun run test` — 963 pass, `check-messages` reports 3/3 locales complete.
- [x] **The room's sentences are the room's.** `meeting_not_found`,
      `meeting_waiting({name})` and `meeting_alone` replace the borrowed ones.
- [x] **A check holds it.** `tests/repo/copy-surfaces.test.ts` — a message named
      for a dev-only surface reaches no shipped page, and a message *only* that
      surface uses must be named for it, which is what `meeting_create` was not
      on the day somebody needed a create button. Proven against five known-bad
      fixtures, not merely against a repository that is already clean.
- [x] **The tier that would have seen it.** `tests/render/meetings.spec.ts`,
      which step 6 of [Meetings](2026-09-09-13-meetings.md) ("Proof") had
      left unwritten — fourteen checks by the end of this record.

## 2 · A date the reader could not read

`<input type="date">` renders in the **browser's** locale. Everything this app
displays goes through `lib/dates.ts` and `Intl.DateTimeFormat(tag(locale))` —
the language the reader picked. So the app showed a Thai reader "15 ก.ย. 2026"
and asked them to type it back into a control their laptop drew as
`09/15/2026`. On a date of birth that is age-group eligibility; on a fixture it
is where somebody turns up. 05/09 and 09/05 are four months apart and both are
valid readings.

- [x] **`components/date-field.tsx`** keeps the native control and states the
      chosen value underneath it in the reader's language, through the existing
      formatters and the registry's `FieldDescription`. Eight fields across six
      files: both dates of birth, both event dates, both session times, fixture
      generation and rescheduling.
      Proof: `tests/render/date-field.spec.ts`, four checks, including that the
      Thai and English renderings genuinely differ — a test that asserted
      equality between two identical strings would prove nothing.

### Why not the registry's Calendar, which was the first answer

Checked rather than assumed, and the reason is recorded here because the next
person will reasonably ask:

1. **`@shadcn/popover` depends on `radix-ui`.** `@base-ui/react` is the single
   headless dependency in `package.json` and the whole registry surface is Base
   UI. A date picker is not a reason to run two headless libraries.
2. **`@shadcn/calendar` pulls `react-day-picker` and `date-fns`,** plus a locale
   bundle per language, onto a phone held at courtside.
3. **The native control is better on that phone** — the OS picker, already
   translated, already accessible, already familiar, and free.

A browsable month grid remains a feature somebody may want on its own merits.
It was not the fix for this.

## 2b · A meeting you can put in the diary

The Product Owner: *"for meeting, dont we need to pick a date and time? and that
of course means the domain model changes."*

It does need one, and the model was already right — so nothing there changed.
`meeting.starts_at` has existed since the feature landed, nullable, with *null
means now* written on the column; `meetings.create` already accepted an optional
ISO instant and already wrote it; `meetings.mine` already returned it. What was
missing was entirely GUI: the form never asked, so every meeting was "now", and
the list never showed it, so a time would have been invisible if it had.

- [x] **The form asks**, as an optional `DateField withTime` — the component
      from section 2, which is why the meeting time reads back in the reader's
      own language rather than the browser's. That matters more here than
      anywhere: a meeting invitation is the one screen where the three locales
      are looking at the same row.
- [x] **Empty still means now.** No required field, no "—" placeholder, and the
      Send button does not care. The hint says so in three languages.
- [x] **It leaves as an instant**, through `fromLocalInput(…, null)` — the
      browser's zone, because a meeting has no venue to take one from, unlike a
      fixture where the court's zone is the only correct answer.
- [x] **The list says when**, through `formatTimeOn`, which takes the day and
      the clock from one instant in one zone. Composing them separately read the
      date from the ISO string in UTC, which is the wrong day for any evening
      meeting east of London.

Proof: `tests/render/meetings.spec.ts`, 14 checks — the instant on the wire is
asserted as UTC rather than as somebody's wall clock, and the rendered row is
asserted by its properties rather than its characters, because Node and WebKit
write the same correct instant as "Oct 3 at 02:30 PM" and "Oct 3, 02:30 PM".

Not done, and deliberately: **the invitation itself does not yet carry the
time.** `push_meeting_body` is the title alone and `meetingMail` says who and
what but not when. That is a copy change in three locales plus a formatter on
the worker side, and it is the obvious next step rather than something to
smuggle into this one.

## 3 · The stylesheet's fourth rule

`src/web/styles.css` carries three rules of our own, and its header said
*"anything else that arrives here is a component that should have been
installed instead"*. That was a comment, and a comment does not stop the fourth
rule landing on a quiet afternoon — the dead half of that file, deleted in
2026-09, arrived one defensible class at a time.

- [x] **`tests/repo/styles.test.ts` now asks the harder question.** Every class
      selector must be on a list with the sentence saying why the registry
      cannot carry it. Three entries: `dark`, `topbar`, `moq-media`.
      Proof: adding `.scoreboard-flash` to the stylesheet fails the rule by
      name; the file was restored and the tier is green.

## What was surveyed and deliberately left alone

The Product Owner asked where else the app is bespoke rather than shadcn. The
sweep found less than expected, which is itself the answer — the design-system
work in [2026-09-08-01](2026-09-08-01-typography-and-design-system.md) held:

- **No raw tables, overlays, toasts, charts, pagination or progress bars.**
- **Two inline `style` props,** both structural: the sidebar's CSS variables
  (the registry's own documented pattern) and `display: contents`.
- **One raw interactive control,** in `your-players.tsx`, with the reason on it:
  `Item`'s hover rule is `[a]:hover:bg-muted`, anchors only, and that row must
  be *disableable*, which only a button can be.
- **The `rounded-lg border` wrapper in `people-picker.tsx` stays.** It groups a
  listbox with its empty message; `ItemGroup` would put `role="list"` around a
  `role="listbox"`, and `Card` would impose padding and semantics it does not
  want. A Tailwind utility on a layout div is what the stylesheet's own header
  sanctions.
- **`sites/help` is Fumadocs and stays that way.** It is already Base UI and
  Tailwind, it is deliberately outside the root dependency graph with its own
  `AGENTS.md` forbidding coupling, and Fumadocs *is* the not-reinvented wheel
  for a documentation site.

## Evidence

`bun run typecheck`, `bun run lint`, `bun run test` (963 in 99 files) and
`bun run test:render` (376) all green on 2026-09-09, after the people-picker
extraction landed alongside this work.
