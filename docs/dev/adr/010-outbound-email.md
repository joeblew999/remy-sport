# ADR 010: Outbound email via Cloudflare Email Service, with a testable transport

**Status:** Accepted (2026-08-23)

## Context

[ADR 009](009-full-organization-adoption.md) adopted the organization plugin's invitations and left this follow-up:

> Invitation endpoints ship with the plugin and work, but `sendInvitationEmail` is unset because the project has **no email transport at all**. Invitations are therefore only usable by reading the `invitation` row directly.

The project runs entirely on Cloudflare, and Cloudflare Email Service is the transport already in use. Two constraints shape the design, and both are account-level rather than code-level:

- **Sending to arbitrary recipients requires the Workers Paid plan.** Outbound sending is not available on the Free plan at all.
- **Until a sending domain is onboarded to Email Service, the binding may only send to *verified destination addresses* in the account.** After onboarding, it can send to any recipient.

Invitations by definition go to people who are not yet in the account, so both prerequisites are load-bearing rather than nice-to-have. Neither is verifiable from this repo — they are properties of the Cloudflare account.

A third constraint is about testing. `wrangler dev` simulates the `send_email` binding: nothing leaves the machine, and the message body is written to a temp file under `.wrangler/tmp/`. That makes local development safe, but awkward to assert on. Without a way to inspect what was sent, the only available assertion is "the invite endpoint returned 200", which would pass just as happily if the email were addressed to the wrong person or carried a broken link.

An earlier draft of this ADR justified the design by claiming "a Playwright test speaks HTTP and cannot read those files". **That is false and worth correcting**, because it is the kind of wrong premise that makes a bad design look forced: the *browser context* speaks HTTP, but the Playwright runner is Node on the same machine and can read `.wrangler/tmp/` with `fs`. The real objections to parsing those files are narrower and survive scrutiny:

- Only the message **body** reaches the file. The recipient, sender and subject appear solely in wrangler's stdout, which Playwright's `webServer` owns rather than exposing.
- The files are UUID-named with nothing linking one to the test that produced it, and `playwright.config.ts` sets `fullyParallel: true`.
- The layout under `.wrangler/tmp/` is an undocumented miniflare detail.

## Decision

### 1. Two transports behind one interface

[mail/mailer.ts](../../../src/mail/mailer.ts) defines a `Mailer` with two implementations:

- **`cloudflare`** — calls `env.EMAIL.send(...)`, the `[[send_email]]` binding. Production.
- **`outbox`** — captures the message in the Worker isolate, readable at `/api/dev/outbox`. Local dev and tests.

The outbox first stored messages in a `mail_outbox` D1 table. That was a mistake: it meant shipping a permanently empty table to production — test infrastructure in the production schema — and it needed a migration that had to run in every environment. In-memory is better for a second reason beyond tidiness: captured mail is *ephemeral test state*, so a store that empties when the dev server restarts has the right lifetime. The table version accumulated across runs and needed a DELETE endpoint to clear it. The migration was withdrawn before it ever reached remote D1.

Selection is by `MAIL_TRANSPORT`, and **the default is `outbox`**. Defaulting the other way would mean a missing variable turns a test run into an attempt at real delivery; production opts into sending by configuration rather than by omission. `wrangler.toml`'s `[vars]` sets `cloudflare`, and `.dev.vars` overrides it back to `outbox` locally, since `.dev.vars` takes precedence.

`cloudflareMailer` throws if `MAIL_TRANSPORT=cloudflare` and no `EMAIL` binding exists, rather than silently dropping a message someone is waiting for.

### 2. `/api/dev/outbox`, which does not exist in production

[dev-mail.ts](../../../src/routes/dev-mail.ts) reads the captured mail back so tests can assert on recipient, subject and link. It **404s whenever the real transport is selected**. That guard is not cosmetic: mail bodies carry invitation links, and an open endpoint listing them would be a way to join any organization uninvited.

The guard keys off the transport rather than a `NODE_ENV`-style flag, because the transport is the thing that actually determines whether anything was captured. Bodies also carry password-reset tokens now, which makes the guard a good deal more than cosmetic.

