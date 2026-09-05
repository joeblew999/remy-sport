/**
 * What this build is, baked in by vite.config.ts (`define`) — the commit and
 * branch it was built from, when, for which environment, and the app version.
 * Served at /api/versions, so every deployment can say what it is running and
 * `bun run deploy` can wait for the edge to serve the build it just published.
 *
 * A constant at build time rather than a file: the file (versions.json) was
 * stamped by a script before each deploy and restamped for dev before each
 * start, and sat in git saying "staging" while describing a laptop. The tests
 * supply their own value in vitest.config.ts.
 */
declare const __BUILD__: {
  commit: string
  branch: string
  builtAt: string
  environment: string
  app: string
  github: string | null
}
