/**
 * Where a failed write's message belongs on the form — and the guarantee that
 * it lands somewhere.
 *
 * The API answers a bad request in two shapes:
 *
 *   validation   `data.issues`, each with a path — "Invalid email address"
 *                belongs on the email box. The rules are the procedure's own zod
 *                schema and are never restated here.
 *
 *   everything   a 404 "Unknown user", a 403, "that team is not registered for
 *   else         this event". No field to sit under, so it belongs at the top or
 *                bottom of the form.
 *
 * **The trap this exists to close.** The obvious implementation is
 * `getIssueMessage(error, "email") ?? wholeFormMessage(error)`, and it has a
 * silent failure: a path that matches no issue returns undefined, and the
 * whole-form fallback returns nothing *because issues exist*. Mistype a path, or
 * rename a field upstream, and the reader clicks Save, the write is refused, and
 * the screen does not change. That is worse than a generic banner, and nothing
 * type-checks these paths — they are strings.
 *
 * So `formErrors` takes every path the form renders and accounts for all of
 * them. An issue whose path was not claimed is carried up to the form-level
 * message rather than dropped. A wrong path degrades to a visible error in the
 * wrong place, which someone will notice and fix; it never degrades to silence.
 *
 * From the orpc.dev post "You might not need a form library". The rest of that
 * post does not apply here — see src/web/pages/org.tsx for why the request
 * validation plugin cannot work in this codebase.
 */

import { getIssueMessage } from "@orpc/openapi-client/helpers"
import { isDefinedError, ORPCError } from "@orpc/client"
import type { ErrorCode } from "../../api/errors"
import { m } from "./i18n"

/**
 * A defined error's code, rendered in the reader's language.
 *
 * The server sends a code and the facts; the sentence is written here, as a
 * paraglide message like every other string in the product. Before this, the
 * API threw English prose and the page printed it — so a Thai coach on a fully
 * Thai page read "A team cannot play itself" in English.
 *
 * Typed as `Record<ErrorCode, ...>`, so adding a code in src/api/errors.ts and
 * forgetting the message is a compile error rather than a blank error box.
 */
const MESSAGES: Record<ErrorCode, (data: never) => string> = {
  TEAM_PLAYS_ITSELF: () => m.err_team_plays_itself(),
  TEAM_NOT_ENTERED: () => m.err_team_not_entered(),
  DIVISION_MISMATCH: (d: {
    teamAgeGroup: string
    teamGender: string
    divisionAgeGroup: string
    divisionGender: string
  }) => m.err_division_mismatch(d),
  NOT_REGISTERED: () => m.err_not_registered(),
  NOT_ON_ROSTER: () => m.err_not_on_roster(),
  UNKNOWN_USER: () => m.err_unknown_user(),
  UNKNOWN_PLAYER: () => m.err_unknown_player(),
  UNKNOWN_EVENT: () => m.err_unknown_event(),
  UNKNOWN_DIVISION: () => m.err_unknown_division(),
  UNKNOWN_ORG: () => m.err_unknown_org(),
  NOT_A_REFEREE: () => m.err_not_a_referee(),
  NOT_ASSIGNED: () => m.err_not_assigned(),
  NOT_A_MEMBER: () => m.err_not_a_member(),
  NO_INVITATION: () => m.err_no_invitation(),
  BAD_DATE_RANGE: () => m.err_bad_date_range(),
}

/**
 * The sentence for a refusal the API named, or null if it named nothing.
 *
 * Falls back to the server's own English message for a code with no entry,
 * which cannot happen while the table above type-checks — but a client running
 * against a newer Worker is exactly the case where it could, and English beats
 * blank.
 */
function definedMessage(error: unknown): string | null {
  /**
   * Cast before asking. `isDefinedError<T>` narrows to
   * `Extract<T, ORPCError<any, any>>`, and extracting from `unknown` yields
   * `never` — it is built for a typed client where the error is a known union,
   * and this helper deliberately takes anything so every form can use it.
   */
  const candidate = error as ORPCError<string, unknown>
  if (!isDefinedError(candidate)) return null

  const render = MESSAGES[candidate.code as ErrorCode] as ((d: unknown) => string) | undefined
  return render ? render(candidate.data) : (candidate.message ?? null)
}

interface Issue {
  path?: unknown
  message?: string
}

export interface FormErrors {
  /** The message for one field, by the path passed in. */
  field: (path: string) => string | undefined
  /**
   * What belongs at form level: a non-validation failure, or any validation
   * issue no field claimed. Null when everything is accounted for.
   */
  form: string | null
}

/**
 * @param error  a failed mutation's error, or null
 * @param paths  every field path this form renders a message for
 */
export function formErrors(error: unknown, paths: readonly string[] = []): FormErrors {
  if (!error) return { field: () => undefined, form: null }

  // A refusal the API named — rendered in the reader's language, not the
  // server's. This is checked first because a defined error carries a code, and
  // the code is a better answer than any message.
  const defined = definedMessage(error)
  if (defined) return { field: () => undefined, form: defined }

  const issues = (error as { data?: { issues?: Issue[] } }).data?.issues
  const message = (error as Error).message ?? null

  // Not a validation failure: a 404, a 403, a refusal with a sentence in it.
  if (!issues?.length) return { field: () => undefined, form: message }

  const claimed = new Set<string>()
  for (const p of paths) if (getIssueMessage(error, p) !== undefined) claimed.add(p)

  /**
   * Issues nothing rendered. `getIssueMessage` matches a path in oRPC's bracket
   * notation, so rather than reimplement that comparison, ask it: an issue is
   * orphaned when no path the form declared produced its message.
   */
  const orphans = issues
    .filter((i) => {
      const text = i.message
      if (!text) return false
      return ![...claimed].some((p) => getIssueMessage(error, p) === text)
    })
    .map((i) => i.message!)

  return {
    field: (path) => getIssueMessage(error, path),
    // Deduplicated: two fields can fail the same refinement, and saying it twice
    // reads as two problems.
    form: orphans.length ? [...new Set(orphans)].join(". ") : null,
  }
}
