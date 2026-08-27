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
import { m } from "./i18n"

/**
 * A code's sentence, by convention rather than by a table.
 *
 * `TEAM_PLAYS_ITSELF` reads `err_team_plays_itself`. There used to be a
 * hand-written `Record<ErrorCode, ...>` here, which meant adding an error
 * touched four files and wrote the same English twice — once as the code's
 * `message`, once in `en.json`. Both are gone: the server sends no sentence at
 * all, and this derives the key.
 *
 * The compile-time guarantee the table gave up is replaced by a build-time one:
 * `mise run check:messages` fails when a code in src/api/errors.ts has no
 * `err_*` message in a released locale, so a missing sentence still cannot ship.
 */
const keyFor = (code: string) => `err_${code.toLowerCase()}`

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

  /**
   * Paraglide compiles one function per message, so this is a lookup on the
   * generated module. `data` is passed straight through — a message with no
   * placeholders ignores it, and one with them names exactly the fields the
   * error's own zod schema declares.
   */
  const render = (m as unknown as Record<string, ((d: unknown) => string) | undefined>)[
    keyFor(candidate.code)
  ]
  // A code this build has no message for. Only reachable against a newer
  // Worker; check:messages makes it impossible within one build.
  return render ? render(candidate.data ?? {}) : (candidate.message ?? null)
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
