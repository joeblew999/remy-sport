/**
 * Is seeded sign-in on, and who does it let in?
 *
 * Asks the deployment, not the config. What is *set* and what is *serving* are
 * different questions — a secret can be set on a Worker that has not been
 * deployed since, and a deploy can carry a change nobody meant — and only the
 * second question matters to someone deciding whether to worry.
 *
 * ## Two capabilities that look like one
 *
 * The policy table splits them on purpose, and this file used to conflate them
 * again in the one place that checks:
 *
 *   - **The picker** — `/api/dev/accounts`, which lists the seeded accounts so a
 *     person can click one. Governed by `seededSignIn`.
 *   - **The fixed code** — whether a fixed OTP is accepted at all. Governed by
 *     `signInCode`, and turned on by `demo:on` writing `TEST_OTP`.
 *
 * On production `seededSignIn` is false and `signInCode` is "secret": it accepts
 * a fixed code without publishing who it is for. That combination is precisely
 * what the policy table was built to express and what a single boolean could not.
 *
 * This asked the picker to answer a question about the code, so on production it
 * reported OFF however well `TEST_OTP` was working — and `demo:on`, which asks
 * this to confirm, reported failure on success. On 2026-09-01 that left a fixed
 * sign-in code enabled on production with no tool in the repo able to say so.
 *
 * So the check is now the capability itself: request a code for one seeded
 * `.test` address, submit the fixed code, and see whether a session comes back.
 * A session means on. That works identically on all three environments, needs no
 * new endpoint, and cannot be fooled by the picker being absent, because it
 * tests the thing rather than a proxy for it.
 */

import { originOf, resolveTarget } from "../cloudflare"

import { DEMO_SIGN_IN_CODE } from "../../src/environment"
import { SEED_ENTITIES } from "../../src/domain/model/entities"

const BASE = process.env.CF_DEPLOY_URL ?? originOf(resolveTarget(process.argv.slice(2), "ambient"))

/** The code `demo:on` publishes. `DEMO_CODE` overrides it, as it does there. */
const CODE = process.env.DEMO_CODE ?? DEMO_SIGN_IN_CODE

/**
 * A seeded non-admin, from the fixtures rather than a literal.
 *
 * Never the admin: it holds ban, set-role and impersonate, and impersonation is
 * the one power that reaches a real person. `src/auth.ts` withholds the fixed
 * code from it wherever mail is really sent, so probing with it would report
 * OFF on a deployment where seeded sign-in is very much on.
 */
const probe = SEED_ENTITIES.users.find((u) => u.roleCode !== "ADMIN" && u.email.endsWith(".test"))
if (!probe) {
  console.error("demo-status: no seeded non-admin .test account in the fixtures to probe with")
  process.exit(1)
}

const json = { "Content-Type": "application/json", Origin: BASE }

/**
 * Whether the fixed code actually signs this account in.
 *
 * Requesting the code first is not optional: Better Auth verifies against a
 * stored verification row, and `TEST_OTP` fixes what that row contains rather
 * than bypassing the check.
 */
async function fixedCodeWorks(): Promise<boolean | string> {
  const sent = await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email: probe!.email, type: "sign-in" }),
  }).catch(() => null)
  if (!sent) return `${BASE} is unreachable`
  // A deployment that will not even issue a code cannot be serving a fixed one.
  if (!sent.ok) return false

  const signedIn = await fetch(`${BASE}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email: probe!.email, otp: CODE }),
  }).catch(() => null)
  if (!signedIn) return `${BASE} is unreachable`
  if (!signedIn.ok) return false

  // 200 alone is not a session. Require the user Better Auth returns on a real
  // sign-in, so a route that answers cheerfully with nothing cannot read as ON.
  const body = (await signedIn.json().catch(() => null)) as { user?: { id?: string } } | null
  const worked = Boolean(body?.user?.id)

  /**
   * Signed out again, because this check is a read that writes.
   *
   * Proving the capability means actually signing in, which consumes the OTP and
   * leaves a session row behind for a seeded account. Locally that is tidied by
   * `DELETE /api/dev/otp` and the dev-sessions route; on a deployment neither
   * exists — `dev-sessions.ts` is gated on `usesOutbox` — so without this, every
   * status check quietly accumulates sessions on the live deployment. Small, but
   * an operator command that leaks state each time it answers a question is a
   * thing to find later rather than now.
   *
   * Best-effort: failing to sign out does not change the answer, and reporting
   * that answer is what was asked for.
   */
  if (worked) {
    const cookies = signedIn.headers.getSetCookie?.() ?? []
    if (cookies.length) {
      await fetch(`${BASE}/api/auth/sign-out`, {
        method: "POST",
        headers: { ...json, Cookie: cookies.map((c) => c.split(";")[0]).join("; ") },
        // `{}`, not nothing: the Content-Type says JSON, so an empty body is a
        // 400 "Invalid JSON in request body" and the session survives — a
        // cleanup that silently does not clean up.
        body: "{}",
      }).catch(() => undefined)
    }
  }
  return worked
}

const works = await fixedCodeWorks()
if (typeof works === "string") {
  console.error(`demo: could not tell — ${works}`)
  process.exit(1)
}

if (!works) {
  console.log(`demo: OFF at ${BASE}`)
  console.log(`      The fixtures' addresses are .test, so there is no way to sign in as them.`)
  process.exit(0)
}

console.log(`demo: ON at ${BASE}`)
console.log(`      code ${CODE} signs in ${probe.names.en} <${probe.email}>`)

/**
 * The picker, asked separately now, because it is a separate capability.
 *
 * Its absence is not "demo is off" — on production it is absent by design while
 * the code above works perfectly. Where it *is* served, the account list is
 * still worth checking, because the invariant below can only be read from it.
 */
const listed = await fetch(`${BASE}/api/dev/accounts`).catch(() => null)
if (!listed || listed.status === 404) {
  console.log(`      The account picker is not served here, which is separate and expected`)
  console.log(`      wherever seededSignIn is false — production publishes no list of who`)
  console.log(`      can be signed in as.`)
  console.log(`\n      Run 'mise run demo:off' before the platform has real users.`)
  process.exit(0)
}

if (!listed.ok) {
  console.error(`demo: the picker answered ${listed.status}`)
  process.exit(1)
}

const { accounts = [] } = (await listed.json()) as {
  accounts?: { name: string; role: string; holds: string[] }[]
}
console.log(`      ${accounts.length} accounts offered:\n`)
for (const a of accounts) {
  console.log(`        ${a.name.padEnd(24)} ${a.role.padEnd(10)} ${a.holds.join(" · ")}`)
}

/**
 * The invariant, restated here so it is visible to whoever ran this rather than
 * only to whoever reads cf:smoke. The seeded admin holds ban, set-role and
 * impersonate, and impersonation is the one power that reaches a real person.
 */
const admin = accounts.find((a) => a.role === "admin")
console.log(
  admin
    ? `\n      ⚠  THE ADMIN IS BEING OFFERED. That account can impersonate a real\n` +
        `         user. Run 'mise run demo:off' now and check src/auth.ts.`
    : `\n      The admin is not offered, and could not use the code if it were.\n` +
      `      Run 'mise run demo:off' before the platform has real users.`,
)

if (admin) process.exit(1)
