/**
 * The refusals a person can actually read, as codes rather than prose.
 *
 * These were English sentences thrown from handlers and rendered raw, so a Thai
 * coach on a fully Thai page got "A team cannot play itself" in English — the
 * API was a hole in the localisation. A code plus its facts fixes that: the
 * browser renders the sentence (src/web/lib/form-errors.ts) and `data` carries
 * what it needs to name.
 *
 * **No `message`, deliberately.** oRPC defaults it to the code, which is the
 * contract a non-browser caller should read; an English sentence here would
 * duplicate `messages/en.json` and drift from it.
 *
 * Not everything is here. `UNAUTHORIZED` and `FORBIDDEN` come from base.ts and
 * are never prose — a 401 sends you to sign in, a 403 means the control should
 * not have been offered — and a bare `NOT_FOUND` is the page's own words.
 */

import { z } from "zod"

/** Something the caller named does not exist. */
const NOT_FOUND = { status: 404 } as const

export const ERRORS = {
  BROADCAST_OCCUPIED: { status: 409 },
  // ── Fixtures ──────────────────────────────────────────────────────────────
  TEAM_PLAYS_ITSELF: { status: 400 },
  TEAM_NOT_ENTERED: {
    status: 400,
    data: z.object({ teamId: z.string() }),
  },

  // ── Registration ──────────────────────────────────────────────────────────
  /**
   * Carries both sides, because the useful sentence names them: "this team is
   * U18 boys; that division is U16 boys". A message with the facts baked in
   * could not be translated; a message with the facts beside it can.
   */
  DIVISION_MISMATCH: {
    status: 400,
    data: z.object({
      teamAgeGroup: z.string(),
      teamGender: z.string(),
      divisionAgeGroup: z.string(),
      divisionGender: z.string(),
    }),
  },
  /**
   * Two teams with no division in common, put in the same fixture.
   *
   * A different rule from DIVISION_MISMATCH above, which is about one team
   * against the division it enters. This is about the *pairing*, and nothing
   * checked it: a U16 boys' team could be scheduled against a U18 girls' team
   * in a league whose whole structure is divisions.
   *
   * Carries each side's divisions rather than a sentence, so the page names
   * them in the reader's language.
   */
  /**
   * A division the organiser tried to drop while teams are registered in it.
   *
   * Dropping it would orphan `eventTeam` rows — silently unregistering people
   * from an event they entered — so it is refused rather than cascaded. Carries
   * the divisions at fault so the page can name them.
   */
  DIVISION_IN_USE: {
    status: 400,
    data: z.object({ divisionIds: z.array(z.string()) }),
  },
  TEAMS_IN_DIFFERENT_DIVISIONS: {
    status: 400,
    data: z.object({
      homeDivisions: z.array(z.string()),
      awayDivisions: z.array(z.string()),
    }),
  },
  NOT_REGISTERED: { status: 404 },
  NOT_ON_ROSTER: { status: 404 },

  // ── People ────────────────────────────────────────────────────────────────
  UNKNOWN_USER: NOT_FOUND,
  UNKNOWN_PLAYER: NOT_FOUND,
  UNKNOWN_EVENT: NOT_FOUND,
  UNKNOWN_DIVISION: NOT_FOUND,
  UNKNOWN_ORG: NOT_FOUND,
  /**
   * A venue this event does not play at.
   *
   * 400 rather than 404: the venue exists, and saying "not found" about a court
   * that is plainly on the platform sends an organiser looking for a typo
   * instead of adding it to the event.
   */
  VENUE_NOT_AT_EVENT: { status: 400 },
  NOT_A_REFEREE: { status: 400 },
  NOT_ASSIGNED: { status: 404 },
  NOT_A_MEMBER: { status: 404 },
  NO_INVITATION: { status: 404 },

  // ── Events ────────────────────────────────────────────────────────────────
  BAD_DATE_RANGE: { status: 400 },
} as const

/** The codes, for the client's message table to be checked against. */
export type ErrorCode = keyof typeof ERRORS
