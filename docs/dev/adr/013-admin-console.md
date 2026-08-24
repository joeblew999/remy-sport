# ADR 013: The dashboard becomes an admin console, and the admin plugin starts working

**Status:** Accepted (2026-08-24)

## Context

[ADR 008](008-frontend-is-the-react-spa.md) scoped `src/views/` as an "auth harness", justified as *the only place auth and authorization are exercised against real data*. [ADR 012](012-passwordless-email-otp.md) gave the SPA sessions, sign-in, sign-out and role display — so that justification no longer holds. What remained unique to the dashboard was a permission matrix, a per-role events table, and a role switcher: a developer tool, not a product surface.

Meanwhile the admin plugin, configured since ADR 007, exposed 15 endpoints of which the codebase used exactly one (`create-user`, in the seed). Unused: `list-users`, `set-role`, `ban-user`, `impersonate-user`, `list-user-sessions`, `revoke-user-session`. And `session.impersonated_by` had been in the schema since migration 0003, never written.

That made the role switcher a hand-rolled, worse version of a feature already available: it *signed in as* another account, discarding the admin's identity and leaving no record.

## Decision

### 1. The admin plugin gets its own access controller — a third instance of one bug

The endpoints did not merely go uncalled; they did not work. As admin, `list-users` returned **"You are not allowed to list users"**.

The cause is exactly what [ADR 009](009-full-organization-adoption.md) found for `organization()`: supplying custom `ac`/`roles` **replaces** the plugin's own, so the seeded admin held none of the plugin's permissions. Same mistake, third plugin, and invisible for the same reason — nothing called the endpoints.

Merging the statement sets is the obvious fix and is wrong here, because of a collision that merging would hide. The plugin declares `user` and `session`; **both names are already taken** in `access-control.ts`, where `user: ["manage"]` is a domain notion and **`session` means a *camp session*** — a coaching event on a timetable — not an auth session. Merging would quietly make "may define a camp session" and "may revoke someone's login" the same permission.

So [admin-access-control.ts](../../../src/auth/admin-access-control.ts) is a separate controller, giving the codebase three scopes:

| Scope | Question | Vocabulary |
|---|---|---|
| Platform | what kind of actor is this? | event, team, player, score… |
| Organization | their standing inside one org? | organization, member, invitation |
| Admin | may they administer accounts? | user, session |

All six domain roles are declared to the plugin, with the five non-admin roles given explicitly empty grants. An omitted role does not *resolve*, and an unresolvable role is a different failure from a resolvable one that denies — the first looks like a configuration bug when it is a correct refusal. That is the ADR 009 `"owner"` mistake in miniature.

### 2. Impersonation replaces the fake switcher

`/admin/impersonate-user` keeps the admin session underneath, records `session.impersonated_by`, and has a `stop-impersonating` exit. The old switcher discarded the admin identity entirely and left nothing behind.

The dev "sign in as" row stays, relabelled and demoted, because impersonation requires already being an admin while the dev row is how you become one locally. It remains local-only: it reads the emailed code from the dev outbox, which does not exist in production.

### 3. What the dashboard is now

A platform-admin surface: the account list with role assignment, ban/unban, and impersonation, plus the existing permission matrix and events table. The matrix and table stay because `authz.spec.ts` drives them for all six roles, and that is real coverage — deleting the harness would delete it.

The account list is server-rendered through `auth.api.listUsers`, not read from the `user` table directly, so the plugin's own permission check is what gates it rather than a second answer to the same question (ADR 007 §3).

## Consequences

**Positive**

- The admin plugin works. Verified by round-tripping impersonation and confirming `impersonated_by` is populated — not by reading the config.
- Administration is auditable: who acted, and who was behind them.
- The dashboard has a reason to exist that is not "the only thing with sessions".

**Negative**

- A third access controller. Justified by the vocabularies genuinely differing — and by the `session` collision, which is the concrete reason merging is unsafe — but it is a third place to look.
- Hiding the console for non-admins is presentation, not enforcement. Tests assert the endpoints refuse a coach directly, because a hidden button is not a permission check.
- Impersonation is a real privilege-escalation surface. It is gated on `adminRoles: ["admin"]` and recorded on the session, but there is no audit log beyond the session row and no notification to the impersonated user.

**Follow-ups**

- Session/device management (`list-user-sessions`, `revoke-user-session`) is still unbuilt, and the core equivalents for self-service (`/list-sessions`, `/revoke-session`) remain the Netflix-style feature noted in ADR 012. Both are now unblocked by this fix.
- No rate limiting on `send-verification-otp`.
- `TEST_OTP` must be unset before the platform has real users.
