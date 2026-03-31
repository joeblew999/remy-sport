<!-- GENERATED from docs/matrix.json — do not edit manually. -->
<!-- Regenerate: mise run matrix:generate -->

# Access Matrix (Generated)

Implementation status generated from [docs/matrix.json](../matrix.json).
Compare with the [design doc](matrix.md) to see the full vision.

**Actors:** A = Admin · O = Organizer · C = Coach · P = Player · S = Spectator · R = Referee

**Event types:** T = Tournament · L = League · K = Camp/Clinic · Sh = Showcase

**Access:** W = writes · R = reads · — = no access

---

## Implementation Status

| Status | Count | Resources |
|---|---|---|
| Implemented | 26/26 | event, division, registration, team, player, roster, find-team, bracket, consolation-bracket, fixture, session, court, score, attendance, results-archive, spoiler, standings, player-stats, season-records, live-scores, notifications, live-stream, court-status, ai-assistant, user, moderation |
| Planned | 0/26 | — |
| Not Started | 0/26 | — |

**Progress: 26/26 resources implemented (100%)**

### By Feature Group

| Group | Implemented | Planned | Not Started |
|---|---|---|---|
| events | event, division, registration | — | — |
| teams-players | team, player, roster, find-team | — | — |
| schedules-brackets | bracket, consolation-bracket, fixture, session, court | — | — |
| scores-results | score, attendance, results-archive, spoiler | — | — |
| rankings-standings | standings, player-stats, season-records | — | — |
| live-realtime | live-scores, notifications, live-stream, court-status | — | — |
| ai-assistant | ai-assistant | — | — |
| admin | user, moderation | — | — |

---

## Matrix 1 — Implemented Resource × Actor

| Resource | Action | A | O | C | P | S | R |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| event | create | W | W | — | — | — | — |
| event | read | R | R | R | R | R | R |
| event | update | W | W | — | — | — | — |
| event | delete | W | W | — | — | — | — |
| division | create | W | W | — | — | — | — |
| division | read | R | R | R | R | R | R |
| division | update | W | W | — | — | — | — |
| division | delete | W | W | — | — | — | — |
| registration | register-team | W | — | W | — | — | — |
| registration | register-player | W | — | — | W | — | — |
| registration | read | R | R | R | R | R | — |
| team | create | W | — | W | — | — | — |
| team | read | R | R | R | R | R | — |
| team | update | W | — | W | — | — | — |
| team | delete | W | — | — | — | — | — |
| player | create | W | — | W | W | — | — |
| player | read | R | R | R | R | R | — |
| player | update | W | — | W | W | — | — |
| roster | manage | W | — | W | — | — | — |
| find-team | read | R | — | — | R | — | — |
| bracket | generate | W | W | — | — | — | — |
| bracket | read | R | R | R | R | R | R |
| consolation-bracket | generate | W | W | — | — | — | — |
| consolation-bracket | read | R | R | R | R | R | R |
| fixture | generate | W | W | — | — | — | — |
| fixture | read | R | R | R | R | R | R |
| session | define | W | W | — | — | — | — |
| session | read | R | R | R | R | R | — |
| court | assign | W | W | — | — | — | — |
| court | read | R | R | R | R | R | R |
| score | enter | W | W | — | — | — | W |
| score | read | R | R | R | R | R | R |
| attendance | record | W | W | W | — | — | — |
| attendance | read | R | R | R | — | — | — |
| results-archive | read | R | R | R | R | R | R |
| spoiler | toggle | — | — | W | W | W | — |
| spoiler | read | — | — | R | R | R | — |
| standings | read | R | R | R | R | R | R |
| player-stats | read | R | R | R | R | R | — |
| season-records | read | R | R | R | R | R | — |
| live-scores | read | R | R | R | R | R | R |
| notifications | subscribe | — | — | W | W | W | — |
| notifications | read | — | — | R | R | R | — |
| live-stream | manage | W | W | — | — | — | — |
| live-stream | read | R | R | R | R | R | — |
| court-status | read | R | R | R | R | R | R |
| ai-assistant | create-event | W | W | — | — | — | — |
| ai-assistant | suggest-bracket | W | W | — | — | — | — |
| ai-assistant | qa | W | W | W | W | W | W |
| user | manage | W | — | — | — | — | — |
| moderation | manage | W | — | — | — | — | — |

---

## Matrix 2 — Implemented Resource × Event Type

| Resource | T | L | K | Sh |
|---|:---:|:---:|:---:|:---:|
| event | x | x | x | x |
| division | x | x |  | x |
| registration | x | x | x | x |
| team | x | x |  | x |
| player | x | x | x | x |
| roster | x | x |  | x |
| find-team | x | x |  | x |
| bracket | x |  |  | x |
| consolation-bracket | x |  |  |  |
| fixture | x | x |  |  |
| session |  |  | x |  |
| court | x | x |  | x |
| score | x | x |  | x |
| attendance |  |  | x |  |
| results-archive | x | x |  | x |
| spoiler | x | x |  | x |
| standings | x | x |  |  |
| player-stats | x | x |  | x |
| season-records |  | x |  |  |
| live-scores | x | x |  | x |
| notifications | x | x |  | x |
| live-stream | x | x |  | x |
| court-status | x | x |  | x |
| ai-assistant | x | x | x | x |
| user | x | x | x | x |
| moderation | x | x | x | x |

---

*Source: [docs/matrix.json](../matrix.json) · Design: [matrix.md](matrix.md) · Regenerate: `mise run matrix:generate`*
