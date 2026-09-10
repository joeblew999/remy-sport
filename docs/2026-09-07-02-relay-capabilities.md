# Relay capability investigation — GAP-02

Status: **standing register, not a plan.** GAP-02 is an area of continuing
work — per-game credentials, cross-game denial, expiry and revocation — not a
task with an end. Basic media delivery is already proven; the rest is worked
down here.

Current status, reconciled 2026-09-07: ordinary local and staging broadcasting
is configured and has recorded delivery/stop/restart evidence. The user also
confirmed a local physical-camera walkthrough. Optional local scoped-adapter
checks passed. Staging still uses shared Cloudflare credentials: per-game
credential enforcement is open. See [project status](README.md) and the
[rollout record](done/2026-09-07-03-staging-broadcast.md) for the latest deployment.
No new relay probe was run for this documentation reconciliation.

## Current work

The current client in `src/web/lib/moq.ts` constructs a Cloudflare-style token
path and uses a game-specific broadcast name. The API gates release of its
shared publishing token by BROADCAST_GAME, but a name chosen by the client does
not make a relay-wide credential game-scoped. GAP-03 remains open.

Cloudflare documents isolated namespaces per relay and publish/subscribe token
roles. Its token creation API accepts operations, expiry and label, with a limit
of ten tokens per relay; it documents no per-broadcast-name token constraint.
Therefore merely minting additional tokens for the same relay does not establish
game isolation. This is an inference from the published API contract, not a
negative protocol test. Sources reviewed on 2026-09-07:
[MoQ overview](https://developers.cloudflare.com/moq/) and
[token creation API](https://developers.cloudflare.com/api/resources/moq/subresources/relays/subresources/tokens/methods/create/).

Next verification must compare isolated relays per game with a relay supporting
namespace-scoped credentials. Check client protocol compatibility, expiry on
already-open connections, revoke behavior, watcher refusal to publish, and
cross-game publishing/subscription denial using real relay connections. Record
commands and results here before choosing an adapter or claiming scoped access.
Do not assume a locally signed JWT is accepted by Cloudflare's token registry.

## Historical investigation checkpoints

The logs below record earlier conditions. Missing tokens, API permission blockers
and “no deployment” statements do not describe the current working relays. The
current unresolved issue is scoped access, as described above.

## Local Cloudflare broadcasting — 2026-09-07

The unfinished scoped-adapter implementation disabled the existing Cloudflare
configuration: it required `MOQ_RELAY_SIGNING_KEY` and changed all connections
from token paths to JWT queries. Cloudflare support is restored alongside the
adapter, selected by the exact Cloudflare draft-16 origin. Both paths retain
publisher permission checks; a missing watch token never falls back to the
publisher token. Cloudflare's relay-wide scope remains GAP-03 above.

`bun run live` now configures local development for Cloudflare instead of
launching a Rust relay and a temporary tunnel. Supply `MOQ_RELAY_TOKEN` and
`MOQ_RELAY_TOKEN_SUBSCRIBE` from the same Cloudflare relay in ignored `.dev.vars`,
the environment, or fnox. The second token must be subscribe-only. Run
`bun run live`, then restart `bun run dev`. Setup writes the Cloudflare draft-16
origin, removes the temporary adapter signing key, and prints no credentials.
Missing credentials leave the existing local configuration intact.

At this checkout's verification, both Cloudflare MoQ tokens were absent from
local configuration, environment and fnox. The sandbox initially hid access to
the keychain and prevented OAuth refresh. Rechecking with network/keychain
access confirmed that Wrangler login works and a Cloudflare API token exists.
However, GET /accounts/{account_id}/moq/relays returns HTTP 403, error 10000,
with both credentials. Existing Cloudflare authentication does not grant this
MoQ access. Real Cloudflare media delivery therefore remains unverified; local
adapter credentials are not a substitute. No remote relay was created or changed.
To continue, configure the relay's publish and subscribe-only tokens in ignored
.dev.vars, or provide the configured account with an API credential authorized
to manage MoQ relays.

Regression coverage: `tests/unit/moq-relay.test.ts` verifies provider URL formats;
`tests/worker/relay-credentials.test.ts` checks Cloudflare issuance in dev,
unauthorized publishers, separate watch credentials and adapter scoping.

## Token permission and automation — 2026-09-07

Live API inspection identifies the configured user token as `dev` (token ID
`75c01b9845668747ff3b2147ae99fa1f`). It is active. Its account policy includes
account `7384af54e33b8a54ff240371ea368440` but lacks MoQ permission. Listing
relays returns HTTP 403 / 10000. The live permission-group endpoint reports:

- `MoQ Write`: `2f912625599b434a8df3e4e02d64c7b4`, account scope; read/write
  relay configuration and MoQ Bench.
- `MoQ Read`: `42fae5a23ce84d7a896ac12ef509dafa`, account scope; read only.

Proposed dashboard change (UI availability not yet verified): open [user API tokens](https://dash.cloudflare.com/profile/api-tokens),
edit `dev`, add Account → MoQ → Edit for the account above, preserve its other
permissions, and save. The API calls the permission MoQ Write. The current token
has API Tokens Read, so it can inspect its policy but cannot update that policy.
Do not add token-management write permission merely to provision media relays.
Editing the existing token avoids replacing the secret used by other scripts.
If a replacement is created, store it through the hidden terminal prompt:

```sh
fnox set --global -p keychain CLOUDFLARE_API_TOKEN
```

Sources: [token creation/editing](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/),
[live permission-group API](https://developers.cloudflare.com/api/resources/user/subresources/tokens/subresources/permission_groups/),
and [relay creation response](https://developers.cloudflare.com/api/resources/moq/subresources/relays/methods/create/).
The generic permission documentation currently omits MoQ; the IDs above came
from the authenticated API, not a guessed Stream or Realtime permission.

Automation implemented in `scripts/live.ts` and `scripts/lib/moq.ts`:

```sh
bun run live --check
bun run live --provision
```

`--check` only lists relays; success proves read access, not write access or
media delivery. `--provision` targets the pinned account and the named
`remy-sport-local` relay, creates it if absent, and saves its default token pair
in ignored `.dev.vars` with mode 0600. It records the account and relay IDs there.
Reruns check token identities, roles and expiry against the relay registry and
reuse valid credentials. Missing/expired credentials are minted with 30-day
expiry; existing tokens are never deleted. Each secret is saved before the next
request so a failed second operation can resume. Cloudflare's ten-token limit
still applies; setup reports an error rather than deleting another client's
credential. Newly created relays use Cloudflare's default token expiry.

Setup changes local development configuration only. Restart the development
server to load it. The application API and browser Cloudflare adapter changes
are still part of the shared pending implementation; provisioning does not
certify them or deploy them.

Validation: five isolated provisioning tests in `tests/unit/moq-provision.test.ts`
passed, covering refusal/no writes, default-pair capture, rerun reuse, partial
failure recovery, expiry/role separation and account/relay selection boundaries.
Typecheck, lint and the docs path check passed. The real `bun run live --check`
still returns HTTP 403 / 10000 with token `dev`. No remote write was attempted.

Next: after the user saves Account → MoQ → Edit on `dev`, rerun the access check,
provision the local relay, then verify real publish/watch delivery. Keep GAP-03
stream isolation open until protocol evidence proves it. No relay is working
merely because setup succeeds.

## Broadcasting acceptance — 2026-09-07

The user explicitly requires broadcasting. Completion means an authorized user
starts camera capture on a game's Broadcast page, Cloudflare receives the stream,
and a separate browser's Watch page displays advancing video frames from it.
A preview on the publisher, a successful API call, or a connected transport alone
is insufficient. Verify stop releases capture and ends delivery, and restarting
broadcasting restores delivery. Record browser, game, command and observed result
here; keep synthetic-source transport checks distinct from physical-camera proof.

Fresh preflight: `bun run live --check` still returns 403 / 10000. Four tests in
`tests/worker/relay-credentials.test.ts` passed, including Cloudflare publishing
permission and separate watcher credentials. The 14 render cases in
`tests/render/moq-page.spec.ts` and `tests/render/relay-renewal.spec.ts` passed.
These prove API/UI behavior, not real broadcasting. The build again reports the
previously recorded large-chunk and deprecated inlineDynamicImports warnings;
those remain tooling follow-up in the main coverage plan.

Immediate blocker remains the `dev` API token's missing MoQ Write permission.
Next action after the dashboard edit is the provisioning and real two-browser
broadcasting verification above. Do not close the task as "broadcasting works"
until that succeeds.


## Dashboard mismatch — 2026-09-07

The user cannot see the instructed option on the API tokens page. The exact
MoQ Write permission ID is verified by the live API, but Account → MoQ → Edit
was inferred from Cloudflare's general token editor documentation, not observed
in this user's dashboard. Do not repeat that path as a confirmed available UI.
Clarify whether the token Edit menu or the MoQ service within Account permissions
is absent before prescribing another dashboard change.

If the service is absent from the editor, Cloudflare documents creating a
bootstrap token using the Create additional tokens template and then managing
user tokens by permission-group ID through the API. This is a possible fallback,
not a completed setup; it requires a separate token-management credential and
must preserve the existing dev policy. No such credential has been requested or
created. Source: [create tokens via API](https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/).


## Confirmed missing dropdown and API fallback — 2026-09-07

The user can edit `dev` and add Account permissions, but MoQ is absent from the
service dropdown. Stop prescribing that dropdown. Use the verified permission
ID through the [token update API](https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/update/),
which requires API Tokens Write. Cloudflare's documented bootstrap route is
Create Token → Create additional tokens (template), not the Custom Token builder.
Create a separate token named `remy-token-bootstrap`, then store its secret using
the hidden terminal prompt:

```sh
fnox set --global -p keychain CLOUDFLARE_TOKEN_ADMIN_TOKEN
```

The prepared command is:

```sh
bun run live --grant-moq
bun run live --provision
```

`--grant-moq` identifies the existing configured API token, reads its current
policy, adds MoQ Write only to its existing exact-account allow policy, preserves
other policies/status/expiry/IP restrictions, and verifies the returned policy.
It refuses wildcard or multi-account policy expansion and detects changes between
its initial read and pre-write read. The Cloudflare PUT API has no conditional
write used here; avoid simultaneous edits during this short operation. No API
token secret is replaced, and the bootstrap credential is never stored in app
configuration or used for relay connections. After successful update, revoke
`remy-token-bootstrap` in the dashboard; relay automation continues using `dev`.

This fallback is prepared, not remotely applied. Next: user stores the bootstrap
credential; run the permission update, provision, and verify actual broadcasting.
The token-policy preservation and refusal tests are in
`tests/unit/moq-permission.test.ts`. The relay's 403 diagnostic now points to this
fallback instead of the unavailable dashboard permission selector.

Validation for the fallback: typecheck, lint, seven unit cases across permission
editing/provisioning, and the docs path check passed. No remote token policy was
changed during these checks.

## Investigation checkpoint — 2026-09-07

The user wants to repair the existing `dev` token with minimal manual steps and
has not supplied a bootstrap credential. The bootstrap path remains prepared but
unapplied; do not present it as the only possible remedy. Further public-source
research found no explanation of why the Account dropdown omits MoQ and no
verified dashboard method to add that permission to this token.

Cloudflare's [relay launch article](https://blog.cloudflare.com/moq-relays/)
documents creating relays and their publish/subscribe tokens directly under
Media → Realtime → MoQ Relay. That is a documented manual provisioning route,
not a fix for API automation permissions; availability in this user's dashboard
has not been verified. Broadcasting remains unverified. Do not conflate the
existence of the API permission with proof that the dashboard exposes it.

## Deployment reconciliation — 2026-09-07

The user pointed out that Claude had already set up a deployed environment.
A fresh read-only `wrangler secret list --format json` against both configured
Workers confirms production (`remy-sport`) has `MOQ_RELAY_URL`,
`MOQ_RELAY_TOKEN`, and `MOQ_RELAY_TOKEN_SUBSCRIBE`. Staging
(`remy-sport-staging`) has no `MOQ_` secrets. Only names were inspected;
no secret values were retrieved and no remote configuration was changed.

Commit `bc6b366` also records an earlier real Chrome/Cloudflare session:
publishing, catalog exchange, and audio track subscription succeeded. That is
historical protocol evidence, not a fresh two-browser advancing-video check.

The missing local tokens and relay-management API permission documented above
do not establish that production broadcasting was never configured or cannot
work. The earlier resume summary wrongly generalized local setup status to the
deployed service. Resume by checking the existing production broadcast/watch
flow before proposing another relay or token-policy change. Current production
media delivery and credential expiry remain unchecked.

## Environment setup checkpoint — 2026-09-07

The user created separate `remy-sport-dev` and `remy-sport-staging` relays through
the dashboard and entered their token pairs using hidden terminal prompts.
Development setup used `bun run live`; staging used the shared Cloudflare
wrapper's `wrangler secret bulk` with the explicit staging target. Production
was not changed. No token values are recorded here.

Verified development `.dev.vars` has distinct nonempty publish/watch tokens,
the Cloudflare draft-16 origin, `ENVIRONMENT=dev`, file mode 0600, and no
adapter signing key. The local Vite server started successfully; its home page
and `/api/moq/config?gameId=gam_002&role=watch` returned HTTP 200, with a
nonempty watcher configuration.

Fresh staging verification lists all three expected `MOQ_RELAY_*` secrets.
Both `https://staging-remy.ubuntusoftware.net/` and its
`/api/moq/config?gameId=gam_002&role=watch` endpoint returned HTTP 200; the
configuration contains the Cloudflare draft-16 URL and a nonempty watch token.
Only presence booleans and secret names were printed. This confirms deployment
configuration, not relay acceptance or media delivery. Relay identities, token
roles and expiry have not been independently verified against the registry.

Next: verify actual Broadcast → Watch video delivery using the development or
staging relay, including stop/restart. No more dashboard setup or API permission
changes are required merely to attempt this verification.

## Real development video and restart recovery — 2026-09-07

`bun tests/integration/cloudflare-video.mjs` drives the actual local application
at `http://localhost:8787` in separate Google Chrome publisher/watcher contexts.
It signs in as the seeded referee assigned to `gam_002`, uses Chrome's synthetic
camera, and traverses the configured Cloudflare development relay. No API/media
responses are mocked. Browser logs, traces and screenshots are disabled to avoid
recording credential-bearing relay URLs; the created session is released.

Before the fix, an initial attempt failed to receive frames. A subsequent run
received video and stopped successfully, but the watcher remained connected and
received no new frames after restarting for the full 45-second deadline.
Inspection of the installed client's `announcedBroadcast` implementation shows
its no-discovery path retains a blind consumer until the connection ends.

`GameVideo` now recreates its watcher after ten seconds without decoded-frame
progress on an established relay connection that lacks discovery. Paused or
background playback and relays supporting discovery do not trigger this retry.
Normal advancing video resets the timer. The component's existing credential
renewal-denial behavior still removes the media element.

The final real-relay run passed all four assertions:

- A watcher opened before the publisher receives more than ten distinct decoded
  video timestamps painted on its actual canvas after capture starts.
- Healthy playback retains the same connected element beyond the retry interval.
- Stop clears/ends the preview capture and stops advancing watcher frames.
- Restart delivers advancing video to the existing Watch page without reloading.

Typecheck, lint, build, and all 14 cases in `tests/render/moq-page.spec.ts` and
`tests/render/relay-renewal.spec.ts` passed in the shared working tree. The build
still reports the previously recorded large-chunk and deprecated
`inlineDynamicImports` warnings. Existing unrelated pending changes were not
included in the recovery commit.

This is synthetic-camera proof, not physical-camera proof or a production test.
No staging or production code was deployed. Next: use a physical camera on the
development Broadcast page with a separate Watch window, then roll the tested
recovery change into staging with the rest of the pending relay implementation.

## User-confirmed physical-camera walkthrough — 2026-09-07

After the automated checks and recovery fix in `f37c069`, the user completed the
requested local walkthrough: sign in as the seeded referee, start the camera at
`/#/broadcast/gam_002`, and open `/#/watch/gam_002` in another window. The user
reported that all three steps worked. This is user-observed physical-camera
broadcast/watch confirmation; the agent did not independently observe that
camera session. Browser/device details and a manual stop/restart check were not
reported. Automated synthetic-camera stop/restart evidence is recorded above.

Development broadcasting is now confirmed by both the automated real-relay
check and the user's camera walkthrough. Next: integrate the pending relay
changes and validate the recovery fix on staging. Production was not changed;
cross-game relay authorization (GAP-03) remains open.

## Scope recheck after the full staging rollout — 2026-09-07

`bun run test:relay` passed against the existing local `moq-relay` binary:
allowed publish/watch payload delivery, cross-game connection denial, tampered
and expired credential denial, subscribe-only publishing denial, and closure of
an already-open connection at token expiry. This is evidence for the optional
scoped adapter; staging still uses Cloudflare's shared credentials.

Cloudflare's token creation API and overview linked above were rechecked. The
published token request still exposes operations, expiry and label, without a
per-game namespace restriction. The existing inference and GAP-03 remain open;
no remote cross-game protocol test or relay configuration change was made.

Admin impersonation is useful for validating role-specific application journeys.
`tests/e2e/admin-console.spec.ts` covers entering impersonation, retaining the
underlying admin identity, returning to admin, and non-admin refusal. Most other
journeys sign in as their test actors directly. Neither route establishes what
a copied media credential can do outside the app. The next relay work remains
the isolated-relay versus scoped-adapter comparison described above, including
browser transport compatibility and revocation/reconnect evidence before rollout.
