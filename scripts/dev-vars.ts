/**
 * Write .dev.vars with a generated BETTER_AUTH_SECRET if it does not exist (ADR 006).
 *
 * .dev.vars is gitignored and holds the local-dev counterpart of the remote
 * secret set by `mise run cf:secret:set`. The two are deliberately distinct
 * values — a local secret should never be able to sign a production session.
 *
 * Idempotent: an existing .dev.vars is never overwritten, so a developer's
 * local secret survives re-running setup.
 */

import { randomBytes } from "crypto"
import { existsSync, writeFileSync } from "fs"

const DEV_VARS = ".dev.vars"

if (existsSync(DEV_VARS)) {
  console.log(`dev-vars: ${DEV_VARS} already exists, no change`)
  process.exit(0)
}

// 32 bytes base64 — same strength as the remote secret.
const secret = randomBytes(32).toString("base64")

writeFileSync(DEV_VARS, `BETTER_AUTH_SECRET="${secret}"\n`, { mode: 0o600 })
console.log(`dev-vars: wrote ${DEV_VARS} with a generated BETTER_AUTH_SECRET`)
