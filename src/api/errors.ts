/**
 * The refusals a person can actually read, as codes rather than prose.
 *
 * Every one of these used to be an English sentence thrown from a handler and
 * rendered raw by the page — so a Thai coach on a fully Thai page got "A team
 * cannot play itself" in English. The API was a hole in the localisation.
 *
 * A code plus its facts fixes that: the browser renders the sentence in the
 * reader's language (src/web/lib/form-errors.ts), and `data` carries what the
 * sentence needs to name.
 *
 * **There is no `message` here, deliberately.** oRPC defaults it to the code, so
 * a non-browser caller — curl, another service, the OpenAPI document — sees
 * `TEAM_PLAYS_ITSELF`, which is the contract they should be reading anyway. An
 * English sentence here would be the same sentence as `messages/en.json`, in a
 * second place, drifting from the first. One string, one home.
 *
 * Not everything is here, deliberately. `UNAUTHORIZED` and `FORBIDDEN` are
 * produced by the middleware in base.ts and are never rendered as prose — a 401
 * sends you to sign in and a 403 means the control should not have been offered.
 * A bare `NOT_FOUND` for a missing object is the same: the page says "that does
 * not exist" in its own words. Typing those would be ceremony.
 */

import { z } from "zod"

/** Something the caller named does not exist. */
const NOT_FOUND = { status: 404 } as const

export const ERRORS = {
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
   * against the division it is entering. This is about the pairing, and until
   * 2026-08-31 nothing checked it: `games.create` verified that neither team
   * was playing itself and that both were entered, and a U16 boys' team could
   * be scheduled against a U18 girls' team in a league whose whole structure is
   * divisions. Confirmed against a running server — the API answered 201.
   *
   * Carries each side's divisions rather than a sentence, like its neighbour:
   * the page says "these teams are in different divisions" in the reader's
   * language, from the codes.
   */
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
  NOT_A_REFEREE: { status: 400 },
  NOT_ASSIGNED: { status: 404 },
  NOT_A_MEMBER: { status: 404 },
  NO_INVITATION: { status: 404 },

  // ── Events ────────────────────────────────────────────────────────────────
  BAD_DATE_RANGE: { status: 400 },
} as const

/** The codes, for the client's message table to be checked against. */
export type ErrorCode = keyof typeof ERRORS
