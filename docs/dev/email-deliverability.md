# Email deliverability

Written 2026-09-01, when notification email became a real channel rather than a
seam proved against an outbox.

## Cloudflare Email Sending does reach arbitrary inboxes

Established the hard way. I read Email Routing's "verified destination address"
rules, concluded production could not reach a parent, and stopped. That was
wrong: a real sign-in code reached a real Gmail inbox from production, with
`dkim=pass`, `spf=pass` and `dmarc=pass`.

The mistake worth remembering: the docs say sending to verified destinations *is
free on all plans*, and I read "free" as "only". Those are different claims —
the first is about billing, the second about capability. `[[send_email]]` on a
Workers Paid plan is a transactional sending product, not a forwarding
allowlist.

## What is configured today

Read from DNS on 2026-09-01. **Nothing here has been changed.**

| Record | Value |
| --- | --- |
| SPF `ubuntusoftware.net` | `v=spf1 include:_spf.mx.cloudflare.net include:emspf.smtp2go.com ~all` |
| SPF `remy.ubuntusoftware.net` | **none** |
| DMARC `ubuntusoftware.net` | `v=DMARC1; p=none; rua=mailto:…@dmarc-reports.cloudflare.net` |
| DMARC subdomain policy | none set, so subdomains inherit `p=none` |
| DKIM `cf2024-1._domainkey.ubuntusoftware.net` | present |
| DKIM on `remy.` subdomain | none — Cloudflare signs with the apex key |

Delivered mail passes DMARC today because alignment is relaxed: the `From` is
`noreply@remy.ubuntusoftware.net`, the DKIM `d=` is `ubuntusoftware.net`, and
the organizational domain matches. The absent SPF record on the subdomain does
not bite because the envelope sender is SRS-rewritten to the apex.

## Why bulk gets its own sending identity

Sign-in is email OTP, so **authentication is email**. One shared `From` means a
spam-reputation hit on match notifications takes sign-in down with it — and
nobody can sign in to turn the notifications off. That is the worst possible
order for those two failures.

Reputation and DKIM attach at the domain level, so the split is a subdomain
rather than a different local part:

- transactional — `noreply@remy.ubuntusoftware.net` (`EMAIL_FROM`)
- bulk — `notifications@notify.remy.ubuntusoftware.net` (`NOTIFY_EMAIL_FROM`)

`src/mail/mailer.ts` picks by `Mail.kind`, and **transactional is the default**:
a caller that forgets gets the safer identity, so the mistake is a notification
sent from the sign-in domain rather than a sign-in code sent from a bulk one.

## DNS you need to change — I have not touched any of this

1. **Onboard `notify.remy.ubuntusoftware.net` for sending** in the Cloudflare
   dashboard. Until this exists, bulk mail is rejected at send: the sender must
   belong to a domain onboarded to Email Service. Cloudflare will publish the
   DKIM record for it, which is the point — a separate key is a separate
   reputation.

2. **SPF on the sending subdomain**, once it exists:
   `notify.remy.ubuntusoftware.net.  TXT  "v=spf1 include:_spf.mx.cloudflare.net -all"`
   `-all` rather than `~all` on a subdomain that sends only through Cloudflare:
   there is no legacy sender to be lenient about, unlike the apex, which still
   carries `include:emspf.smtp2go.com` from something else.

3. **DMARC, when you are ready to enforce.** `p=none` collects reports and
   protects nothing. The useful sequence is `p=none` → `p=quarantine; pct=…` →
   `p=reject`, watching `rua` between steps. Consider a subdomain policy
   (`sp=`) so bulk can be tightened independently of the apex.

Do not add the SPF record before the subdomain is onboarded — an SPF record for
a domain that cannot send is a promise about nothing.

## Unsubscribe

Bulk mail carries `List-Unsubscribe` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`; transactional mail carries
neither, because offering to unsubscribe from your own sign-in code is a
promise nothing can honour. Both directions are asserted in
`tests/worker/push.test.ts`.

`GET` renders a confirmation and changes nothing; `POST` acts. Mail scanners
and corporate gateways follow GET links, so the other way round silently
unsubscribes people who never clicked. See `src/api/unsubscribe.ts`.
