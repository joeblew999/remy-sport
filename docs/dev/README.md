# Dev Docs

Documentation for developers and AI agents working on the platform.

---

| Document | What it answers |
|---|---|
| [roadmap.md](roadmap.md) | Phased feature plan with ADR links, DB tables, and competitor provenance |
| [sites.md](sites.md) | Competitive research — feature extraction from 5 basketball/sports platforms |
| [adr/001-deployment-versioning.md](adr/001-deployment-versioning.md) | Versioned deploys to Cloudflare Workers |
| [adr/002-seed-users.md](adr/002-seed-users.md) | Seed users for dev and test |
| [adr/005-api-and-authorization.md](adr/005-api-and-authorization.md) | API generation pipeline + three-layer authz (role, ownership, event type) |
| [adr/006-environment-provisioning.md](adr/006-environment-provisioning.md) | Cloudflare environment provisioning and recovery |
| [adr/007-organizations-and-auth-hooks.md](adr/007-organizations-and-auth-hooks.md) | Access control wired into Better Auth; organizations and database hooks |
| [adr/008-frontend-is-the-react-spa.md](adr/008-frontend-is-the-react-spa.md) | `src/web/` is the product frontend — supersedes ADR 004 |
| [adr/009-full-organization-adoption.md](adr/009-full-organization-adoption.md) | The organization plugin, adopted fully; the two access-control questions |
| [adr/010-outbound-email.md](adr/010-outbound-email.md) | Outbound mail via Cloudflare Email Service, behind a `Mailer` seam |
| [adr/011-completing-better-auth.md](adr/011-completing-better-auth.md) | Accept invitations, reset, verification, active organization |
| [adr/012-passwordless-email-otp.md](adr/012-passwordless-email-otp.md) | Email OTP as the only way in; passwords removed |
| [adr/013-admin-console.md](adr/013-admin-console.md) | The admin console — roles, bans, impersonation (moved into the SPA by ADR 020) |
| [adr/014-session-and-device-management.md](adr/014-session-and-device-management.md) | Device management via Better Auth core, not the `multiSession` plugin |
| [adr/015-reference-vocabularies.md](adr/015-reference-vocabularies.md) | Controlled vocabularies become tables; the Zod 4 move |
| [adr/020-keeping-the-map-honest.md](adr/020-keeping-the-map-honest.md) | Dead-code and documentation checks wired into `mise run check` |
