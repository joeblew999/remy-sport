/**
 * The e2e tier: a real browser against a real Worker — `bun run test:e2e`.
 *
 *   bun run test:e2e                       localhost:8787, starting a Worker if none is up
 *   bun run test:e2e -- --env staging      the deployed origin, resolved the way deploy resolves it
 *   bun run test:e2e -- --env production
 *   bun run test:e2e -- -g "sign-in"       anything else goes to Playwright
 *
 * This is the one tier that cannot be a bare `playwright test` line, because a
 * remote run has two questions to ask before it starts, and both are cheaper
 * as a sentence than as thirty red specs.
 */

import { spawnSync } from "node:child_process"
import { originOf, resolveTarget } from "./lib/cloudflare"
import { DEMO_SIGN_IN_CODE } from "../src/environment"
import { SEED_ENTITIES } from "../src/domain/model/entities"

/**
 * Refuse to test a deployment that is not running the code these tests describe.
 *
 * A remote run splits the subject in two: the specs come from the working tree,
 * the code under test comes from whatever was last deployed. Nothing made those
 * agree, and they did not — measured 2026-09-03, staging and production were
 * both on f936324 while HEAD was 1dd7112. Every assertion in that run was
 * written against code the origin was not serving.
 *
 * The failure mode is worse than a red suite, because it is usually green. A
 * spec that passes tells you the deployment is fine when it has not seen your
 * change at all; one that fails sends you to fix a test against code that is not
 * there, and the fix cannot work because the premise is wrong.
 *
 * Compared on the commit rather than `_generated`, because the question is which
 * SOURCE is deployed. `deploy.ts` waits on `_generated` instead, and correctly:
 * there the question is whether the edge has finished serving the artefact just
 * published, which a commit cannot distinguish between two deploys of the same
 * source.
 */
async function sameCode(origin: string, environment: string): Promise<void> {
  const local = spawnSync("git", ["rev-parse", "--short", "HEAD"]).stdout.toString().trim()
  const dirty = spawnSync("git", ["status", "--porcelain"]).stdout.toString().trim()

  const deployed = await fetch(`${origin}/api/versions`, { signal: AbortSignal.timeout(20_000) })
    .then((r) => (r.ok ? (r.json() as Promise<{ current?: { git?: { commit?: string } } }>) : null))
    .then((d) => d?.current?.git?.commit ?? null)
    .catch(() => null)

  if (!deployed) {
    console.error(
      `\ne2e: ${origin} did not say which commit it is running.\n` +
        "  /api/versions is how a deployment identifies itself, and without it there is\n" +
        "  no way to know whether these specs describe the code being tested.\n",
    )
    process.exit(1)
  }

  if (deployed === local) {
    // Uncommitted work is the same split in miniature: the specs about to run
    // include changes no deployment can be serving. Worth saying, not worth
    // refusing over — editing a spec is the ordinary way to work on one.
    if (dirty) {
      console.log(
        `e2e: ${environment} is on ${deployed}, matching HEAD — but the tree has\n` +
          "  uncommitted changes, so any of those not yet deployed are untested here.",
      )
    }
    return
  }

  console.error(
    `\ne2e: ${environment} is running ${deployed}, and HEAD is ${local}.\n\n` +
      "  The specs would come from here and the code from there. A pass would not mean\n" +
      "  the deployment is good, and a failure could not be fixed from this tree.\n\n" +
      "  Bring the deployment to the tests:\n" +
      `    bun run deploy -- --env ${environment}\n\n` +
      "  or the tests to the deployment:\n" +
      `    git checkout ${deployed}\n\n` +
      `    bun run ops versions      what every environment is running\n`,
  )
  process.exit(1)
}

/**
 * Ask the deployment whether it will let the suite in, before running it.
 *
 * Each environment answers differently, and the policy table is the reason
 * rather than an accident — see `POLICY` in src/environment.ts:
 *
 *   dev         signInCode "derived", `offersAdminSignIn: true`. Everything,
 *               including the admin, whose real code the dev outbox carries.
 *   staging     signInCode "derived". Every seeded actor except the admin:
 *               "a deployment never publishes a way in as the account that can
 *               impersonate".
 *   production  signInCode "secret". Nothing at all until somebody runs
 *               `bun run ops demo on --env production`, and `demo off`
 *               must be run again before the platform has real users.
 *
 * Without this, a production run whose demo secret is off fails thirty-odd
 * tests with "sign-in for … should succeed" — a message that reads as a broken
 * deployment when the truth is a switch that is deliberately off. One request,
 * asked before the suite starts, turns that into a sentence naming the command.
 *
 * The session it opens is ended immediately. A preflight that leaks a session
 * on production to prove sessions can be cleaned up would be its own joke.
 *
 * Returns whether the ADMIN may sign in too — measured, not assumed. The specs
 * used to decide this with `!IS_LOCAL`, a guess about policy that the policy
 * outgrew: it skipped `devices.spec.ts` on staging over a code staging had all
 * along. `offersAdminSignIn` is false on every deployment by default, so this
 * is normally "no" and the admin specs skip with a reason naming the command
 * that would change it.
 */