### 3. `auth.config.ts` becomes a factory

`sendInvitationEmail` is not schema-shaping, so by ADR 006 §9e's rule it does not belong in `auth.config.ts` — but it is an *option of the organization plugin*, and the plugin is constructed there. It also needs `env` (the binding, the base URL), which exists only per request.

`buildAuthOptions(deps)` resolves this. The CLI calls it with no deps and generates identical tables; `createAuth` calls it with a mailer. The alternative — duplicating the `organization({...})` block in `auth.ts` — would have meant two copies of the schema-shaping config drifting apart, which is exactly what ADR 006 §9e exists to prevent. `auth:schema:check` still passes because nothing in `deps` affects the schema.

### 4. Invite links use `BETTER_AUTH_URL`, not the request origin

An email outlives the request that sent it. `requestOrigin` is correct for `trustedOrigins` — ADR 006 §9a explains at length why — and wrong here: it is whatever host the invite happened to arrive on, including localhost, a preview deployment, or the `http://` form wrangler rewrites to during local development. Any of those bake a dead link into someone's inbox. This is the one place in `createAuth` that deliberately uses the canonical URL instead, and there is a test for it.

## Verification

Both transports were exercised rather than reasoned about:

- **outbox** — invite → `sendInvitationEmail` → mailer → `/api/dev/outbox`, with the invitation id in the link matching the id the API returned.
- **cloudflare** — the same flow with `MAIL_TRANSPORT=cloudflare`, confirming wrangler's simulator logs `send_email binding called` with the right From, To and Subject, and that `/api/dev/outbox` 404s under that transport.

[invitations.spec.ts](../../../tests/invitations.spec.ts) covers the recipient, the subject naming the inviter, the accept link carrying the invitation id, the canonical URL, and that querying another recipient returns nothing.

## Consequences

**Positive**

- Invitations work end to end, closing ADR 009's follow-up.
- Email content is under test, not just email dispatch.
- A `Mailer` seam exists for the next thing that needs mail. [ADR 011](011-completing-better-auth.md) used it immediately, for password reset and email verification.

**Negative**

- The in-memory outbox relies on `wrangler dev` keeping one long-lived isolate. Measured rather than assumed: sequential write-then-read succeeded 8/8, twelve concurrent writer/reader pairs succeeded 12/12, and the mail specs passed three consecutive clean runs. It would be wrong in production, where many isolates run — which is why it is only ever reachable under `MAIL_TRANSPORT=outbox`.
- Two transports mean local behaviour is not identical to production. Mitigated by the cloudflare path having been exercised locally through wrangler's simulator, but the genuinely untestable part — whether Cloudflare accepts and delivers — remains untested until deploy.
- The mail specs are skipped when `BASE_URL` is set, because `/api/dev/outbox` does not exist against a deployed Worker. `mise run deploy` reruns the whole suite via `test:deployed`, so without that guard these specs would have failed every deploy. Email content is therefore covered locally only.
- `scripts/dev-vars.ts` had to stop being all-or-nothing. It previously returned early if `.dev.vars` existed, so anyone who had run setup before this ADR would never receive `MAIL_TRANSPORT` and would silently run local development against the production transport. It now appends only missing keys and never rotates an existing secret.

**Prerequisites on the Cloudflare account** — code cannot check these, and invitations to new users will fail without them:

1. Workers **Paid** plan.
2. The sending domain (`remy.ubuntusoftware.net`, or whatever `EMAIL_FROM` uses) onboarded to Email Service. Until then, sends are limited to verified destination addresses.
3. `EMAIL_FROM` must belong to that onboarded domain.

**Follow-ups**

- Nothing accepts an invitation yet: the link points at `/app#/accept-invitation/:id`, a route the SPA does not have. The invitation row and the email are correct; the landing page is the missing half.
- `emailVerification` and `sendResetPassword` are unwired. Both now have a transport available.
- No HTML body, only plain text. Fine for a transactional invite; worth revisiting if the PO wants branding.
