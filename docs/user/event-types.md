# Event Types

The platform supports four distinct event types. Each has different structure, goals, and participant needs.

See [actors.md](actors.md) for full actor definitions. See [roadmap.md](roadmap.md) for which features apply to each event type.

---

## Tournament

**What:** A bracketed competition with elimination rounds and a declared winner.

**Structure:**
- Teams or players register and are seeded into a draw
- Formats: single elimination, double elimination, round robin, pool play + knockout
- Divisions by age group, gender, and skill level
- Runs over one or more days

**Key features needed:**
- Bracket generation and management
- Court and match scheduling
- Score entry per quarter (Q1–Q4, OT)
- Live scores and results
- Standings within pools/groups

**Actors:**

| Actor | Writes data | Reads data |
|---|---|---|
| Organizer | Creates event, sets divisions, generates brackets, assigns courts, enters scores | Everything |
| Coach | Registers team, manages roster | Schedule, bracket, results, standings |
| Player | — | Schedule, results, personal stats |
| Spectator | — (read-only) | Bracket, live scores, results |
| Referee | Enters / validates scores, confirms match status | Assigned matches |
| Admin | Full write access across all tournaments | Everything |

---

## League

**What:** A recurring competition over a season where teams accumulate points across multiple match days.

**Structure:**
- Fixed set of teams play each other over a schedule of weeks or rounds
- Points awarded per result (win/draw/loss)
- Final standings determine champion or playoff seeding
- May include a playoff or grand final at the end

**Key features needed:**
- Season and round management
- Fixture generation (home/away or neutral)
- Running standings table
- Cumulative stats across rounds
- Player and team season records

**Actors:**

| Actor | Writes data | Reads data |
|---|---|---|
| Organizer | Creates season, generates fixtures, manages rounds, enters results | Everything |
| Coach | Registers team | Fixtures, standings, season stats |
| Player | — | Fixtures, results, personal season records |
| Spectator | — (read-only) | Standings, results, fixtures |
| Referee | Enters / validates scores, confirms match status | Assigned fixtures |
| Admin | Full write access across all leagues | Everything |

---

## Camp / Clinic

**What:** A training event focused on skill development, not competition.

**Structure:**
- Open to individual players (not necessarily team-based)
- Led by coaches, trainers, or guest instructors
- Single day or multi-day
- May target specific skills (shooting, defence, conditioning) or age groups

**Key features needed:**
- Individual player registration (not team)
- Session schedule and instructor listing
- Capacity limits and waitlists
- Attendance tracking (no brackets or scores)

**Actors:**

| Actor | Writes data | Reads data |
|---|---|---|
| Organizer | Creates camp, sets sessions and capacity, records attendance | Everything |
| Coach | Registers players from their team; registers as instructor | Session schedule |
| Player | Registers individually | Session schedule |
| Spectator | — (read-only, limited relevance) | Session info only |
| Referee | Not applicable | — |
| Admin | Full write access across all camps | Everything |

---

## Showcase

**What:** An exhibition event designed to expose players to scouts, recruiters, or a wider audience — competitive but with a recruitment/visibility focus.

**Structure:**
- Teams or individual players compete in games, but the primary goal is visibility
- Often features invited scouts, college coaches, or media
- May include player evaluations, highlight reel opportunities, or rankings by scouts
- Certification badges (NCAA, AAU) are common

**Key features needed:**
- Registration for teams and individual players
- Scout/recruiter attendee list or accreditation
- Game schedule and results (same as tournament)
- Player profile links for scouting
- Recruiting tool integrations (future)

**Actors:**

| Actor | Writes data | Reads data |
|---|---|---|
| Organizer | Creates event, manages registrations, invites scouts/media | Everything |
| Coach | Registers team, flags players for scouting visibility | Schedule, results |
| Player | Registers individually, links profile for scouts | Schedule, results, personal stats |
| Spectator | — (read-only; scouts and media observe only) | Schedule, results, player profiles |
| Referee | Enters / validates scores, confirms match status | Assigned matches |
| Admin | Full write access across all showcases | Everything |

---

## Cross-reference

| Property | Tournament | League | Camp / Clinic | Showcase |
|---|:---:|:---:|:---:|:---:|
| Competitive | x | x | | x |
| Brackets | x | | | x |
| Season / rounds | | x | | |
| Individual registration | | | x | x |
| Team registration | x | x | | x |
| Scores & results | x | x | | x |
| Attendance tracking | | | x | |
| Skill development focus | | | x | |
| Recruiting / scouting focus | | | | x |
| Standings / rankings | x | x | | |
| Stats tracking | x | x | | x |
| Waitlists | | | x | x |
| **Organizer** | x | x | x | x |
| **Coach** | x | x | x (instructor) | x |
| **Player** | x | x | x | x |
| **Spectator** | x | x | limited | x (scouts) |
| **Referee** | x | x | | x |
| **Admin** | x | x | x | x |

---

*Last updated: March 2026*
