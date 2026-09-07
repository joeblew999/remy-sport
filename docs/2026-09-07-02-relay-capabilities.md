# Relay capability investigation — GAP-02

Status: Cloudflare permission identified; local provisioning automation tested.
Real relay verification awaits the token permission change below. No remote relay
provisioning, credential rotation or deployment performed. Credentials were not
recorded in this document. Actual configured deployment identity remains to be
verified without exposing secrets.

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

Required dashboard change: open [user API tokens](https://dash.cloudflare.com/profile/api-tokens),
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
