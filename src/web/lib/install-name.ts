/**
 * The Add to Home Screen name, per environment — the single source of truth.
 *
 * The Product Owner asked (2026-09-08) that an installed app say which
 * environment it came from, so two environments installed side by side are
 * distinguishable on the home screen. Production keeps the plain product name;
 * every other environment gets a suffix. `short_name` is what iOS puts under
 * the icon (truncated to ~12 characters — `remy-localhost` renders as
 * `remy-localhos…`, which the Product Owner accepted).
 *
 * This module is imported by both `src/web/vite.config.ts` (which writes the
 * manifest) and `tests/repo/manifest.test.ts` (which reads the built manifest
 * and asserts it), so the check and the build share one table and cannot
 * drift. An unknown environment (the strictest answer, like `environmentOf`)
 * gets the production name.
 */
export const INSTALL_NAME: Record<string, { name: string; short_name: string }> = {
  dev: { name: "Remy Sport (localhost)", short_name: "remy-localhost" },
  staging: { name: "Remy Sport (staging)", short_name: "remy-staging" },
}

export function installName(environment: string) {
  return INSTALL_NAME[environment] ?? { name: "Remy Sport", short_name: "Remy" }
}
