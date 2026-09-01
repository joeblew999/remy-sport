/**
 * Publish the Worker, through the boundary rather than around it.
 *
 * This was `run = "bun x wrangler deploy"` — the last raw wrangler invocation on
 * the deploy path, and the reason `deploy`'s shell block could not simply be
 * deleted. Every other step already resolves its own credential; this one
 * inherited whatever the pipeline had exported, so removing that export would
 * have dropped it back to the OAuth token, which is exactly the credential that
 * fails on anything D1-shaped. It would have broken at the *publish*, after the
 * migrations had run.
 *
 * Whether `wrangler deploy` needs D1 API access to validate the `d1_databases`
 * binding it uploads stops being a question worth answering once it comes
 * through here, because it gets the working credential either way.
 *
 * Declares an explicit target, because publishing is a remote write and that is
 * what Decision 1 asks of one — see docs/dev/cloudflare-module.md. Production is
 * wrangler's unnamed top-level config, so `--env production` correctly resolves
 * to *no* `--env` flag; the pipeline passes it exactly as it does for
 * cf:env:bootstrap and seed:remote.
 */

import { Refused, resolveTarget, wrangler } from "./cloudflare"

try {
  const target = resolveTarget(process.argv.slice(2), "explicit")
  console.log(`cf-deploy: publishing to ${target.environment}`)
  // Streamed: wrangler's upload progress is worth watching, and its result and
  // its progress share a stdout that must not be piped.
  const { code } = wrangler(["deploy"], target, { inherit: true })
  if (code !== 0) process.exit(code)
} catch (err) {
  if (err instanceof Refused) {
    console.error(`\ncf-deploy: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}
