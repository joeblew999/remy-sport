# ADR 011: Completing Better Auth — accept invitations, reset, verification, active organization

**Status:** Accepted (2026-08-23)

## Context

ADRs 009 and 010 adopted the organization plugin and gave the project a mail transport, and each left something unfinished. Taken together the gaps meant Better Auth was configured but not fully *working*:

- The invitation email shipped in ADR 010 pointed at `/app#/accept-invitation/:id` — **a route the SPA did not have**. A real email with a dead link.
- `sendResetPassword` and `sendVerificationEmail` were unset. Both are Better Auth hooks that silently do nothing when absent, so password reset appeared to succeed (`200`, "check your email") and sent nothing.
- `session.active_organization_id` existed as a column and was never written, so a coach belonging to a school had no current school. ADR 009 listed this explicitly.

## Decision

### 1. The accept-invitation page exists

[accept-invitation.tsx](../../../src/web/pages/accept-invitation.tsx), reachable at `#/accept-invitation/:id`. The hash router already parsed `page/id`, so no routing change was needed.

The interesting part is that `get-invitation` has three distinct failure modes that look identical from a distance, and conflating them is the difference between an invitee joining and being told their invitation is dead:

| Status | Meaning | What the page shows |
|---|---|---|
| **401** | no session | "sign in, then reopen this link" |
| **403** | signed in as someone else | "this invitation was sent to someone else" |
| other | expired, cancelled, already used, never existed | "no longer valid" |

The 401 case is the **common** one — someone clicking a link in their inbox is usually signed out — and the first version of this page reported it as "no longer valid", telling every genuine invitee their invitation was dead. Found by running the flow, not by reading the code.

The 403 case was also written wrongly at first: the page compared the session email against the invitation's email, which cannot work, because `get-invitation` never returns the invitation to a non-recipient. Better Auth reports the case itself with `YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION`. Comparing emails was inventing a mechanism the API already had.

The generic bucket stays deliberately vague. An invitation id is a bearer token, so a precise error is an oracle.

### 2. Password reset and email verification are wired

Both hooks go through the `Mailer` seam from ADR 010. Unlike invitations, Better Auth builds these URLs itself from `baseURL` — which is `BETTER_AUTH_URL` — so they are already canonical and need none of the care the invite link does.

**`requireEmailVerification` is deliberately NOT enabled.** Turning it on would lock out every account created before verification existed, including all six seeded actors — `auth.api.createUser` marks them unverified, and every other spec signs in as one. Making verification a gate is a data migration (backfill `user.email_verified` for existing rows), not a config flip. A test asserts the current state so that turning it on is a decision rather than a surprise.

`sendOnSignUp` is on, so new accounts can verify without hunting for a resend button. Harmless while verification is not enforced.

### 3. Sessions carry an active organization

A `session.create.before` hook fills `activeOrganizationId` from the user's **oldest** membership — oldest rather than arbitrary, so the choice is stable across sign-ins instead of depending on row order. Users in no organization get nothing, which is most of them; spectators never join one.

Like the mailer, this needs a database read, so it arrives through `buildAuthOptions(deps)` rather than living in the static config.

## Two testing traps, both worth writing down

**Better Auth's origin check is gated on the request carrying a cookie** (ADR 006 §9a). `sign-up/email` sets one via `autoSignIn`, so the *next* request in the same context needs an explicit `Origin` header — which a browser sends automatically and `APIRequestContext` does not. This produced a `403 MISSING_OR_NULL_ORIGIN` that looked exactly like a wrong password. Diagnosed by reproducing with `curl`, after two wrong guesses; the control — signing in with a fresh cookie jar — was what isolated it.

**`test:deployed` reruns the entire suite against the deployed Worker.** Any spec depending on `/api/dev/outbox` fails there by design, because the route does not exist under the real mail transport. The mail specs now skip themselves when `BASE_URL` is set. Without that guard, ADR 010 would have broken every `mise run deploy` — a failure that would have surfaced at deploy time rather than in local testing.

## Consequences

**Positive**

- The invitation email leads somewhere. Invite → email → accept → membership is covered end to end.
- Password reset works end to end, asserted by resetting a throwaway account and signing in with the new password — not merely by the endpoint returning 200.
- Org members have an org context, closing ADR 009's last follow-up.

**Negative**

- Verification is sent but not enforced, so `user.email_verified` is decorative for now. Recorded above with what enabling it would require.
- The accept page sends signed-out users to `/login` — the server-rendered harness (ADR 008) — which is a jarring hand-off between the two GUIs. The alternative was reimplementing sign-in inside the SPA before it has any session state at all, which ADR 008 step 4 has not reached.
- An invitee with no account cannot self-serve: they must sign up first, and nothing on the page offers that. Invitations to brand-new users therefore still need a human to explain the first step.

**Follow-ups**

- ADR 008 step 4 (session state in the SPA) is now the main thing left. The accept page fetches `get-session` directly because there is still no shared session context.
- `organization_role` is created by migration 0008 and still unwritten — dynamic roles are enabled but nothing creates one.
- `tests/organization.spec.ts` leaks a `club-<timestamp>` org per run; local D1 has accumulated dozens. Same class as ADR 006 §9d.
