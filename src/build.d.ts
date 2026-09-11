/**
 * What this build is — **for the SPA only**.
 *
 * src/web/vite.config.ts bakes it in with `define`, from the single `stamp()`
 * in scripts/lib/build-stamp.ts. The SPA is a bundle, so a compile-time
 * constant is the honest shape for it: there is no environment to read from in
 * a browser.
 *
 * **The Worker must not read this.** It reads `env.BUILD`, a var, written into
 * the generated config by scripts/deploy/build-config.ts. The distinction is
 * load-bearing rather than stylistic: a define is a value that differs across
 * dev, staging and production without POLICY or provisioning knowing, and it
 * only exists where the substitution ran. It does not run in the worker test
 * pool, which builds from wrangler.toml — so `/api/versions` answered 500
 * there for as long as the Worker read `__BUILD__`, and nothing noticed
 * because the endpoint was a raw Hono route with no test.
 *
 * A constant rather than a file: versions.json was stamped by a script before
 * each deploy and restamped for dev before each start, and sat in git saying
 * "staging" while describing a laptop.
 */
declare const __BUILD__: {
  commit: string
  branch: string
  builtAt: string
  environment: string
  app: string
  github: string | null
}
