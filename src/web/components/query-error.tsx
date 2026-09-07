import { formErrors } from "../lib/form-errors";
import { m } from "../lib/i18n";
import { ORPCError } from "@orpc/client";

/** A missing object has a stable empty state; a failed request can be retried. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ORPCError && error.status === 404;
}

/** Keep stale content usable; the caller decides whether initial data exists. */
export function QueryError({ error, retry, pending = false }: {
  error: unknown; retry: () => unknown; pending?: boolean;
}) {
  if (!error) return null;
  return <div className="feedback-error query-error" role="alert">
    <p>{formErrors(error).form ?? m.test_failed()}</p>
    <button className="btn" type="button" disabled={pending} onClick={() => void retry()}>
      {pending ? m.loading() : m.push_retry()}
    </button>
  </div>;
}
