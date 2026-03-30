# Feature Roadmap

What's built, what's coming, and what's on the horizon for Remy Sport.

See [matrix.md](matrix.md) for the full Actor × Feature × Event Type access matrix.
See [actors.md](actors.md) for actor definitions. See [event-types.md](event-types.md) for event type definitions.

**Actor key:** O = Organizer · C = Coach · P = Player · S = Spectator · R = Referee · A = Admin

**Event type key:** T = Tournament · L = League · K = Camp/Clinic · Sh = Showcase

**Access key:** W = actor writes/creates data · R = actor reads data only

---

## Now — Available Today

| Feature | Description | Access | Actors | Event Types |
|---|---|:---:|---|---|
| Sign in / Sign out | Email and password login | W | All | All |
| Secure accounts | Your session is protected and managed safely | R | All | All |

---

## Coming Next — Events

The core of the platform: find, register for, and follow events.

| Feature | Description | Access | Actors | Event Types |
|---|---|:---:|---|---|
| Browse events | See all upcoming events filtered by date, location, age group, or format | R | All | All |
| Event detail pages | Full info: rules, schedule, registration deadlines, location | R | All | All |
| Age & gender divisions | U12–U19, open, 35+; men / women / boys / girls | R | All | T, L, Sh |
| Create an event | Set up a new event with type, format, divisions, and dates | W | O, A | All |
| Register your team | Sign up a team for an event | W | C, A | T, L, Sh |
| Register as a player | Sign up individually for an event | W | P | K, Sh |

---

## Teams & Players

Build your squad and track your players across events.

| Feature | Description | Access | Actors | Event Types |
|---|---|:---:|---|---|
| Team profiles | Create a team with name, logo, and club affiliation | W | C, A | T, L, Sh |
| Player profiles | Create and maintain a personal profile | W | P, C | All |
| Roster management | Add or remove players from your team | W | C, A | T, L, Sh |
| Find a team | Browse teams that are looking for players | R | P | T, L, Sh |

---

## Schedules & Brackets

Know exactly when and where you play.

| Feature | Description | Access | Actors | Event Types |
|---|---|:---:|---|---|
| Bracket views | Single/double elimination, round robin, pool stages | R | All | T, Sh |
| Fixture schedule | Date, time, and court for every game or session | R | All | All |
| Court assignments | See which court your match or session is on | R | All | T, L, Sh |
| Consolation / back draw | Track all paths through the bracket | R | All | T |
| Generate brackets | Auto-generate draws from registered teams | W | O, A | T, Sh |
| Fixture generation | Auto-generate round-robin or home/away fixtures | W | O, A | L |
| Session schedule | Define session blocks, instructors, and capacity | W | O, A | K |

---

## Scores & Results

Live and historical results for every game.

| Feature | Description | Access | Actors | Event Types |
|---|---|:---:|---|---|
| Score entry | Per-quarter scoring (Q1–Q4, overtime) | W | O, R, A | T, L, Sh |
| Confirm match status | Mark a match as started, half-time, or finished | W | O, R, A | T, L, Sh |
| Game result pages | Final scores and box scores | R | All | T, L, Sh |
| Match status | Upcoming / live / half-time / finished | R | All | T, L, Sh |
| Spoiler mode | Hide scores until you're ready to see them | R | S, P, C | T, L, Sh |
| Results archive | Browse past event history | R | All | T, L, Sh |
| Attendance tracking | Record player attendance for sessions | W | O, C | K |

---

## Rankings & Standings

See how your team stacks up.

| Feature | Description | Access | Actors | Event Types |
|---|---|:---:|---|---|
| Standings table | Points-based tables per division and age group | R | All | T, L |
| Rank movement | See who's climbing and who's dropping | R | All | T, L |
| Rankings history | How the table looked after each round | R | All | T, L |
| Player stats | Per-game and season totals | R | P, C, S | T, L, Sh |
| Season records | Cumulative stats across all rounds of a league | R | P, C, S | L |

---

## Live & Real-time

Stay connected during the action.

| Feature | Description | Access | Actors | Event Types |
|---|---|:---:|---|---|
| Live scores | Real-time score updates as games happen | R | All | T, L, Sh |
| Push notifications | Alerts for match start, score changes, and final results | R | C, P, S | T, L, Sh |
| Install the app | Add to your home screen and use offline (PWA) | R | All | All |
| Live stream links | Watch games via YouTube or external streams | R | S, P, C | T, L, Sh |
| Court status board | See which games are on which courts right now | R | All | T, L, Sh |

---

## AI Assistant

Get things done faster with a built-in assistant.

| Feature | Description | Access | Actors | Event Types |
|---|---|:---:|---|---|
| Event creation by chat | Create and configure events through a conversation | W | O, A | All |
| Bracket suggestions | AI help setting up match schedules and draws | W | O, A | T, Sh |
| Q&A | Ask questions about standings, schedules, and results | R | All | All |

---

## Future Ideas

Things we're exploring but haven't scheduled yet.

| Feature | Description | Access | Actors | Event Types |
|---|---|:---:|---|---|
| Court finder | Find a court near you | R | P, C, S | All |
| Fantasy leagues | Pick teams and earn points across an event | W | S, P | T, L |
| Recruiting tools | Connect players with college and club opportunities | W | P, C | Sh |
| Certification badges | NCAA, AAU, Jr. NBA verified event labels | W | O, A | T, Sh |
| Referee management | Certification, assignment, and scheduling for officials | W | R, O, A | T, L, Sh |
| Video & photo galleries | Media uploads from events | W | O, S | All |
| Embed widgets | Drop a bracket or schedule onto your own website | W | O | T, L, Sh |
| Multi-language | Use the platform in your preferred language | R | All | All |
| Sponsor display | Title sponsors and partner logos on event pages | W | O, A | T, L, Sh |
| Email digests | Weekly roundup of upcoming events near you | R | S, P, C | All |
| Medical & safeguarding | Incident reporting and first-aid tracking | W | O, A | T, L, Sh |
| Waitlists | Queue for full camps or events | W | P, C | K, Sh |
| Instructor profiles | Coach/trainer bios and credentials for camps | W | O, C | K |

---

*Last updated: March 2026*
