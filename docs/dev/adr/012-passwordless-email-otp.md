# ADR 012: Passwordless — email OTP replaces passwords, in both GUIs

**Status:** Accepted (2026-08-23)

## Context

Sign-in was email + password, and the password half had three problems that only look separate:

1. **The seeded credentials were committed.** `admin@remy.dev` / `admin1234!` sat in `seed.ts`, and `mise run deploy` runs `seed:remote` — so a working `admin`-role credential for the deployed site was published in the repository.
2. **The SPA had no authentication at all** (ADR 008 step 4, never started). It never learned who was viewing. The accept-invitation page from ADR 011 had to fetch `get-session` itself and then hand people to `/login` in the server-rendered harness — a visible stack change mid-flow.
3. Passwords bring their own tail: reset flows, verification, storage, strength rules. ADR 011 had just wired `sendResetPassword` and `sendVerificationEmail` to carry that weight.

ADR 010 gave the project a working mail transport, which is the precondition for a code-based flow. Better Auth ships `emailOTP`, and `password` became optional on `createUser` in 1.5 — so the seeded actors can exist without one.

## Decision

**Passwordless email OTP is the only way in, in both GUIs.**

### 1. Passwords are removed, not deprecated

`emailAndPassword: { enabled: false }`. The endpoints stop existing — `POST /api/auth/sign-in/email` now 400s, and a test asserts that so a second way in cannot quietly return. `SEED_USERS` carries no passwords. The `emailVerification` block from ADR 011 is gone too, and not by oversight: **possession of the emailed code is the verification**, so a follow-up "confirm your address" mail would verify nothing the sign-in did not. `user.emailVerified` comes back true from the first sign-in.

Sign-up is gone as a separate concept. An address that proves it can receive a code gets an account, so "sign in or sign up?" asked a question with no answer; `/login?mode=signup` and the home page's "Create Account" button are removed. The default-role hook from ADR 007 matters more than ever now that accounts self-provision — a test covers that a first-time address lands as `spectator`.

Settings worth naming: `otpLength: 6`, `expiresIn: 600` (ten minutes — long enough for a slow inbox, short enough that a code left in a mailbox is not a standing credential), `allowedAttempts: 3`, and **`storeOTP: "hashed"`**. The default is `"plain"`, which would put a working credential in the verification table in clear text — the same objection as storing a password.

### 2. Sessions last 30 days

Better Auth defaults to 7. Re-authenticating costs more than it used to: a password autofills from a manager, a code costs a round trip through an inbox. A weekly re-auth would put that tax on every coach. `updateAge: 1 day` slides the expiry on use, so an active user is never asked again.

### 3. Both GUIs run the same flow

Two stacks, so the markup cannot be shared (ADR 008) — but the flow is what users experience, and it now matches: ask for an email, then ask for the code, against the same two endpoints.

The SPA gained [`lib/session.tsx`](../../../src/web/lib/session.tsx), a `SessionProvider` wrapping the app. That is ADR 008 step 4, and it is what makes the two comparable at all — previously one knew about sessions and the other did not. The accept-invitation page now reads the shared session instead of fetching its own, and offers sign-in **inside the SPA** rather than bouncing to the harness.

### 4. A fixed code for the seeded actors, and why

`generateOTP` returns a fixed code for `@remy.dev` when `TEST_OTP` is set. This exists for two reasons, and the second one is the one that forced it.

**`test:deployed` reruns the whole suite against the deployed Worker**, and every test signs in. There is no dev outbox in production and no way to read a real inbox, so without this the choice is losing auth coverage on every deploy or building a way to read production mail.

**Codes are single-use.** This was diagnosed the hard way. The suite is parallel and the six actors are shared, so two tests signing in as the same actor race: whichever redeems first consumes the verification record and the other gets `INVALID_OTP`. A fixed *value* does not fix that, because the *record* is consumed — which is why `playwright.config.ts` now runs `workers: 1` everywhere rather than only in CI. The alternative, a throwaway account per test, is blocked by roles being assigned through the admin-only `createUser`.

Scope is the mitigation: `TEST_OTP` must be set explicitly, and only ever applies to the seeded demo domain. Real addresses always get a random code. **This is strictly narrower than what it replaces** — it is not in git, and it is not a password. Local runs use a well-known `424242` from `.dev.vars`; production would use a secret.

**Launch gate:** unset `TEST_OTP` in production before the platform has real users.

### 5. The genuine path stays covered

A fixed code for the shared actors would hide a broken mail path entirely, so [otp.spec.ts](../../../tests/otp.spec.ts) exercises the real thing against addresses nothing else touches: a random code generated, mailed, read back out of the outbox and redeemed; a code that cannot be used twice; a re-request invalidating its predecessor; a wrong code refused.

## Consequences

**Positive**

- No credential in the repository, and no password storage anywhere.
- Verification, reset, and strength rules all disappear rather than being maintained.
- The SPA knows who is signed in — the long-deferred ADR 008 step 4.
- OTP suits the Tauri targets: no OAuth redirect dance in a webview, and the same flow extends to SMS later via the `phoneNumber` plugin, with `Mailer` as the model for a second transport.

**Negative**

- **Sign-in now depends on email delivery.** If Cloudflare Email Service is misconfigured, nobody can sign in at all — where before only new accounts were affected. ADR 010's account prerequisites (Workers Paid plan, sending domain onboarded) are now load-bearing for authentication itself.
- The suite runs serially, 13s → ~50s. Bought determinism with wall-clock.
- `TEST_OTP` is a deliberate weakening of an otherwise strong mechanism, narrow and documented, and it must be removed before launch.
- Signing in costs a round trip through an inbox. The 30-day session is the mitigation, not a fix.
- Eight specs changed, because sign-in was copy-pasted into each. It now lives in [tests/helpers/auth.ts](../../../tests/helpers/auth.ts).

**Follow-ups**

- **Device management is available for free and not yet built.** Better Auth core already exposes `/list-sessions`, `/revoke-session`, `/revoke-sessions` and `/revoke-other-sessions`, and the `session` table already stores `ipAddress` and `userAgent` — everything the Netflix-style "these are your devices, sign this one out" screen needs. Note this is **not** the `multiSession` plugin, which is multi-*account* switching and would be the wrong tool. Long 30-day sessions make this more valuable, not less.
- Rate limiting on `send-verification-otp`. Nothing currently stops an attacker mailing someone a code repeatedly.
- `tests/organization.spec.ts` still leaks a `club-<timestamp>` org per run. Local D1 reached 126 organizations and broke a test by exceeding what `organization/list` returns; purged to 3, but the leak is not fixed.
