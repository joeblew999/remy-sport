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
- [x] Build and deploy the staging Worker, preserving its dashboard-issued
  relay credentials. Verify the served build identity and deployment smoke.
- [x] Verify synthetic Broadcast/Watch delivery and stop/restart on staging.

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

## Staging deployed and verified — 2026-09-07

- Main revision: `fbcd6c5bbabd2d7d894eec072b6ae137a27f96f6`.
- Served build identity: `2026-09-07T05:24:16.872Z`, confirmed through
  `/api/versions` with branch `main` and environment `staging`.
- Cloudflare version: `27f750bd-56e6-40df-879d-15a5df946312`.
- Worker: `remy-sport-staging`; origin:
  <https://staging-remy.ubuntusoftware.net>.
- Applied outstanding migration `0017_current_coach_access.sql` and the standard
  idempotent seed to `remy-sport-staging-db`. Existing secrets were preserved.
- `bun scripts/deploy/smoke.ts --env staging` passed all applicable checks;
  four checks were explicitly skipped by the existing staging/mail policy.
- `BASE_URL=https://staging-remy.ubuntusoftware.net bun tests/integration/cloudflare-video.mjs --env staging`
  passed actual video delivery, healthy-connection retention, capture/video stop,
  and watcher recovery after restart through the staging relay. The probe used
  Chrome's synthetic camera and cleaned up its broadcast and session.

Production was not deployed or reconfigured. Physical-camera staging delivery
has not been independently checked; the earlier user walkthrough was local.
Per-game relay credential enforcement remains GAP-03, so this rollout does not
claim private game-level isolation. Unrelated shared-tree changes remain pending.

## Full working-tree rollout — 2026-09-07

All 75 pending files were committed as `5b25d76` and pushed to `origin/main`
at the user's request. The full staging deployment pipeline passed: typecheck,
lint, build, model checks, 841 unit/repository/Worker tests, rendering checks,
local end-to-end checks, migration, publish, seed, and deployment smoke.
The smoke suite retained its four documented staging-policy skips.

- Staging `/api/versions` confirmed commit `5b25d76`, branch `main`, environment
  `staging`, and build `2026-09-07T05:31:59.111Z`.
- Cloudflare version: `3c7399f4-1de2-4e00-af3a-c79241dff9b4`.
- The staging synthetic-camera probe passed separate-page video delivery,
  healthy-connection retention, capture/video stop, and playback after restart.
- Production was not deployed. Physical-camera staging verification and the
  existing GAP-03 relay-isolation limitation remain as described above.
