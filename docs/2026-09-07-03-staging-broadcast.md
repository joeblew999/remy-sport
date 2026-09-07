# Staging broadcasting rollout

All environments use the same `main` branch; only environment configuration
differs. No feature branch is used for this rollout.

Development passed real-relay synthetic video delivery, stop/restart, and the
user's physical-camera Broadcast/Watch walkthrough. Production remains unchanged.

- [x] Fix deployment build selection: the gate creates a production artifact
  before the staging build, so choosing the first `dist/*/wrangler.json` can
  publish the wrong Worker. Require the requested Worker and pinned account.
- [x] Commit the reviewed pending relay implementation on `main`, including
  credential renewal handling, and credential-log redaction patch. Keep other
  shared working-tree changes outside this rollout's commits.
- [x] Pass the repository gate and local end-to-end checks for that checkout.
- [ ] Build and deploy the staging Worker, preserving its dashboard-issued
  relay credentials. Verify the served build identity and deployment smoke.
- [ ] Verify synthetic Broadcast/Watch delivery and stop/restart on staging.

Scope remains staging. Cloudflare's relay-wide credentials do not establish
per-game isolation; GAP-03 in the relay investigation remains open.

## Clean main verification

Committed main `dfe7b75` passed `bun run check`, including 285 rendering
checks, in an isolated checkout and database. The full local browser suite
passed all 41 checks on port 8788 with retries disabled. An earlier full run
had a login failure; the admin suite passed separately, then the complete
suite passed without concurrent builds. The cause of that earlier failure
was not established. Port 8787 remains available for the user's development.

The video probe now accepts an explicitly named staging target and checks
both its configured origin and the server's reported environment. It uses
existing staging fixture sign-in and never changes relay or auth secrets.
