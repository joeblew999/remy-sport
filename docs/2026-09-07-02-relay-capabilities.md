# Relay capability investigation — GAP-02

Status: preliminary documentation review, not protocol verification. No relay
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
