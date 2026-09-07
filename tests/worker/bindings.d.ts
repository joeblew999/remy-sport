/** The test pool supplies this fixture binding in vitest.config.ts, even when
 * Wrangler generates production types without any local .dev.vars file.
 */
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string
  }
}
