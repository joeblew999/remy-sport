# Actors / User Types

The platform serves six distinct user types. Each has different goals, permissions, and feature needs.

---

## 1. Tournament Organizer

**Who:** Club directors, league administrators, event coordinators.

**Goal:** Create and run tournaments — set up events, manage registrations, publish schedules, enter scores, handle communications.

**Key capabilities:**
- Create and edit tournaments (name, dates, location, format, divisions)
- Open and close registration
- Generate and manage brackets
- Assign courts and set match schedules
- Enter and update scores
- Publish results and communicate with participants

---

## 2. Coach / Team Manager

**Who:** Team coaches, club managers, parent coordinators running a squad.

**Goal:** Register their team in events, manage their roster, and track their schedule and results.

**Key capabilities:**
- Create and manage a team profile
- Add and remove players from the roster
- Register the team for tournaments
- View their team's schedule and bracket position
- Track results and standings

---

## 3. Player

**Who:** Individual athletes — youth through adult.

**Goal:** Find events to play in, track their stats, and manage their profile.

**Key capabilities:**
- Maintain a personal profile (position, age, team membership)
- Browse and register for events (individually or via a team)
- View their schedule and match results
- Track personal stats across tournaments

---

## 4. Spectator / Fan

**Who:** Parents, supporters, casual followers. May not have an account.

**Goal:** Follow tournaments, watch live scores, and find out when and where games are happening.

**Writes data: No — read-only.** Spectators never create or modify any content on the platform.

**Key capabilities:**
- Browse and search tournaments without signing in
- View brackets, schedules, and court assignments
- Follow live scores and match status
- View rankings and historical results
- Toggle spoiler mode (hide scores until ready)
- Watch live stream links

---

## 5. Referee / Official

**Who:** Certified referees and table officials assigned to games.

**Goal:** Know their assignment schedule and record game events.

**Key capabilities:**
- View assigned matches (date, time, court)
- Confirm game start and end
- Enter or validate scores
- Access certification and scheduling info

---

## 6. Platform Admin

**Who:** Internal staff managing the platform.

**Goal:** Oversee all users, content, and system health.

**Key capabilities:**
- Manage all user accounts and roles
- Moderate tournament listings
- Access all organizer capabilities on any tournament
- View platform-wide analytics and activity

---

See [matrix.md](matrix.md) for the full Actor × Feature × Event Type access matrix.

## Capability matrix

**W = writes data · R = reads data only**

| Capability | Organizer | Coach | Player | Spectator | Referee | Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Browse events | R | R | R | R | R | R |
| Create / edit event | W | | | | | W |
| Register team | | W | | | | |
| Register as player | | | W | | | |
| Manage roster | | W | | | | |
| Enter scores | W | | | | W | W |
| Confirm match start/end | | | | | W | W |
| Attend / record attendance | | W | W | | | W |
| View live scores | R | R | R | R | R | R |
| View brackets & schedule | R | R | R | R | R | R |
| Manage all users | | | | | | W |

**Spectator is the only actor who never writes data.**

## Event type access

**W = writes data · R = reads only · — = not applicable**

| Actor | Tournament | League | Camp / Clinic | Showcase |
|---|:---:|:---:|:---:|:---:|
| Organizer | W | W | W | W |
| Coach | W (team reg, roster) | W (team reg) | W (player reg, instructs) | W (team reg) |
| Player | W (profile, individual reg) | W (profile) | W (individual reg) | W (profile, individual reg) |
| Spectator | R | R | R (limited) | R |
| Referee | W (scores) | W (scores) | — | W (scores) |
| Admin | W | W | W | W |

---

## Notes

- A **Coach** may also be a **Player** — the platform supports both roles on one account.
- **Spectators** have full read access without an account; an account unlocks following, notifications, and spoiler mode.
- **Referee** is a future role (Phase 6+); initially organizers handle score entry.
- Role assignment is handled through Better Auth's organization and role plugins.
- See [event-types.md](event-types.md) for how each actor participates across Tournaments, Leagues, Camps, and Showcases.
