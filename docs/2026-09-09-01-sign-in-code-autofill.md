# Plan — the sign-in code, filled in by the phone

Status: implemented 2026-09-09, the phone check open. Re-cut from the
combined sign-in-and-email plan at the Product Owner's review. Two code
changes, proven in the rendering and browser tiers; what is left needs a
phone in the Product Owner's hand.

## The question

The Product Owner asked how ChatGPT signs you in with an emailed code without
your opening the mail app. Nothing on ChatGPT's side does that; the phone does.
On iPhone and Mac, Mail hands a one-time code to Safari's AutoFill — iOS 17 and
macOS Sonoma added Mail to the SMS codes AutoFill has read since iOS 12. On
Android, Google's autofill reads the code out of Gmail. Three conditions, all
on the app's side: the input is marked `autocomplete="one-time-code"`, the
mail lands in the phone's mail app, and the code is easy to find in the
message.

## What is already there

- **The field.** `src/web/pages/login.tsx` renders the registry's `InputOTP`
  (`src/web/components/ui/input-otp.tsx`, under the lock): six slots, digits
  only, and the `input-otp` library sets `autocomplete="one-time-code"` itself.
- **The mail.** `email_otp_subject` is "{otp} is your Remy Sport code" and
  `email_otp_body` opens with "Your code is {otp}." — the code first, in the
  subject and in the first line, in `messages/en.json`, `messages/th.json` and
  `messages/ja.json`. `src/auth.ts:274` sends it per purpose in the requesting
  browser's language. It carries no link, on purpose (`src/auth.ts:273`).
- **The code itself.** Better Auth's `emailOTP` (`src/auth.config.ts:262`): six
  digits, ten minutes.

## What is missing

1. **Focus.** After the email step the code field is not focused, so a code the
   phone offers has nowhere to land without a tap.
2. **Submit.** Six typed digits leave the reader on the Sign in button;
   `submitCode` runs only on the form's submit. `InputOTP` has `onComplete`.
3. **Proof on a phone.** Nobody has watched Mail offer the code: in Safari, in
   the installed web app, and in the Tauri shell (`src-tauri/`), where the
   system webview may or may not do it.

## Steps

- [x] **Focus the code field when the step opens.** `autoFocus` on the
      `InputOTP`. Proof: `tests/render/login.spec.ts` asserts the field has
      focus as the step opens (1 passed).
- [x] **Submit on the sixth digit.** `onComplete` redeems the completed value
      through the same `verify` the button uses; the button stays for a reader
      who pastes five and types one. Proof: the same rendering test sees the
      redemption request carry the six digits with no press; in
      `tests/e2e/spa-login.spec.ts` the correct code lands signed in and the
      wrong code shows its message, neither pressing Sign in (11 passed).
- [ ] **Watch it on a phone.** One iPhone session: Safari at staging, then the
      installed web app, then the Tauri build if one is at hand. Record which
      of the three offered the code from Mail. The same session confirms the
      two home-screen labels from
      [a distinct install name per environment](2026-09-08-05-pwa-install-name-per-environment.md)
      and the link behaviour from
      [installed web apps and links](2026-09-08-04-ios-installed-web-app-links.md):
      three device checks, one session.

## Not in this plan

- The email notification channel and HTML mail:
  [the email channel, on React Email](2026-09-09-02-email-channel-on-react-email.md).
- A magic link. Decided against beside the code — `src/auth.ts:273`: a link in
  an inbox is a bearer credential that survives forwarding — and autofill
  removes the friction it was proposed for.

## Done when

Six typed digits sign the reader in with no second press, in the browser tier;
and a phone has been seen to offer the code from Mail in Safari at least, with
the installed web app and the Tauri shell recorded either way.

## Log

- 2026-09-09 — written, re-cut from the combined plan (`aa27225` to
  `1df0b5c`) at the Product Owner's review: that plan was three plans and a
  rebuttal of a proposal nobody in the repo can read. The question that
  started it is answered above.
- 2026-09-09 — the two code steps done the same day, on "do it": `autoFocus`
  and `onComplete` on the field, one `verify` behind both the sixth digit and
  the button, the completed value taken from the field rather than state.
  Proofs as ticked. Open: the phone session, which is the Product Owner's.
- 2026-09-09 — **one caller of this change was missed, and is now fixed.**
  `spa-login.spec.ts` was moved off pressing Sign in when the sixth digit
  started submitting, but the shared helper `signInThroughLoginForm` in
  `tests/helpers/auth.ts` was not. It kept clicking a button that the completed
  field had already turned into a disabled "Signing in…", so Playwright waited
  out its timeout for a button that never comes back and then reported a
  missing identity element — against a sign-in that had worked.
  A race, and one that `freshActor()` loses reliably: its first-ever sign-in
  also creates the account, and since the email channel landed it registers an
  EMAIL channel too, so the submit is in flight for longer. It cost two browser
  checks, `identity-cache.spec.ts` and `orgs.spec.ts`, and nine more that then
  did not run. Found while splitting the devices page, which is unrelated to
  the cause. The helper now waits for the outcome instead of pressing. Full
  tier after the fix: **49 passed**.
