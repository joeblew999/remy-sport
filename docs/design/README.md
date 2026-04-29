# Handoff: Remy Sport — Pitch Deck & App Prototype

## Source / round-tripping with Claude Design

Authored in **Claude Design** — project ID `019dd7a8-708f-7bcf-a952-77b03ae9db3e`. Edit there, re-export, and replace the files at the paths below.

- Project root: https://claude.ai/design/p/019dd7a8-708f-7bcf-a952-77b03ae9db3e
- App prototype entry: https://claude.ai/design/p/019dd7a8-708f-7bcf-a952-77b03ae9db3e?file=app%2Findex.html
- Pitch deck (in the biz repo): https://claude.ai/design/p/019dd7a8-708f-7bcf-a952-77b03ae9db3e?file=biz%2FPitch+Deck.html

**File mapping (Claude Design → this repo):**

| Claude Design path | This repo path |
|---|---|
| `app/index.html` | `prototype/index.html` |
| `app/main.jsx` | `prototype/main.jsx` |
| `app/pages.jsx` | `prototype/pages.jsx` |
| `app/shell.jsx` | `prototype/shell.jsx` |
| `app/data.js` | `prototype/data.js` |
| `app/styles.css` | `prototype/styles.css` |
| `app/tweaks-panel.jsx` | `prototype/tweaks-panel.jsx` |
| `design_handoff_remy_sport/README.md` | `README.md` (this file) |

The pitch deck (`biz/Pitch Deck.html`, `biz/deck-stage.js`) lives in the biz repo at `remy-sport-biz/pitchdeck/` — see that repo's README for its mapping.

## Overview

This package contains two design artifacts for **Remy Sport**, a basketball events platform for Thai schools that supports tournaments, leagues, camps, and showcases:

1. **Pitch deck** (`designs/pitch-deck.html`) — a 12-slide presentation explaining the product, audience, event types, roadmap, and traction. Suitable for investors, pilot schools, and stakeholder meetings.
2. **App prototype** (`designs/app/`) — a clickable hi-fi prototype of the Remy Sport application, presented in a Tauri-style desktop window chrome. Six primary screens are implemented: Discover, Event Detail (with bracket / schedule / standings tabs), Bracket, Live Game, Team, Profile.

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, **not production code to copy directly**.

The task is to **recreate these designs in the Remy Sport codebase's existing environment** (React + Tauri/web, per the architecture decisions in the biz-docs repo) using its established patterns, real routing, real data layer (Cloudflare Workers + D1), and any existing component library. If a frontend framework choice is still open, **React + Vite + TanStack Router** is recommended given the existing stack.

The prototype was built with vanilla React loaded via CDN and in-browser Babel — convenient for design iteration, **inappropriate for production**.

## Fidelity

**High fidelity.** The mockups have:

- Final color palette, typography choices, and spacing scale
- Real-feeling interactions (navigation, tab-switching, spoiler-mode toggle, language toggle, Tweaks panel)
- Final copy in both English and Thai for primary labels
- Realistic mock data (8 teams, 16-team bracket, full quarterly box score, 12-player roster, 8-team standings)

The developer should aim for **pixel-perfect recreation** of the visual style, then wire it up to real backend endpoints.

## Visual System (Design Tokens)

### Colors (oklch + hex)

```
--paper:        oklch(0.985 0.005 90)   /* ~ #f8f6f2  primary background */
--paper-2:      oklch(0.965 0.008 90)   /* ~ #f0ece4  hover / subtle fill */
--paper-3:      oklch(0.93  0.01  80)   /* ~ #e3ddcf  card / muted */
--ink:          oklch(0.18  0.01  270)  /* ~ #1c1d24  primary text */
--ink-2:        oklch(0.32  0.01  270)  /* ~ #3a3c46  secondary text */
--ink-3:        oklch(0.55  0.01  270)  /* ~ #777984  tertiary / labels */
--ink-4:        oklch(0.7   0.01  270)  /* ~ #a4a6b0  disabled */
--rule:         oklch(0.88  0.005 90)   /* ~ #d8d4cb  border */
--rule-2:       oklch(0.82  0.005 90)   /* ~ #c5c1b8  stronger border */
--accent:       oklch(0.62  0.18  35)   /* ~ #d17246  burnt orange (primary brand) */
--accent-deep:  oklch(0.48  0.18  35)   /* ~ #a4552f  hover/pressed */
--accent-soft:  oklch(0.94  0.04  50)   /* ~ #f5e8d9  highlight bg */
--court:        oklch(0.78  0.08  60)   /* ~ #d8c193  warm court tone */
--live:         oklch(0.55  0.22  25)   /* ~ #d62f1f  live red */
--good:         oklch(0.55  0.12  145)  /* ~ #4d8d5c  win green */
```

