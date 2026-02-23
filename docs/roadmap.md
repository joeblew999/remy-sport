# Roadmap

## How to read this

Each phase is a cohesive milestone. Features link back to the competitor sites that inspired them (provenance from [sites.md](sites.md)). When we're ready to build a phase, each major feature gets its own ADR.

**Site key:**
- **EE** — [Exposure Events](https://basketball.exposureevents.com/youth-basketball-events)
- **SS** — [SportsSync Asia](https://www.sportssync.asia)
- **FIBA** — [FIBA Basketball](https://www.fiba.basketball/en/events)
- **TS** — [TournamentScoop](http://tournamentscoop.com/basketball/index.php)
- **BAS** — [Basketball Association of Singapore](https://bas.org.sg/5v5-tournaments/)

---

## Phase 0: Foundation (done)

| Feature | Status | ADR |
|---|---|---|
| Auth (email/password) | done | — |
| Deploy pipeline with versioning | done | [001](adr/001-deployment-versioning.md) |
| Seed users (admin + user) | done | [002](adr/002-seed-users.md) |
| OpenAPI docs | done | — |
| View layer (layout, home, login, versions) | done | — |

---

## Phase 1: Tournaments

The core of the platform — every competitor has this.

| Feature | Provenance | Notes |
|---|---|---|
| Create tournament | EE, SS, TS, BAS | Name, dates, location, format (5v5/3x3), age divisions |
| List/filter tournaments | EE, FIBA, TS, BAS | By date, location, age group, format, status |
| Tournament detail page | EE, SS, FIBA, TS | Description, rules, schedule, registration info |
| Event types | EE, TS | Tournament, league, camp/clinic, tryout, showcase |
| Age/gender divisions | EE, SS, FIBA, BAS | U12–U19, open, 35+; men/women/boys/girls |
| Registration | EE, SS, BAS | Sign up teams/players for a tournament |

**DB tables:** tournament, tournament_division, registration
**ADR needed:** 004-tournaments

---

## Phase 2: Teams & Players

| Feature | Provenance | Notes |
|---|---|---|
| Team creation & profiles | EE, SS, FIBA | Name, logo, club affiliation |
| Player profiles | SS, FIBA | Name, position, age, team membership |
| Roster management | FIBA | Add/remove players from team |
| Team finding | EE | Browse/search for teams seeking players |

**DB tables:** team, player, team_player (join)
**ADR needed:** 005-teams-players

---

## Phase 3: Scheduling & Brackets

| Feature | Provenance | Notes |
|---|---|---|
| Bracket generation | SS | Single/double elimination, round robin, pools |
| Match scheduling | SS, FIBA | Date, time, court assignment |
| Court management | SS, BAS | Define courts, assign matches, track availability |
| Consolation/back draw | SS | Losers bracket option |

**ADR needed:** 006-scheduling-brackets

---

## Phase 4: Scoring & Results

| Feature | Provenance | Notes |
|---|---|---|
| Score entry | SS, FIBA | Per-quarter scores (Q1–Q4, OT) |
| Game results page | FIBA | Final scores, box scores |
| Match status | FIBA | Upcoming, live, half-time, finished |
| Hide scores toggle | FIBA | Spoiler avoidance |
| Historical results | SS, FIBA | Past tournament archive |

**ADR needed:** 007-scoring-results

---

## Phase 5: Rankings

| Feature | Provenance | Notes |
|---|---|---|
| Points-based standings | EE, SS, FIBA | Per division/age group |
| Rank movement (+/-) | FIBA | Show climbers and droppers |
| Historical snapshots | FIBA | Rankings over time |
| Player stats tracking | SS | Per-game and cumulative stats |

**ADR needed:** 008-rankings

---

## Phase 6: Live & Real-time

| Feature | Provenance | Notes |
|---|---|---|
| WebSocket live scores | SS | Real-time score updates |
| Push notifications | SS | Match start, score updates, results |
| PWA support | SS | Installable, offline-capable |
| Live streaming links | SS, BAS | YouTube/external stream embeds |
| Court status board | SS | Which games are on which courts now |

**ADR needed:** 009-live-realtime

---

## Phase 7: MCP & AI

| Feature | Provenance | Notes |
|---|---|---|
| OpenAPI-to-MCP server | Ours (unique) | Zod schemas become MCP tools |
| MCP proxy/bridge | — | Remote MCP without agent restart |
| AI-assisted tournament ops | — | Create events, manage brackets via chat |

**ADR:** [003](adr/003-mcp-server.md) (proposed, needs research)

---

## Future (unphased)

Features seen in competitors but not yet prioritized:

| Feature | Provenance | Notes |
|---|---|---|
| Recruiting tools | EE | BeTheBeast, FastRecruit integration |
| Fantasy leagues | FIBA | Pick teams, earn points |
| Court finder | FIBA | "Find a Court" near me |
| Multi-language | SS, FIBA | i18n support |
| Certification badges | EE | NCAA, AAU, Jr. NBA verified |
| Sponsorship/partner display | FIBA | Logo placement, title sponsors |
| Referee/official management | BAS | Certification, assignment, scheduling |
| Medical/safeguarding | BAS | Incident reporting, first aid |
| Tournament widgets | EE | Embed on external sites |
| Video/photo galleries | SS, TS | Tournament media uploads |
| Email bulletins | EE | Upcoming events digest |
