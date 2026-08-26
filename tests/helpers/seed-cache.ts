import type { Page } from "@playwright/test"
import { orpc } from "../../src/web/lib/orpc"

/**
 * Hand the SPA's query cache its data, so a rendering test needs no backend.
 *
 * The keys come from the same `orpc.*.key()` the components subscribe to, and
 * the data is typed by the procedure's own return type — so a renamed
 * procedure or a changed response shape fails `mise run typecheck`, not a
 * browser run three minutes later.
 *
 *   await seedCache(page, [entry(orpc.events.list, {}, { events: [...] })])
 *   await page.goto("/#/discover")
 *
 * There is no network in that test at all: no sign-in, no seeded D1, no wait.
 */
export async function seedCache(
  page: Page,
  entries: { queryKey: readonly unknown[]; data: unknown }[],
): Promise<void> {
  await page.addInitScript((seed) => {
    ;(window as unknown as { __QUERY_SEED__: unknown }).__QUERY_SEED__ = seed
  }, entries)

  /**
   * Anything NOT seeded fails instantly instead of hanging.
   *
   * These tests run against `vite preview`, which serves the bundle and has no
   * `/rpc`. An unseeded query therefore hit a route that could not answer, and
   * TanStack retried it twice with backoff — a uniform ~3s per test, which was
   * the entire cost of this tier. (The retry policy in main.tsx skips 4xx; the
   * failure had no status to skip on.)
   *
   * A real 404 gives it one, so an unseeded query now resolves in milliseconds
   * and the page renders its empty state — which is the honest outcome for a
   * test that did not provide the data.
   */
  await page.route("**/rpc/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: "NOT_FOUND", message: "not seeded in this render test" }),
    }),
  )
}

/**
 * One typed entry. `data` is checked against what the procedure actually
 * returns, which is the whole point — a hand-written fixture would drift.
 */
export function entry<TInput, TOutput>(
  procedure: { queryKey: (opts?: { input?: TInput }) => readonly unknown[] },
  input: TInput,
  data: TOutput,
): { queryKey: readonly unknown[]; data: TOutput } {
  return { queryKey: procedure.queryKey({ input }), data }
}

export { orpc }