The accent is **tweakable** in the prototype (Tweaks panel → Brand → Accent color). The default is the burnt-orange `#D17246` which evokes a basketball without being literal.

### Typography

| Family | Use |
|---|---|
| `Space Grotesk` (500/600) | Display headings, scoreboards, numerics — the "voice" |
| `Inter` (400/500/600) | Body, UI labels, paragraph copy |
| `IBM Plex Mono` (400/500) | Eyebrow labels, metadata, kbd hints, all-caps tags |
| `Noto Sans Thai` (400/500/600) | Thai-language copy |

Type scale (px / line-height):
- H1 hero: 56 / 1.0, weight 600, letter-spacing −0.03em
- H1 page: 40 / 1.05, weight 600, −0.025em
- H2 section: 22 / 1.2, weight 600, −0.02em
- Body: 14 / 1.5
- Small / caption: 13
- Label (mono caps): 10–11, letter-spacing 0.1–0.14em, uppercase
- Scoreboard digits: 180 / 0.85, weight 600, −0.05em (live game only)

### Spacing

Coarse scale: `4, 8, 12, 16, 18, 24, 32, 48, 80` px. Most card padding is `14–22px`. Page gutters are `32px` desktop.

### Borders & Radii

- Most components use **1px `--rule` borders** with **0px radius** (editorial / modernist feel)
- Buttons and chips use **100px radius** (full pill)
- Avatars and crests use **50% radius**
- Cards do **not** typically use shadows — borders + paper-2 hover state instead

### Shadows

Used very sparingly. The Tweaks panel has a soft drop shadow; otherwise the design relies on borders and value contrast.

## Screens

### 1. Discover

**Purpose**: Landing page where any actor (coach, parent, scout, organizer) browses tournaments, leagues, camps, and showcases.

**Layout**:
- Sidebar (240px fixed) + main column
- Page header: breadcrumb, H1, subtitle (translates EN/TH)
- **Live banner** — full-width black band with a pulsing live pill, matchup name, mini-score (hideable via spoiler mode), quarter & clock, "Open game →" CTA
- Toolbar: tab row (All / Live / Registering / Upcoming / Past with counts) + filter chips (event types + cities)
- **Event list** — table-ish rows, each with:
  - Big day-of-month numeral + 3-letter month abbrev
  - Title + organizer (mono caps)
  - Type tag (Tournament / League / Camp / Showcase — different border/fill treatment per type)
  - Venue + city
  - Division (mono)
  - Status with colored dot/text (Live red, Registering green, Upcoming gray, Closed muted)
  - Hover: paper-2 background + arrow accent

**Components used**: Sidebar, Topbar, LiveBanner, EventRow

### 2. Event Detail

**Purpose**: Deep dive on a single event (the Bangkok Cup tournament is the canonical example).

**Layout**:
- **Hero** — type tag + status, large H1 with accent-color span on subtitle, EN+Thai tagline, 5-column stat strip (Teams / Courts / Games / Format / Following) with vertical rules between
- Action row: primary CTA (Register team / Following / Add to calendar / Share)
- **Tabs**: Overview, Bracket, Schedule, Standings, Teams, Venues, Rules
- **Overview** is a 2-column dash: left = Live & next-up cards + Top performers; right = Standings mini-table + Recent results

### 3. Bracket

**Purpose**: 16-team single-elimination bracket visualization.

**Layout**:
- Horizontal-scroll columns, one per round (R16 / QF / SF / Final)
- Each match is a small card with:
  - Header: round status + match ID (e.g. "Q3 · 06:42" if live, "FINAL" if done, scheduled time if upcoming)
  - Two team rows: seed, name, score
  - Winner row is bolded with accent score color; loser is muted
  - **Live matches have a 1.5px live-red border** and a pulsing dot in the header
  - TBA placeholders show in italic muted gray
- Clicking the live match navigates to the Live Game screen

### 4. Live Game (the showpiece)

