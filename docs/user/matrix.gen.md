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
| Implemented | 11/26 | event, team, player, roster, bracket, fixture, session, court, score, attendance, user |
| Planned | 6/26 | division, registration, find-team, consolation-bracket, results-archive, spoiler |
| Not Started | 9/26 | standings, player-stats, season-records, live-scores, notifications, live-stream, court-status, ai-assistant, moderation |

**Progress: 11/26 resources implemented (42%)**

### By Feature Group

| Group | Implemented | Planned | Not Started |
|---|---|---|---|
| events | event | division, registration | — |
| teams-players | team, player, roster | find-team | — |
| schedules-brackets | bracket, fixture, session, court | consolation-bracket | — |
| scores-results | score, attendance | results-archive, spoiler | — |
| rankings-standings | — | — | standings, player-stats, season-records |
| live-realtime | — | — | live-scores, notifications, live-stream, court-status |
| ai-assistant | — | — | ai-assistant |
| admin | user | — | moderation |

---

## Matrix 1 — Implemented Resource × Actor

| Resource | Action | A | O | C | P | S | R |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| event | create | W | W | — | — | — | — |
| event | read | R | R | R | R | R | R |
| event | update | W | W | — | — | — | — |
| event | delete | W | W | — | — | — | — |
| team | create | W | — | W | — | — | — |
| team | read | R | R | R | R | R | — |
| team | update | W | — | W | — | — | — |
| team | delete | W | — | — | — | — | — |
| player | create | W | — | W | W | — | — |
| player | read | R | R | R | R | R | — |
| player | update | W | — | W | W | — | — |
| roster | manage | W | — | W | — | — | — |
| bracket | generate | W | W | — | — | — | — |
| bracket | read | R | R | R | R | R | R |
| fixture | generate | W | W | — | — | — | — |
| fixture | read | R | R | R | R | R | R |
| session | define | W | W | — | — | — | — |
| session | read | R | R | R | R | R | — |
| court | assign | W | W | — | — | — | — |
| court | read | R | R | — | — | — | R |
| score | enter | W | W | — | — | — | W |
| score | read | R | R | R | R | R | R |
| attendance | record | W | W | W | — | — | — |
| attendance | read | R | R | R | — | — | — |
| user | manage | W | — | — | — | — | — |

---

## Matrix 2 — Implemented Resource × Event Type

| Resource | T | L | K | Sh |
|---|:---:|:---:|:---:|:---:|
| event | x | x | x | x |
| team | x | x |  | x |
| player | x | x | x | x |
| roster | x | x |  | x |
| bracket | x |  |  | x |
| fixture | x | x |  |  |
| session |  |  | x |  |
| court | x | x |  | x |
| score | x | x |  | x |
| attendance |  |  | x |  |
| user | x | x | x | x |

---

## Planned & Not Started Resources

| Resource | Status | Group | Design Features | Event Types |
|---|---|---|---|---|
| division | Planned | events | Age & gender divisions | T, L, Sh |
| registration | Planned | events | Register team, Register as player | T, L, K, Sh |
| find-team | Planned | teams-players | Find a team | T, L, Sh |
| consolation-bracket | Planned | schedules-brackets | Consolation / back draw | T |
| results-archive | Planned | scores-results | View results archive | T, L, Sh |
| spoiler | Planned | scores-results | Spoiler mode | T, L, Sh |
| standings | Not Started | rankings-standings | View standings table, View rank movement, View rankings history | T, L |
| player-stats | Not Started | rankings-standings | View player stats | T, L, Sh |
| season-records | Not Started | rankings-standings | View season records | L |
| live-scores | Not Started | live-realtime | Live scores | T, L, Sh |
| notifications | Not Started | live-realtime | Push notifications | T, L, Sh |
| live-stream | Not Started | live-realtime | Live stream links | T, L, Sh |
| court-status | Not Started | live-realtime | Court status board | T, L, Sh |
| ai-assistant | Not Started | ai-assistant | Create event by chat, Bracket suggestions, Q&A | T, L, K, Sh |
| moderation | Not Started | admin | Moderate listings | T, L, K, Sh |

---

*Source: [docs/matrix.json](../matrix.json) · Design: [matrix.md](matrix.md) · Regenerate: `mise run matrix:generate`*
