import type { Page } from "@playwright/test"
import type { ProcedureUtils } from "@orpc/tanstack-query"
import { orpc } from "../../src/web/lib/orpc"
import { LOCALES, type Locale } from "../../src/domain/vocabularies"

/**
 * Hand the SPA's query cache its data, so a rendering test needs no backend.
 *
 * The keys come from the same `orpc.*.key()` the components subscribe to, and
 * the data is typed by the procedure's own return type — so a renamed
 * procedure or a changed response shape fails `bun run typecheck`, not a
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
 *
 * The procedure is typed as oRPC's own `ProcedureUtils` so that claim is true.
 * The earlier signature described the argument structurally — `{ queryKey:
 * (opts?: { input?: TInput }) => readonly unknown[] }` — and inferred `TOutput`
 * from `data` itself, so `data` was checked against nothing at all. It was also
 * the wrong shape: oRPC's `queryKey` takes a required argument, which made
 * seventy of the ninety-nine errors found the first time tests/ was ever
 * typechecked. Both faults were invisible for the same reason — no tsconfig
 * included this file.
 */
export function entry<TInput, TOutput>(
  procedure: ProcedureUtils<Record<never, never>, TInput, TOutput, Error>,
  input: TInput,
  data: NoInfer<TOutput>,
): { queryKey: readonly unknown[]; data: TOutput } {
  return { queryKey: procedure.queryKey({ input }), data }
}

export { orpc }

/**
 * The reference list, seeded under every locale the app might ask for.
 *
 * `reference.list` takes a locale now — it answers in one language instead of
 * sending all twenty-seven to render one
 * (docs/2026-09-09-17-reference-payload-per-locale.md) — so the locale is part
 * of its query key. A single `entry(orpc.reference.list, undefined, …)` no
 * longer matches, and a spec that *switches* language would need two keys
 * whatever it seeded.
 *
 * So seed them all. It costs a few cache entries in a test that has no network
 * anyway, it keeps the call site a single line, and a twenty-eighth language
 * does not quietly stop five specs from matching.
 *
 * `undefined` is included because the endpoint still accepts no locale and
 * answers in English, and a component reading it that way should be seeded too.
 */
export function referenceEntries<TOutput>(
  data: NoInfer<TOutput> extends never ? never : TOutput,
): { queryKey: readonly unknown[]; data: unknown }[] {
  const locales = [undefined, ...LOCALES] as (Locale | undefined)[]
  return locales.map((locale) => ({
    queryKey: orpc.reference.list.queryKey({ input: locale ? { locale } : undefined }),
    data,
  }))
}