**Purpose**: Real-time game view for spectators / scorers / coaches. Most visually distinct screen.

**Layout** — entire page is **dark mode** (`--ink` background) with paper-colored text:
- Breadcrumb + spoiler-mode toggle bar
- Header: event/court labels + viewer count + LIVE pill
- **Massive scoreboard** — three columns: Team A (crest 88px, name, Thai name, seed/record) | enormous tabular score numerals (180px, leading score in accent orange) | Team B
- Quarter + clock under the scoreboard, accent-colored time
- **Quarters table** — boxscore: row per team, cells per quarter, total in accent
- 2-column lower section:
  - **Play-by-play feed** (left, wider) — time + description, scoring plays get an accent left-bar
  - **Action stack** (right) — primary "Ask AI assistant" button in accent, then box score / parents / scorer / event navigation

**Spoiler mode**: when on, all numerics render as `--`; the toggle persists via Tweaks. Critical for parents who can't watch live and don't want to know the score.

### 5. Team Page

**Purpose**: A team's home — Saint Gabriel's College is the canonical example.

**Layout**:
- Hero: 120px crest + team name (EN+Thai) + meta + Following CTA + Record/Rank stat columns at right
- **Roster grid** — auto-fill cards, min 220px wide. Each card: avatar (initials), name, position+height, jersey number floated big and gray top-right, PPG/APG/RPG mini-stats
- **Schedule list** — date / opponent / event-type / score / status, with a highlighted live row

### 6. Profile / Coach Dashboard

**Purpose**: The logged-in user's home (Coach Sukasem). Most personalized screen.

**Layout**:
- Welcome header
- 2-column dashboard:
  - Left: Your live game card (live-red border) + Activity feed (timestamped)
  - Right: Your events list + Quick actions (Create event / Add to roster / Ask AI / Export season report)

## Components Inventory

| Component | File | Notes |
|---|---|---|
| `Sidebar` | shell.jsx | 240px, brand mark, two nav groups, user card at bottom |
| `Topbar` | shell.jsx | Search (⌘K), EN/TH toggle, spoiler-mode toggle, notifications, install CTA |
| `Icon` | shell.jsx | Inline SVG, 16×16 (must have explicit width/height attrs) |
| `Crest` | shell.jsx | Team logo placeholder — circle with two perpendicular lines |
| `LiveBanner` | pages.jsx | Full-width black band on Discover page |
| `EventRow` | pages.jsx | The Discover list row |
| `EventOverview` | pages.jsx | The 2-column overview tab content |
| `BracketView` | pages.jsx | The horizontal scroll bracket |
| `LivePage` | pages.jsx | Dark-mode live game |
| `TeamPage` | pages.jsx | Team hero + roster grid + schedule |
| `ProfilePage` | pages.jsx | Coach dashboard |
| `StandingsTable` | pages.jsx | Full standings table |
| `SchedulePlaceholder` | pages.jsx | Schedule grid for an event day |

## Interactions & Behavior

### Navigation
The prototype uses a simple `route` state object (`{ page, id }`) instead of real routing. Production should use proper routing (TanStack Router, React Router, or Tauri-aware equivalent). Routes implied:

```
/                           → Discover
/events/:id                 → Event Detail
/events/:id/bracket         → Bracket tab
/events/:id/schedule        → Schedule tab
/events/:id/standings       → Standings tab
/games/:id/live             → Live Game
/teams/:id                  → Team Page
/me                         → Profile / Dashboard
/standings                  → Global Standings
```

### Spoiler mode
Boolean preference. When ON, all live scores render as `--` across the entire app — Discover live banner, bracket, scoreboard, quarters table. Persisted to user preferences.

### Language toggle (EN/TH)
Switches primary copy between English and Thai. Most events have both `title` and `titleTh`; team names have `name` and `nameTh`. Use a real i18n library (e.g. i18next, FormatJS) instead of the inline ternaries used in the prototype.

### Live updates
Implied real-time behavior (not implemented in prototype):
- Score updates push via WebSocket / SSE
- Bracket auto-advances when a game finalizes
- Activity feed prepends new items

### Hover / active states
- Buttons: `--ink` → `--ink-2` for primary; `--rule` → `--ink-2` border for ghost
- List rows: paper-2 background, accent arrow on far right
- Tabs: 2px `--accent` underline on active

