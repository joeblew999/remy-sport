/**
 * Where a failed write's message belongs on the form.
 *
 * The API answers a bad request in two shapes, and they want different places
 * on screen:
 *
 *   validation   `data.issues`, each with a path — "Invalid email address" on
 *                the email box. `getIssueMessage` from
 *                @orpc/openapi-client/helpers reads these; the rules are the
 *                procedure's own zod schema and are never restated here.
 *
 *   everything   a 404 "Unknown user", a 403, "that team is not registered for
 *   else         this event". No field to sit under, so it belongs at the top or
 *                bottom of the form rather than beneath an input that is not the
 *                problem.
 *
 * `formError` is the second of those, and returns null for the first so the two
 * do not both render — a banner saying "Input validation failed" above a field
 * that already says what is wrong is noise that teaches people to ignore
 * banners.
 *
 * Extracted here after the third form wanted it. See the orpc.dev post "You
 * might not need a form library" for where this came from, and src/web/pages/
 * org.tsx for why the plugin half of that post does not apply to this codebase.
 */

/** The message for a failure that belongs to no single field, or null. */
export function formError(error: unknown): string | null {
  if (!error) return null
  const issues = (error as { data?: { issues?: unknown[] } }).data?.issues
  return issues?.length ? null : ((error as Error).message ?? null)
}
