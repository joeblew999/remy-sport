/**
 * Does changing this file mean the deployment is no longer the code under test?
 *
 * `scripts/e2e.ts` asks this before running a suite against a remote origin.
 * The answer decides whether a dirty tree is a reason to refuse, so it errs
 * towards `true`: an unlisted path is assumed to reach the Worker, because a
 * wrong `false` produces a green run against code nobody deployed, which is the
 * failure this guard exists to prevent.
 *
 * The exemptions are the places that describe the test rather than the product:
 * documentation, the suites themselves, CI, the runner's own scripts — and the
 * two Playwright configs, which are `tests/` in every sense except where they
 * sit. They choose a browser, a worker count and a local dev command; nothing in
 * `src/` imports them and nothing in them is bundled. Editing one to record a
 * trace refused a verification on 2026-09-10 whose deployment was correct.
 *
 * `scripts/ops/**` is deliberately NOT exempt even though most of it is
 * tooling: `fonts.ts` generates what the page downloads and `domain.ts` copies
 * the model into `src/`, so the directory as a whole does reach the deployment
 * and the rule cannot tell which member is which. A false refusal there is
 * answered by the message naming the file, not by widening this.
 */
export function affectsDeployment(path: string): boolean {
  return !(path.startsWith('docs/') || path.startsWith('tests/') || path.startsWith('.github/') ||
    (!path.includes('/') && path.endsWith('.md')) ||
    ['scripts/e2e.ts', 'scripts/lib/staging-test-access.ts', 'scripts/lib/deployed-source.ts',
      'playwright.config.ts', 'playwright.render.config.ts'].includes(path))
}
