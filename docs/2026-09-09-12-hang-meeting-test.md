# Hang meeting test page

Status: implementing at the user's request. No meeting domain model or records.

Build `#/meeting-test` as a two-person Hang room: create a random room, share the
other seat's link, join explicitly, publish local camera/microphone or screen,
and watch the other participant. Reuse the shadcn media components and typed
MoQ adapter. Meetings default to front-camera preference. Provide microphone
mute, camera selection, sound enablement and Leave with complete cleanup.

The configured Cloudflare relay has no broadcast discovery. Two deterministic
participant names under a random room prefix allow a real two-way test without
inventing participant persistence. This is a two-seat prototype, not automatic
group membership or a private production meeting service. One device per seat.

Use a separate authenticated, dev-only credential endpoint, server configured
relay credentials, and a distinct meeting namespace. Never borrow game grants,
create game broadcast rows, or report a meeting as a game session. Other
configured relays receive short-lived scoped credentials. Renew while joined;
a failed renewal unmounts both media directions and releases capture.

No e2e runs: verify the actual page and focused lifecycle/credential checks.
Record direct evidence and limits here. Preserve the concurrent notification
work. Future domain work owns meeting membership, roles, invitations, room
lifecycle and larger meetings; this page is the media experiment only.

API evidence: installed @moq/hang exports catalog/container and transport;
@moq/publish and @moq/watch already produce/consume Hang. There is no separate
installed room UI to integrate. [Hang protocol](https://doc.moq.dev/draft/moq-hang)
defines participants as broadcasts under a common room prefix.
