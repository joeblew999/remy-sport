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
import { DEFAULT_SUBJECT, decideFromNames, generateVapid, halfPairMessage } from "./vapid"
import { DEMO_SIGN_IN_CODE } from "../src/environment"

const DEV_VARS = ".dev.vars"

/** Values only generated when absent, so a rerun never rotates a secret. */
const DEFAULTS: Record<string, () => string> = {
  // 32 bytes base64 — same strength as the remote secret.
  BETTER_AUTH_SECRET: () => randomBytes(32).toString("base64"),
  // Overrides wrangler.toml's [vars] MAIL_TRANSPORT="cloudflare". Local dev and
  // the Playwright suite capture mail into the mail_outbox table instead of
  // handing it to Cloudflare — see src/mail/mailer.ts.
  MAIL_TRANSPORT: () => "outbox",
  /**
   * Which capability table applies — see src/environment.ts.
   *
   * Needed on a fresh checkout because the fallback is *production*: without
   * it, a dev server would send real mail, drop its dev routes and sample
   * telemetry. That is the right way round for a deployment and wrong for a
   * laptop, which is exactly why it is written here rather than defaulted.
   */
  ENVIRONMENT: () => "dev",
  // Fixed sign-in code for the addresses the fixtures seed.
  //
  // It does NOT make parallel sign-in safe, whatever this comment used to say.
  // The code value stops rotating, but Better Auth still writes and consumes a
  // verification row per request, so two tests signing in as the same person
  // still invalidate each other and the loser gets INVALID_OTP. That cost 4
  // failed runs in 5 until authz.spec.ts stopped signing in at all.
  //
  // What it actually buys is not needing to read the outbox for every sign-in.
  // Specs that only need to *be* someone must load `stateFor(...)` — see the
  // trap in AGENTS.md.
  //
  // Local only. Setting it on a deployed Worker makes the admin account's
  // sign-in code a constant on a public site; that is why cf:smoke, not
  // test:deployed, verifies a deploy.
  // The Worker no longer reads this: dev's policy row says `signInCode:
  // "derived"`, so `fixedSignInCode()` answers from the table. It stays in
  // .dev.vars for the *other* half — the Playwright and worker helpers need to
  // know which code to type, and they read the environment. Same constant, so
  // the two halves cannot drift.
  TEST_OTP: () => DEMO_SIGN_IN_CODE,
  /**
   * Where this deployment thinks it lives.
   *
   * `wrangler.toml` [vars] sets it to https://remy.ubuntusoftware.net, which is
   * right for production and wrong everywhere else — and every link in every
   * email is built from it. On the dev tunnel a notification email
   * (src/api/notify-queue.ts) and an invitation (src/auth.ts) both linked
   * straight to *production*, so following one took you to a different
   * deployment with a different database.
   *
   * Nobody noticed because `MAIL_TRANSPORT=outbox` means dev captures rather
   * than sends, so the wrong link only ever appeared in a table nobody reads.
   * That is the same shape as the VAPID pair below: configuration absent on
   * every fresh checkout, and wrong precisely where it does the most damage.
   *
   * The tunnel rather than localhost, because it is the hostname a phone can
   * actually open — which is what these links are for.
   */
  BETTER_AUTH_URL: () => `https://${process.env.TUNNEL_HOSTNAME ?? "localhost:8787"}`,
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
const append = (key: string, value: string) => {
  if (out && !out.endsWith("\n")) out += "\n"
  out += `${key}="${value}"\n`
  added.push(key)
}

for (const [key, make] of Object.entries(DEFAULTS)) {
  if (present.has(key)) continue
  append(key, make())
}

/**
 * The VAPID keypair, which the scalars above cannot express.
 *
 * Web Push was configured once by hand and never again: this script generated
 * three values, none of them VAPID, and `.dev.vars` is gitignored — so push
 * worked for whoever set it up and was silently off on every fresh checkout.
 * `/api/push/key` answered `publicKey: null`, `pushState()` returned
 * "not-configured", and the profile page rendered "not switched on for this
 * deployment yet" identically signed in, signed out and in the installed PWA.
 *
 * ## Why this is not three entries in DEFAULTS
 *
 * The public and private keys are halves of one keypair and only mean anything
 * together. Filling them in independently — which is what a per-key loop does —
 * would pair a fresh private key with whatever public key was already there,
 * and every push would fail to sign for the endpoints browsers had pinned.
 *
 * So the pair is handled as a unit, and the three states are distinguished:
 *
 *   both present   leave them alone. **Rotating invalidates every subscription**
 *                  a browser has already pinned — see scripts/vapid.ts.
 *   both absent    generate one pair and write it.
 *   one present    refuse. Generating the partner produces a mismatched pair and
 *                  overwriting the survivor rotates it; both are silent 403s
 *                  later. A person has to say which they meant.
 *
 * `VAPID_SUBJECT` is not cryptographic — it is the contact address a push
 * service complains to — so it is filled in on its own like any other scalar.
 */
const decision = decideFromNames(present)

if (decision.action === "refuse") {
  console.error(`dev: ${halfPairMessage(decision, DEV_VARS)}`)
  // The mechanism, which is this caller's own: .dev.vars is a file, and there
  // is no deployment to protect — a local pair has no subscriptions pinned to
  // it beyond this developer's own browser.
  console.error(
    `  Restore the ${decision.missing} line, or delete the ${decision.have} line and rerun
` +
      "  to get a fresh pair.",
  )
  process.exit(1)
}

if (!present.has("VAPID_SUBJECT")) append("VAPID_SUBJECT", DEFAULT_SUBJECT)
if (decision.action === "generate") {
  const { publicKey, privateKey } = await generateVapid(DEFAULT_SUBJECT)
  append("VAPID_PUBLIC_KEY", publicKey)
  append("VAPID_PRIVATE_KEY", privateKey)
}

if (added.length === 0) {
  console.log(`dev: ${DEV_VARS} already has every key, no change`)
  process.exit(0)
}

writeFileSync(DEV_VARS, out, { mode: 0o600 })
console.log(
  `dev: ${existing ? "updated" : "wrote"} ${DEV_VARS} (${added.join(", ")})`,
)
