/**
 * The e2e tier: a real browser against a real Worker — `bun run test:e2e`.
 *
 *   bun run test:e2e                       localhost:8788, with fresh isolated storage
 *   bun run test:e2e -- --env staging      the deployed origin, resolved the way deploy resolves it
 *   bun run test:e2e -- --env production
 *   bun run test:e2e -- -g "sign-in"       anything else goes to Playwright
 *
 * This is the one tier that cannot be a bare `playwright test` line, because a
 * remote run has two questions to ask before it starts, and both are cheaper
 * as a sentence than as thirty red specs.
 */

import { rmSync } from "node:fs"
import { LOCAL_BROWSER_ORIGIN, localBrowserState } from "./lib/local-browser.ts"
import { spawn, spawnSync } from "node:child_process"
import { Refused, originOf, resolveTarget } from "./lib/cloudflare.ts"
import { endRunSessions } from "../tests/helpers/session-cleanup.ts"
import { affectsDeployment } from "./lib/deployed-source.ts"
import { randomUUID } from "node:crypto"
import { withStagingAccess } from "./lib/staging-test-access.ts"
import { assertPinnedBun } from "./lib/bun-pin.ts"
import { DEMO_SIGN_IN_CODE } from "../src/environment.ts"
import { SEED_ENTITIES } from "../src/domain/model/entities.ts"

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

  // Compare deployed inputs with the WORKING tree, including untracked files.
  // Test and runner fixes do not require republishing an unchanged application.
  if (!/^[a-f0-9]{7,40}$/.test(deployed)) throw new Refused("Invalid deployed commit identity")
  const difference = spawnSync("git", ["diff", "--name-only", deployed, "--"])
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"])
  const changed = (difference.stdout.toString() + "\n" + untracked.stdout.toString()).split("\n").filter(Boolean)
  const blocking = changed.filter(affectsDeployment)
  if (difference.status === 0 && untracked.status === 0 && blocking.length === 0) {
    console.log(`e2e: application inputs match deployed ${deployed}; testing with this checkout's suite`)
    return
  }

  /**
   * Name the files, and do not offer a remedy that cannot work.
   *
   * This used to print the two commits and stop. On 2026-09-10 it refused a
   * verification with "staging is running e5ee560, and HEAD is e5ee560" — the
   * same hash twice, because the difference was three uncommitted files — and
   * then advised `git checkout e5ee560`, which was already checked out. The
   * refusal was correct and the explanation sent the reader nowhere.
   *
   * A guard that cannot say what tripped it is a guard people learn to re-run
   * rather than read.
   */
  if (difference.status !== 0 || untracked.status !== 0) {
    console.error(
      `\ne2e: could not compare this tree against deployed ${deployed}.\n\n` +
        "  git could not answer, so whether these specs describe the deployed code is\n" +
        "  unknown — which is refused the same way a known mismatch is.\n\n" +
        `  ${(difference.stderr.toString() + untracked.stderr.toString()).trim() || "no error text"}\n`,
    )
    process.exit(1)
  }

  const shown = blocking.slice(0, 20)
  console.error(
    (local === deployed
      ? `\ne2e: ${environment} is running ${deployed}, which is HEAD — but this tree has\n` +
        `  ${blocking.length} uncommitted change(s) that would reach the deployment.\n`
      : `\ne2e: ${environment} is running ${deployed}, and HEAD is ${local}, differing in\n` +
        `  ${blocking.length} file(s) that reach the deployment.\n`) +
      "\n" +
      shown.map((f) => `    ${f}`).join("\n") +
      (blocking.length > shown.length ? `\n    … and ${blocking.length - shown.length} more` : "") +
      "\n\n" +
      "  The specs would come from here and the code from there. A pass would not mean\n" +
      "  the deployment is good, and a failure could not be fixed from this tree.\n\n" +
      (local === deployed
        ? "  Commit and publish them, or set them aside:\n" +
          `    bun run deploy -- --env ${environment}\n` +
          "    git stash -u\n\n"
        : "  Bring the deployment to the tests:\n" +
          `    bun run deploy -- --env ${environment}\n\n` +
          "  or the tests to the deployment:\n" +
          `    git checkout ${deployed}\n\n`) +
      "  If a file above only describes the test rather than the product, exempt it in\n" +
      "  scripts/lib/deployed-source.ts and say why.\n\n" +
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
async function preflight(origin: string, environment: string, adminConfirmed = false): Promise<boolean> {
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
    const released = await fetch(`${origin}/api/auth/sign-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, Cookie: (r.headers.getSetCookie?.() ?? []).map(cookie => cookie.split(";")[0]).join("; ") },
      body: "{}",
      signal: AbortSignal.timeout(20_000),
    })
    if (!released.ok) throw new Refused("Preflight session cleanup failed")
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

  // Staging access was already measured by withStagingAccess. Do not issue
  // and consume another OTP for the same shared account immediately. Auth setup
  // still has to obtain a real admin session before any browser tests can run.
  if (adminConfirmed) return true

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
if (argv.includes("--help") || argv.includes("-h")) {
  console.log("bun run test:e2e [-- --env staging] [Playwright options]\n--media runs the real relay publisher/watcher proof (requires configured relay credentials and Chrome).\nLocal runs start an isolated Worker on localhost:8788 and remove its storage afterwards.\nRecovery: --cleanup-run <run UUID> [--env staging] ends only recorded sessions from that run.\nStaging runs include automatic admin access and checked restoration. --retries 0 disables retries.")
  process.exit(0)
}
if (argv.includes("--media") && argv.includes("--shots")) throw new Refused("Choose --media or --shots, not both")
const TARGET = target(argv)
const cleanupAt = argv.indexOf("--cleanup-run")
if (cleanupAt !== -1) {
  const runId = argv[cleanupAt + 1] ?? ""
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(runId)) throw new Refused("--cleanup-run requires a run UUID")
  if (TARGET) await endRunSessions(TARGET.origin, `.playwright/runs/${runId}/sessions`)
  else {
    rmSync(localBrowserState(`.playwright/runs/${runId}`), { recursive: true, force: true })
    rmSync(`.playwright/runs/${runId}/sessions`, { recursive: true, force: true })
  }
  console.log(`Verified session cleanup for run ${runId}`)
  process.exit(0)
}
const env: NodeJS.ProcessEnv = { ...process.env, E2E_STATE_DIR: `.playwright/runs/${randomUUID()}` }
delete env.BASE_URL
delete env.TEST_OTP
delete env.TEST_ADMIN_SIGNIN
const rest = argv.filter((a, i) => a !== "--shots" && a !== "--media" && !(a === "--env" || a.startsWith("--env=") || (i > 0 && argv[i - 1] === "--env")))

async function run(adminConfirmed = false): Promise<void> {
  if (TARGET) {
    env.BASE_URL = TARGET.origin
    env.TEST_OTP = DEMO_SIGN_IN_CODE
    const admin = await preflight(TARGET.origin, TARGET.environment, adminConfirmed)
    env.TEST_ADMIN_SIGNIN = admin ? "1" : "0"
    if (TARGET.environment === "staging" && !admin) throw new Refused("Staging admin preflight failed; refusing to skip admin tests")
  }
  const child = spawn("bun", ["x", "playwright", "test", ...(argv.includes("--shots") ? ["--project=shots"] : argv.includes("--media") ? ["--project=media"] : ["--project=e2e", "--project=admin", "--project=authz"]), ...rest, ...(TARGET?.environment === "staging" ? ["--workers", "1"] : [])], { stdio: "inherit", env })
  let interrupted = false
  const cancel = () => { interrupted = true; child.kill("SIGINT") }
  process.on("SIGINT", cancel)
  process.on("SIGTERM", cancel)
  try {
    const code = await new Promise<number>((resolve, reject) => {
      child.on("error", reject)
      child.on("exit", code => resolve(code ?? 1))
    })
    if (code !== 0 || interrupted) throw new Refused(`Browser tests ${interrupted ? "interrupted" : "failed"} (exit ${code})`)
  } finally {
    process.off("SIGINT", cancel)
    process.off("SIGTERM", cancel)
    if (TARGET) await endRunSessions(TARGET.origin, `${env.E2E_STATE_DIR}/sessions`)
    else {
      // Playwright has stopped its Worker. Deleting that run's entire storage
      // also revokes sessions when setup or teardown failed.
      rmSync(localBrowserState(env.E2E_STATE_DIR), { recursive: true, force: true })
      rmSync(`${env.E2E_STATE_DIR}/sessions`, { recursive: true, force: true })
      console.log("e2e: isolated local storage removed")
    }
  }
}

try {
  // Before anything: the deploy's verification once hung for hours on a Bun
  // that was not the pinned one — scripts/lib/bun-pin.ts.
  if (assertPinnedBun() !== 0) throw new Refused("Not the pinned Bun")
  console.log(`e2e: session records ${env.E2E_STATE_DIR}`)
  console.log(`e2e: against ${TARGET ? `${TARGET.environment} — ${TARGET.origin}` : `isolated dev — ${LOCAL_BROWSER_ORIGIN}`}`)
  if (TARGET) await sameCode(TARGET.origin, TARGET.environment)
  if (TARGET?.environment === "staging") {
    await withStagingAccess(resolveTarget(argv, "explicit"), () => run(true))
    await sameCode(TARGET.origin, TARGET.environment)
  } else await run()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
