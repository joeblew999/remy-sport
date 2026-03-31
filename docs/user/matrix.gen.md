<!-- GENERATED from docs/matrix.json — do not edit manually. -->
<!-- Regenerate: mise run matrix:generate -->

# Access Matrix

Single source of truth for who can do what, across all features and event types.

**Actors:** A = Admin · O = Organizer · C = Coach · P = Player · S = Spectator · R = Referee

**Event types:** T = Tournament · L = League · K = Camp/Clinic · Sh = Showcase

**Access:** W = writes · R = reads · — = no access

---

## Matrix 1 — Resource × Actor

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
| score | enter | W | W | — | — | — | W |
| score | read | R | R | R | R | R | R |
| bracket | generate | W | W | — | — | — | — |
| bracket | read | R | R | R | R | R | R |
| fixture | generate | W | W | — | — | — | — |
| fixture | read | R | R | R | R | R | R |
| session | define | W | W | — | — | — | — |
| session | read | R | R | R | R | R | — |
| attendance | record | W | W | W | — | — | — |
| attendance | read | R | R | R | — | — | — |
| court | assign | W | W | — | — | — | — |
| court | read | R | R | — | — | — | R |
| user | manage | W | — | — | — | — | — |

---

## Matrix 2 — Resource × Event Type

| Resource | T | L | K | Sh |
|---|:---:|:---:|:---:|:---:|
| event | x | x | x | x |
| team | x | x |  | x |
| player | x | x | x | x |
| roster | x | x |  | x |
| score | x | x |  | x |
| bracket | x |  |  | x |
| fixture | x | x |  |  |
| session |  |  | x |  |
| attendance |  |  | x |  |
| court | x | x |  | x |
| user | x | x | x | x |

---

*Source: [docs/matrix.json](../matrix.json) · Regenerate: `mise run matrix:generate`*
