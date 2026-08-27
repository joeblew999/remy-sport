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