### Animations
- `pulse` keyframe on live dots (1.4s infinite, 50% opacity at midpoint)
- Tweaks panel fade-in via the starter component

## State Management

Recommend **Zustand** or **Jotai** for local UI state, **TanStack Query** for server data. State surfaces needed:

- `currentUser` (id, role, team affiliation, language preference, spoiler mode)
- `activeEvent` (with bracket / schedule / standings sub-resources)
- `liveGames` (subscriptions, with optimistic spoiler hiding)
- `notifications`

Backend per the biz-docs repo: **Cloudflare Workers + D1** (SQLite). Real-time via **Durable Objects + WebSockets** for live games.

## Internationalization

The platform serves Thai schools. Both EN and TH copy must be available for:
- Event names
- Team names
- Page headings
- Status labels
- Date formats (Thai year is +543 by Buddhist calendar — confirm with PO whether Gregorian or Thai years are preferred for UI)

Font stack must include `Noto Sans Thai` for Thai script.

## Accessibility

The prototype was built design-first; the developer should add:
- Proper ARIA labels for icon-only buttons
- Keyboard navigation for the bracket (arrow keys to move between matches)
- Focus rings (currently relies on browser defaults)
- Color contrast verification — `--ink-3` on `--paper` is borderline AA, validate
- Live region announcements for score changes (with spoiler-mode opt-out)
- Screen-reader text for the spoiler toggle state

## Assets

The prototype uses **no real images** — only:
- A geometric circle-with-cross-lines mark used for the brand and team crests (drawn in CSS)
- Inline SVG icons
- Google Fonts (Space Grotesk, Inter, IBM Plex Mono, Noto Sans Thai)

For production:
- Real school logos (request from each school as part of onboarding)
- A finalized Remy Sport logo (current brand mark is a placeholder)
- Player headshots (optional; the avatar fallback is initials-on-paper-3)
- Court / venue photography (currently absent — the design intentionally omits it)

## Mock Data Reference

`designs/app/data.js` contains all the realistic example data used in the prototype:
- 8 teams (with EN+Thai names, city, record)
- 7 events spanning all four event types and all status states
- A full 16-team bracket structure
- A live game with quarter scores and play-by-play
- A 12-player roster with stat lines
- 8-team standings table
- Activity feed entries

This is shape-of-data documentation as much as content — the developer can use it as a starting point for the database schema.

## Files in This Bundle

```
design_handoff_remy_sport/
├── README.md                       (this file)
└── designs/
    ├── pitch-deck.html             (12-slide standalone deck)
    └── app/
        ├── index.html              (entry point — script tags + EDITMODE block)
        ├── styles.css              (all CSS, ~700 lines, design tokens at top)
        ├── data.js                 (all mock data)
        ├── shell.jsx               (Sidebar, Topbar, Icon, Crest)
        ├── pages.jsx               (all page components)
        ├── main.jsx                (App root + routing + Tweaks)
        └── tweaks-panel.jsx        (DESIGN-TIME ONLY — do not ship)
```

`tweaks-panel.jsx` is a design-environment-only artifact (live theme controls, screen-jump menu). It is not meant to ship to production. Drop it during port.

## Implementation Recommendations

1. **Start with the Discover screen** — it surfaces the largest portion of the design system (event rows, status states, filter chips, live banner) and gives the team a working frame to build the rest in.
2. **Build the design tokens first** as CSS custom properties in a global stylesheet (or theme object if using styled-components / Emotion).
3. **The Live Game page is the highest-stakes screen** — it's the moment-of-truth for parents and the platform's most "wow" surface. Budget extra time for getting the scoreboard typography, the quarters table, and the play-by-play feed right.
4. **Real-time** is the hardest unbuilt piece. Mock it last; design-around it first by making sure scoreboard updates and play-by-play prepends look graceful.
5. **The bracket is non-trivial** when you have to handle 8/16/32-team variants. The hardcoded layout in the prototype works for 16 teams; generalize it before committing to it.

## Questions for the Product Owner

When porting, the dev team should confirm:
- Final brand identity (logo, exact color values, typography licensing)
- Thai vs Gregorian year display
- Real-time transport choice (Durable Objects WS vs polling)
- AI assistant scope (`Ask AI` button is wired but unimplemented — what queries should it answer?)
- Authentication provider (the biz-docs repo's auth epic is "complete" — which provider?)
- Payment / registration flow for paid events (not yet designed)
