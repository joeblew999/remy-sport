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
 * **The `message` here is not dead.** It is what a non-browser caller sees —
 * curl, the OpenAPI document, another service — and what the client falls back
 * to if a code ever arrives with no message defined for it. English is the right
 * language for that audience; it is the wrong one for a person using the
 * product, and the difference is the whole point.
 *
 * Not everything is here, deliberately. `UNAUTHORIZED` and `FORBIDDEN` are
 * produced by the middleware in base.ts and are never rendered as prose — a 401
 * sends you to sign in and a 403 means the control should not have been offered.
 * A bare `NOT_FOUND` for a missing object is the same: the page says "that does
 * not exist" in its own words. Typing those would be ceremony.
 */

import { z } from "zod"

/** Something the caller named does not exist. `what` is the noun to say. */
const unknown = (what: string) => ({
  status: 404,
  message: `Unknown ${what}`,
})

export const ERRORS = {
  // ── Fixtures ──────────────────────────────────────────────────────────────
  TEAM_PLAYS_ITSELF: {
    status: 400,
    message: "A team cannot play itself",
  },
  TEAM_NOT_ENTERED: {
    status: 400,
    message: "That team is not registered for this event",
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
    message: "That team does not match the division it was entered into",
    data: z.object({
      teamAgeGroup: z.string(),
      teamGender: z.string(),
      divisionAgeGroup: z.string(),
      divisionGender: z.string(),
    }),
  },
  NOT_REGISTERED: { status: 404, message: "That team is not entered in this event" },
  NOT_ON_ROSTER: { status: 404, message: "That player is not on this roster" },

  // ── People ────────────────────────────────────────────────────────────────
  UNKNOWN_USER: unknown("user"),
  UNKNOWN_PLAYER: unknown("player"),
  UNKNOWN_EVENT: unknown("event"),
  UNKNOWN_DIVISION: unknown("division"),
  UNKNOWN_ORG: unknown("organisation"),
  NOT_A_REFEREE: {
    status: 400,
    message: "That account is not a referee",
  },
  NOT_ASSIGNED: { status: 404, message: "That referee is not on this game" },
  NOT_A_MEMBER: { status: 404, message: "That person is not a member" },
  NO_INVITATION: { status: 404, message: "There is no invitation to accept" },

  // ── Events ────────────────────────────────────────────────────────────────
  BAD_DATE_RANGE: {
    status: 400,
    message: "The end date must be on or after the start date",
  },
} as const

/** The codes, for the client's message table to be checked against. */
export type ErrorCode = keyof typeof ERRORS
