# Access Matrix

Single source of truth for who can do what, across all features and event types.

**Actors:** O = Organizer · C = Coach · P = Player · S = Spectator · R = Referee · A = Admin

**Event types:** T = Tournament · L = League · K = Camp/Clinic · Sh = Showcase

**Access:** W = writes/creates data · R = reads only · — = not applicable

---

## Matrix 1 — Feature × Actor

Who can access each feature, and whether they read or write.

| Feature | O | C | P | S | R | A |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Auth** |
| Sign in / Sign out | W | W | W | W | W | W |
| **Events** |
| Browse events | R | R | R | R | R | R |
| Event detail page | R | R | R | R | R | R |
| Create event | W | | | | | W |
| Age & gender divisions | W | | | | | W |
| Register team | | W | | | | W |
| Register as player | | | W | | | W |
| **Teams & Players** |
| Create team profile | | W | | | | W |
| Create player profile | | W | W | | | W |
| Manage roster | | W | | | | W |
| Find a team | | | R | | | |
| **Schedules & Brackets** |
| View bracket | R | R | R | R | R | R |
| View fixture schedule | R | R | R | R | R | R |
| View court assignments | R | R | R | R | R | R |
| Generate brackets | W | | | | | W |
| Generate fixtures | W | | | | | W |
| Define session schedule | W | | | | | W |
| Assign courts | W | | | | | W |
| **Scores & Results** |
| Enter scores | W | | | | W | W |
| Confirm match status | W | | | | W | W |
| Record attendance | W | W | | | | W |
| View game results | R | R | R | R | R | R |
| View match status | R | R | R | R | R | R |
| Spoiler mode | | R | R | R | | |
| View results archive | R | R | R | R | R | R |
| **Rankings & Standings** |
| View standings table | R | R | R | R | R | R |
| View rank movement | R | R | R | R | R | R |
| View rankings history | R | R | R | R | R | R |
| View player stats | R | R | R | R | | R |
| View season records | R | R | R | R | | R |
| **Live & Real-time** |
| Live scores | R | R | R | R | R | R |
| Push notifications | | R | R | R | | |
| Install app (PWA) | R | R | R | R | R | R |
| Live stream links | | R | R | R | | |
| Court status board | R | R | R | R | R | R |
| **AI Assistant** |
| Create event by chat | W | | | | | W |
| Bracket suggestions | W | | | | | W |
| Q&A | R | R | R | R | R | R |
| **Admin** |
| Manage all users | | | | | | W |
| Moderate listings | | | | | | W |

---

## Matrix 2 — Feature × Event Type

Which features apply to which event types.

| Feature | T | L | K | Sh |
|---|:---:|:---:|:---:|:---:|
| **Events** |
| Browse & detail | x | x | x | x |
| Create event | x | x | x | x |
| Age & gender divisions | x | x | | x |
| Register team | x | x | | x |
| Register as player | | | x | x |
| **Teams & Players** |
| Team profile | x | x | | x |
| Player profile | x | x | x | x |
| Roster management | x | x | | x |
| Find a team | x | x | | x |
| **Schedules & Brackets** |
| Bracket | x | | | x |
| Fixture schedule | x | x | | |
| Session schedule | | | x | |
| Court assignments | x | x | | x |
| Consolation / back draw | x | | | |
| **Scores & Results** |
| Score entry | x | x | | x |
| Match status | x | x | | x |
| Results archive | x | x | | x |
| Attendance tracking | | | x | |
| **Rankings & Standings** |
| Standings table | x | x | | |
| Rank movement | x | x | | |
| Rankings history | x | x | | |
| Player stats | x | x | | x |
| Season records | | x | | |
| **Live & Real-time** |
| Live scores | x | x | | x |
| Push notifications | x | x | | x |
| Live stream links | x | x | | x |
| Court status board | x | x | | x |
| **AI Assistant** |
| Event creation by chat | x | x | x | x |
| Bracket suggestions | x | | | x |
| Q&A | x | x | x | x |

---

## Actor write summary

| Actor | Writes | Never writes |
|---|---|---|
| Organizer | Events, divisions, brackets, fixtures, courts, scores, match status | — |
| Coach | Team profile, player profiles, roster, registrations, attendance | Scores, brackets, events |
| Player | Own profile, individual registrations | Scores, rosters, events, brackets |
| Spectator | **Nothing** | Everything |
| Referee | Scores, match status | Events, rosters, brackets, profiles |
| Admin | Everything any other actor can write | — |

---

*See [actors.md](actors.md) · [event-types.md](event-types.md) · [roadmap.md](roadmap.md)*
