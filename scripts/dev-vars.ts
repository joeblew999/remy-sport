/**
 * Write .dev.vars with the local-dev variables (ADR 006, ADR 010).
 *
 * .dev.vars is gitignored and holds the local-dev counterpart of the remote
 * secret set by `mise run cf:secret:set`. The two are deliberately distinct
 * values — a local secret should never be able to sign a production session.
 *
 * Idempotent, and additive rather than all-or-nothing: an existing file keeps
 * every value it already has, and only missing keys are appended. The original
 * version returned early if the file existed at all, which meant a developer
 * who had run setup before this script learned about a new key would silently
 * never get it — and for MAIL_TRANSPORT that failure mode is a local run
 * quietly using the production mail transport.
 */

import { randomBytes } from "crypto"
import { existsSync, readFileSync, writeFileSync } from "fs"

const DEV_VARS = ".dev.vars"

/** Values only generated when absent, so a rerun never rotates a secret. */
const DEFAULTS: Record<string, () => string> = {
  // 32 bytes base64 — same strength as the remote secret.
  BETTER_AUTH_SECRET: () => randomBytes(32).toString("base64"),
  // Overrides wrangler.toml's [vars] MAIL_TRANSPORT="cloudflare". Local dev and
  // the Playwright suite capture mail into the mail_outbox table instead of
  // handing it to Cloudflare — see src/mail/mailer.ts.
  MAIL_TRANSPORT: () => "outbox",
  // Fixed sign-in code for the seeded @remy.dev actors (ADR 012).
  //
  // Not a convenience: the Playwright suite is fullyParallel and the actors are
  // shared, so two tests requesting a code for coach@remy.dev race — Better
  // Auth rotates the code on each request, so the first test's code is dead
  // before it is used. A fixed code for those six accounts removes the race
  // entirely. Real addresses still get random codes, and one spec still proves
  // the genuine emailed-code path end to end.
  TEST_OTP: () => "424242",
}

const existing = existsSync(DEV_VARS) ? readFileSync(DEV_VARS, "utf8") : ""
const present = new Set(
  existing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0]!.trim()),
)

const added: string[] = []
let out = existing
for (const [key, make] of Object.entries(DEFAULTS)) {
  if (present.has(key)) continue
  if (out && !out.endsWith("\n")) out += "\n"
  out += `${key}="${make()}"\n`
  added.push(key)
}

if (added.length === 0) {
  console.log(`dev-vars: ${DEV_VARS} already has every key, no change`)
  process.exit(0)
}

writeFileSync(DEV_VARS, out, { mode: 0o600 })
console.log(
  `dev-vars: ${existing ? "updated" : "wrote"} ${DEV_VARS} (${added.join(", ")})`,
)
