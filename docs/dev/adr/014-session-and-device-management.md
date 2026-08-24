# ADR 014: Device management, from core rather than a plugin

**Status:** Accepted (2026-08-24)

## Context

[ADR 012](012-passwordless-email-otp.md) extended sessions to 30 days, because a code costs an inbox round trip where a password autofills. That trade is only safe if a session can be ended on demand: a long-lived session is a convenience while it is yours and a problem the moment it is not, and until now the only way to end one was to wait a month.

The obvious candidate was the `multiSession` plugin, on the strength of its name. **It is the wrong tool** — it provides multi-*account* switching (being signed into two accounts at once, like a Google account switcher), and would not answer "where am I signed in?" at all.

Better Auth **core** already exposes `/list-sessions`, `/revoke-session`, `/revoke-sessions` and `/revoke-other-sessions`, and the `session` table already stores `ipAddress` and `userAgent`. Nothing used any of it. No plugin, no migration.

## Decision

A **Devices** screen in the SPA, reachable from the account control, listing sessions with a sign-out control for each and a "sign out everything else" action. The admin console's equivalent for other users (`list-user-sessions`) remains a follow-up.

### `ipAddress` was always empty, and that mattered

Better Auth's default header list does not include `CF-Connecting-IP`, which is where Cloudflare puts the real client IP — so every session row recorded an empty address. Harmless while nothing read it; not harmless the moment those rows are shown to a user as "your devices", since an entry with no address and no location is not something anyone can act on. `advanced.ipAddress.ipAddressHeaders` now lists `cf-connecting-ip` first, since Cloudflare sets it and strips any client-supplied copy.

### Device labels are deliberately coarse

`userAgent` is all there is. [devices.ts](../../../src/web/lib/devices.ts) reduces it to browser + platform — "Chrome on macOS" — because that is the level people recognise. UA sniffing is unreliable, and precision is not the goal: the question is only "is this one of mine, or something to revoke". Anything unrecognised says **"Unknown device"** rather than being forced into the nearest match, because a confident wrong guess is worse than an honest gap.

Order matters in the matching: Edge and Opera both carry "Chrome" in their UA, and Chrome on iOS reports "CriOS". Checking specific tokens first is what stops everything being labelled Chrome.

### The current session cannot be revoked from this screen

Signing yourself out from a device-management screen is a surprise, not a feature. The current row is marked and has no sign-out control; "sign out all other devices" is the deliberate way to do it in bulk. An impersonating admin session is also flagged, because an admin viewing as you creates a real session on your account and you should be able to see it.

## The bug this uncovered

The current session was not being marked, and the cause was not in the page.

Local D1 had **990 sessions** — 314 for one seeded actor — because every test sign-in creates a row and nothing removed them. `list-sessions` returns a bounded set, so past roughly a hundred rows the *newest* session stops being returned, and the page could no longer tell which one was current.

That is precisely the failure the organization list hit in ADR 013's predecessor: a bounded query plus accumulated rows means the newest item silently disappears, and the symptom appears in a feature far from the cause.

The page's behaviour was, on inspection, correct — with no matching token it marked nothing rather than guessing. The fix belongs in the data: `POST /api/dev/prune-sessions` keeps the five most recent per user and runs from the Playwright setup project. Five rather than one, because a devices screen is only worth testing when there is more than one session.

It is gated on the same dev-transport check as `/api/dev/outbox` and does not exist in production, where sessions expire on their own — and where an endpoint that deletes sessions in bulk would be a denial-of-service primitive.

## Consequences

**Positive**

- The 30-day session from ADR 012 is now safe to have: it can be ended.
- Four core endpoints that had been available since the project started are in use, with no plugin added.
- Session rows finally record a usable IP.

**Negative**

- Device identification is only as good as the user-agent string, which is guessable at best and absent for non-browser clients. The screen says "Unknown device" rather than pretending otherwise.
- A user with more than ~100 live sessions would still see a truncated list. Pathological in production, and the page degrades honestly rather than mislabelling a row.
- `/api/dev/prune-sessions` is a second dev-only endpoint. Both are gated the same way, but that gate is now load-bearing in two places.

**Follow-ups**

- The admin console can list and revoke *another* user's sessions (`list-user-sessions`, `revoke-user-session`); not built.
- Nothing notifies a user when a new device signs in, which is the other half of how this feature usually works.
- No rate limiting on `send-verification-otp`; `TEST_OTP` must be unset before real users.