async function preflight(origin: string, environment: string): Promise<boolean> {
  await sameCode(origin, environment)
  // A seeded actor the policy allows on every environment — never the admin,
  // which staging and production refuse on purpose.
  const who = SEED_ENTITIES.users.find(
    (u) => u.roleCode !== "ADMIN" && u.statusCode !== "SUSPENDED" && u.statusCode !== "DEACTIVATED",
  )
  if (!who) throw new Error("no seeded non-admin actor to preflight with")

  const post = (path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })

  // Put it back. The whole premise of running against a live system is that the
  // run leaves nothing behind.
  const release = async (r: Response) => {
    const token = ((await r.json().catch(() => null)) as { token?: string } | null)?.token
    if (!token) return
    await fetch(`${origin}/api/auth/sign-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, Authorization: `Bearer ${token}` },
      body: "{}",
    }).catch(() => {})
  }

  const signIn = async (email: string) => {
    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
    return post("/api/auth/sign-in/email-otp", { email, otp: DEMO_SIGN_IN_CODE })
  }

  const res = await signIn(who.email)
  if (!res.ok) {
    console.error(
      `\ne2e: ${environment} will not accept the suite's sign-in code.\n\n` +
        `  ${who.email} was refused with HTTP ${res.status}, and every spec signs in,\n` +
        `  so the run would fail thirty-odd times over one switch.\n\n` +
        (environment === "production"
          ? "  Production keeps the code in a secret a human sets:\n" +
            "    bun run ops demo on  --env production\n" +
            "    bun run ops demo off --env production   ← before real users\n"
          : `  ${environment} derives it, so this means the deployment is older than\n` +
            "  the policy that grants it, or is not seeded:\n" +
            `    bun run ops seed --env ${environment}\n` +
            `    bun run ops demo status --env ${environment}\n`),
    )
    process.exit(1)
  }
  await release(res)

  const admin = SEED_ENTITIES.users.find((u) => u.roleCode === "ADMIN")
  if (!admin) return false
  const asAdmin = await signIn(admin.email)
  if (asAdmin.ok) {
    await release(asAdmin)
    console.log(`e2e: ${environment} allows admin sign-in — the admin specs will run`)
    return true
  }
  console.log(
    `e2e: ${environment} refuses admin sign-in, so the admin console specs skip.\n` +
      `  To include them:  bun run ops demo on  --env ${environment}\n` +
      `  And afterwards:   bun run ops demo off --env ${environment}`,
  )
  return false
}

/**
 * Where the tier points. Null is localhost — and `--env dev` is null too,
 * deliberately: leaving `BASE_URL` unset is what keeps the suite reading real
 * codes out of the dev outbox and starting a Worker if none is up. Naming dev
 * and saying nothing are the same run.
 *
 * Resolved through the same reader deploy uses, so the two cannot disagree
 * about which hostname staging is.
 */
function target(argv: string[]): { origin: string; environment: string } | null {
  const at = argv.indexOf("--env")
  const named = at !== -1 ? argv[at + 1] : argv.find((a) => a.startsWith("--env="))?.split("=")[1]
  if (!named || named === "dev") return null
  const t = resolveTarget(argv, "explicit")
  return { origin: originOf(t), environment: t.environment }
}

const argv = process.argv.slice(2)
const TARGET = target(argv)

console.log(`e2e: against ${TARGET ? `${TARGET.environment} — ${TARGET.origin}` : "dev — http://localhost:8787"}`)

const env: NodeJS.ProcessEnv = { ...process.env }
if (TARGET) {
  // `TEST_OTP` comes from the model, not from the operator's shell: the same
  // `DEMO_SIGN_IN_CODE` that `dev-vars.ts` writes locally and `provision.ts`
  // puts on the deployment as a secret. Requiring it in the environment made
  // "run the suite against staging" fail on setup over a variable the repo
  // already knew.
  env.BASE_URL = TARGET.origin
  env.TEST_OTP = DEMO_SIGN_IN_CODE
  if (await preflight(TARGET.origin, TARGET.environment)) env.TEST_ADMIN_SIGNIN = "1"
}

// Everything that is not ours goes to Playwright unchanged: -g, --headed, a file.
const rest = argv.filter((a, i) => !(a === "--env" || a.startsWith("--env=") || (i > 0 && argv[i - 1] === "--env")))
// The projects that are the tier: e2e, and authz after it. Their setup
// projects (seed, auth) run because they are depended on; the screenshot walk
// does not, because nothing here names it.
const run = spawnSync("bun", ["x", "playwright", "test", "--project", "e2e", "--project", "authz", ...rest], {
  stdio: "inherit",
  env,
})
process.exit(run.status ?? 1)
