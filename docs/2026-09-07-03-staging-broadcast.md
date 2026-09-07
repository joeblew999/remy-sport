# Staging broadcasting rollout

All environments use the same `main` branch; only environment configuration
differs. No feature branch is used for this rollout.

Development passed real-relay synthetic video delivery, stop/restart, and the
user's physical-camera Broadcast/Watch walkthrough. Production remains unchanged.

- [ ] Fix deployment build selection: the gate creates a production artifact
  before the staging build, so choosing the first `dist/*/wrangler.json` can
  publish the wrong Worker. Require the requested Worker and pinned account.
- [ ] Commit the reviewed pending relay implementation on `main`, including
  credential renewal handling, and credential-log redaction patch. Keep other
  shared working-tree changes outside this rollout's commits.
- [ ] Pass the repository gate and local end-to-end checks for that checkout.
- [ ] Build and deploy the staging Worker, preserving its dashboard-issued
  relay credentials. Verify the served build identity and deployment smoke.
- [ ] Verify synthetic Broadcast/Watch delivery and stop/restart on staging.

Scope remains staging. Cloudflare's relay-wide credentials do not establish
per-game isolation; GAP-03 in the relay investigation remains open.
