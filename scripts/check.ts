/**
 * The gate, as a list of steps rather than a shell line.
 *
 * It was two `:::` fan-outs inside a TOML string naming twenty tasks, each of
 * which existed only so the fan-out had something to name. That is why this
 * repo had ninety-odd tasks: a mise task was the only way to invoke work, so
 * every step of everything became one.
 *
 * Here the steps are data. The two phases are still two phases, and the split is
 * not arbitrary — see PHASES below.
 */

import { prepare, webWatcherRunning } from "./lib/prepare"
import { originOf, resolveTarget } from "./lib/cloudflare"
import { DEMO_SIGN_IN_CODE } from "../src/environment"
import { SEED_ENTITIES } from "../src/domain/model/entities"

import { spawn } from "child_process"
import { existsSync } from "fs"

export interface Step {
  name: string
  cmd: string[]
  env?: Record<string, string>
  /** Report elapsed ms to check-budget under this key when set. */
  budget?: string
}

interface Budget {
  /** Seconds the tier may take, running on its own, before this fails. */
  ceiling: number
  /** What it took when the budget was set, so drift is legible. */
  measured: number
  /**
   * The same pair for a tier sharing the machine inside `check`. Absent where a
   * tier never runs that way, and then the solo ceiling applies everywhere.
   */
  shared?: { ceiling: number; measured: number }
  /** What dominates the time, so a breach has somewhere to start looking. */
  note: string
}

const BUDGETS: Record<string, Budget> = {
  unit: {
    ceiling: 5,
    measured: 0.35,
    note: "pure logic, no runtime at all — anything here is a runaway loop",
  },
  worker: {
    ceiling: 25,
    measured: 16.2,
    /*
     * Shared ceiling raised 2026-09-01, after it failed one `check` run in
     * three. Same reasoning as render's below, and the same mistake underneath
     * it: the ceiling was set from a single measurement (40.8s) against a
     * distribution nobody had characterised.
     *
     * Six consecutive shared samples: 39.3, 41.0, 41.6, 41.9, >45, 42.2 — mean
     * ~42, with a tail past the ceiling. Nine percent of headroom over a mean is
     * not headroom, it is a coin flip, and a gate that fails a third of the time
     * for no reason teaches you to re-run it. That habit is the thing being
     * protected here, not the seconds.
     *
     * Re-measured 2026-09-01 after authz-equivalence.test.ts came down from
     * 11.8s to 7.9s solo: shared is now 34.8 / 36.0 / 36.6, so the ceiling has
     * grown headroom rather than being tightened. That file was asking the same
     * (relation, actor, object) question thousands of times over a 20,790-row
     * cross-product; memoising the reads — not shrinking the matrix, and not
     * touching the oracle's algorithm — removed most of it.
     *
     * Re-set 2026-09-01 once the contention was actually measured. `check` now
     * caps Playwright at three workers for phase 1 (see
     * playwright.render.config.ts), and this tier stops being starved: shared
     * samples are 22.4 / 23.1 / 24.7 / 26.5, against 36.6 before.
     *
     * So the ceiling comes DOWN from 55 to 40. It was raised to 55 when the
     * shared figure was 42 with a tail past 45, and leaving it there over a
     * measured 24 would let this tier take half again as long as it does with
     * nobody noticing — which is the exact failure this file exists for. 40 is
     * ~3x the observed spread of headroom, which is the ratio render has too.
     */
    shared: { ceiling: 40, measured: 24.7 },
    // Re-measured 2026-08-31. The old note said "isolatedStorage pays that
    // eight times", which reads as a sum — vitest runs files in parallel, so
    // the tier costs its slowest file, not the total. It had crept to 24.5s
    // solo because write.test.ts alone was 21.5s; splitting it by subject took
    // the tier to 16.2s with the same 350 tests. See tests/worker/schedule.test.ts.
    note: "the slowest single file, not the sum — files run in parallel over a ~5s workerd floor",
  },
  render: {
    ceiling: 35,
    measured: 26.7,
    /*
     * Measured 34.2 / 34.3 / 35.3 / 35.7 as of 2026-09-01, up from 31.0 — this
     * tier now runs on three workers inside `check` rather than six, and gives
     * back more than it loses: total `check` went 50.8s to 41.8s median, and its
     * run-to-run spread went from 12.1s to 1.4s.
     *
     * The ceiling stays at 45. Headroom is 9s against a spread of 1.5s — six
     * times the noise — so it is not the flaky kind of tight, and lowering it to
     * match the higher measurement would remove the room the cap just bought.
     */
    shared: { ceiling: 45, measured: 35.3 },
    /*
     * Raised 2026-09-01, deliberately, after it flaked a `check` run at 100% of
     * a 35s shared ceiling. A flaky gate is worse than a slow one: the first
     * time somebody re-runs `check` to see whether it passes on the second go,
     * the signal is gone, and that habit does not come back.
     *
     * Measured before choosing, and the measurement decided it. One trivial
     * spec takes 27.2s. All 201 take 26.7s. **The tests cost nothing
     * measurable over the harness** — the tier is `vite preview` booting and
     * WebKit launching, and 201 assertions are lost in the noise of that.
     *
     * So the two obvious fixes are both wrong here. Sharding makes it worse:
     * each shard pays the fixed cost again. Trimming cannot help: there is
     * nothing to trim, which is also why taking the no-backend per-route wait
     * from 700ms to 350ms bought headroom that did not survive one spec being
     * added — solo that trim was never visible, and under contention
     * everything stretches together.
     *
     * What remains is the ceiling, so it moves with its reason written down.
     * Shared samples across the flake: 27.9, 28.7, 30.9, 31.2, 35.3. The new
     * ceiling catches a ~45% regression, which for a fixed-cost tier means the
     * harness itself got slower — the only regression that can happen here.
     */
    note: "fixed cost: vite preview + WebKit launch. 201 tests cost no more than one",
  },
  e2e: {
    ceiling: 45,
    measured: 18.0,
    note: "real Worker, real D1, real sign-ins — the only tier where waiting is honest",
  },
}


/**
 * Report a tier's elapsed time against its ceiling, and fail if it is over.
 *
 * Was its own file under check/, where it read as an eleventh gate step beside
 * the ten real ones. It is not a step — it is how check times the steps it has —
 * so it lives with the runner that calls it.
 */
/** What this tier took when its budget was set, in seconds, or null. */
export function measuredFor(tier: string, shared: boolean): number | null {
  const budget = BUDGETS[tier]
  if (!budget) return null
  return shared && budget.shared ? budget.shared.measured : budget.measured
}

export function budgetFor(tier: string, elapsedMs: number, shared: boolean): boolean {
  const budget = BUDGETS[tier]
  if (!budget) {
    console.error(`budget: no budget for "${tier}". Known: ${Object.keys(BUDGETS).join(", ")}`)
    return false
  }
  const regime = shared && budget.shared ? budget.shared : budget
  const took = elapsedMs / 1000
  const share = Math.round((took / regime.ceiling) * 100)
  const line =
    `${tier}: ${took.toFixed(1)}s of ${regime.ceiling}s (${share}%)` +
    (shared && budget.shared ? " sharing" : "")

  /**
   * Reported, not gated.
   *
   * This used to return false and fail the run. It failed on machine load
   * rather than on the code: measured 2026-09-03, render took 145s against a
   * 45s ceiling while the tests themselves were fine and the CPU was busy with
   * a browser and a desktop app. Nothing in the diff was slower.
   *
   * A gate that goes red for reasons outside the repo teaches you to re-run it,
   * and this file's own note about the render tier says it: "a flaky gate is
   * worse than a slow one — the first time somebody re-runs `check` to see
   * whether it passes on the second go, the signal is gone, and that habit does
   * not come back." It was implementing the thing it warned about.
   *
   * The number still prints on every run, in red when it is over, which is what
   * catches a real regression. Reading it is the operator's job.
   */
  if (took > regime.ceiling) {
    console.error(
      `\n\x1b[31m${line} — over the ${regime.measured}s it took when this was set.\x1b[0m\n` +
        `  ${budget.note}.\n` +
        `  Not a failure. Check the machine is idle before assuming the code got slower.\n`,
    )
    return true
  }
  // Dim, on one line, every run. The number is the point — a budget nobody sees
  // until it fails is a budget that fails once and gets raised.
  console.log(`\x1b[2mbudget · ${line}\x1b[0m`)
  return true
}

const bun = (...args: string[]) => ["bun", ...args]
const script = (file: string, ...args: string[]) => bun(`scripts/${file}`, ...args)

/**
 * The heavy tier, alone, then everything cheap.
 *
 * Not one group of twenty-two: with the worker and render suites in the same
 * pile as the cheap work the gate took 33s, because both slowed down more than
 * the cheap work saved. Measured over five samples each, the two-phase split is
 * 40.6/41.1/41.8s against 41.6/46.6/51.6s in one — and the spread mattering more
 * than the median is the point, since twelve seconds of run-to-run variance is
 * what made the budget flaky.
 *
 * RENDER_WORKERS caps Playwright for this phase only: the two tiers want ~17
 * processes on twelve cores, and uncapped they cost each other more than the
 * parallelism buys. BUDGET_SHARED tells check-budget which ceiling applies —
 * test:worker is 12.6s alone and 26.8s beside render, which is the gate doing
 * its job rather than a regression, and one ceiling cannot describe both.
 */
/**
 * The end-to-end tier, which `check` deliberately does not run.
 *
 * It needs a dev server and takes minutes; the gate is the fast feedback loop
 * and `deploy` runs this separately before it ships. Modelled here anyway so
 * there is one place that knows how a tier is timed.
 */
/**
 * Where the e2e tier points, which until now it could not be told.
 *
 * The suite is built to run against a live system — that is the only way to
 * validate a deployed production, and both halves of the harness already knew
 * it: `playwright.config.ts` gates its `webServer` on `isLocal`, and
 * `tests/helpers/auth.ts` switches from reading the dev outbox to `TEST_OTP` on
 * the same signal. Both read `BASE_URL`, and nothing set it.
 *
 * The task that did was `test:deployed`. It did not survive the collapse from
 * ninety-one tasks to six, and four comments still cite it — `smoke.ts`,
 * `dev-vars.ts`, `src/auth.ts` and the auth helper all describe a capability the
 * repo had silently lost. The docs rule only checks that a cited `mise run` task
 * exists, and none of those are `mise run` lines, so nothing caught it.
 *
 * Resolved through the same reader `3-deploy` uses, so the gate and the deploy
 * cannot disagree about which hostname staging is — the bug `versions.ts`
 * already paid for once by waiting on production's origin after a staging
 * deploy.
 */
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
 * `versions.json` and `/api/versions` were built for exactly this question and
 * `ops -- versions` already answers it — "1 behind HEAD", in those words. This
 * only asks it at the moment it matters, and names both ways out: bring the
 * deployment to the tests, or the tests to the deployment.
 *
 * Compared on the commit rather than `_generated`, because the question is which
 * SOURCE is deployed. `deploy.ts` waits on `_generated` instead, and correctly:
 * there the question is whether the edge has finished serving the artefact just
 * published, which a commit cannot distinguish between two deploys of the same
 * source.
 */
async function sameCode(origin: string, environment: string): Promise<void> {
  const head = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"])
  const local = head.stdout.toString().trim()
  const dirty = Bun.spawnSync(["git", "status", "--porcelain"]).stdout.toString().trim()

  const deployed = await fetch(`${origin}/api/versions`, { signal: AbortSignal.timeout(20_000) })
    .then((r) => (r.ok ? (r.json() as Promise<{ current?: { git?: { commit?: string } } }>) : null))
    .then((d) => d?.current?.git?.commit ?? null)
    .catch(() => null)

  if (!deployed) {
    console.error(
      `\ncheck --e2e: ${origin} did not say which commit it is running.\n` +
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
        `check --e2e: ${environment} is on ${deployed}, matching HEAD — but the tree has\n` +
          "  uncommitted changes, so any of those not yet deployed are untested here.",
      )
    }
    return
  }

  console.error(
    `\ncheck --e2e: ${environment} is running ${deployed}, and HEAD is ${local}.\n\n` +
      "  The specs would come from here and the code from there. A pass would not mean\n" +
      "  the deployment is good, and a failure could not be fixed from this tree.\n\n" +
      "  Bring the deployment to the tests:\n" +
      `    mise run 3-deploy -- --env ${environment}\n\n` +
      "  or the tests to the deployment:\n" +
      `    git checkout ${deployed}\n\n` +
      `    mise run ops -- versions      what every environment is running\n`,
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
 *               `mise run ops -- demo on --env production`, and `demo off`
 *               must be run again before the platform has real users.
 *
 * Without this, a production run whose demo secret is off fails thirty-odd
 * tests with "sign-in for … should succeed" — a message that reads as a broken
 * deployment when the truth is a switch that is deliberately off. One request,
 * asked before the suite starts, turns that into a sentence naming the command.
 *
 * The session it opens is ended immediately. A preflight that leaks a session
 * on production to prove sessions can be cleaned up would be its own joke.
 */
async function preflight(origin: string, environment: string): Promise<void> {
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

  await post("/api/auth/email-otp/send-verification-otp", { email: who.email, type: "sign-in" })
  const res = await post("/api/auth/sign-in/email-otp", {
    email: who.email,
    otp: DEMO_SIGN_IN_CODE,
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

  if (res.ok) {
    await release(res)

    /**
     * And separately: may the ADMIN sign in here?
     *
     * Measured rather than assumed. The specs used to decide this with
     * `!IS_LOCAL`, which was a guess about policy that the policy then outgrew —
     * it skipped `devices.spec.ts` on staging for years of commits over a code
     * staging had all along. The answer is one request, and the deployment is
     * the only thing that actually knows it.
     *
     * `offersAdminSignIn` is false on every deployment by default, so this is
     * normally "no" and the admin specs skip with a reason naming the command
     * that would change it. `ops -- demo on` sets TEST_ADMIN_OTP and this turns
     * true, which is the whole point of the switch.
     */
    const admin = SEED_ENTITIES.users.find((u) => u.roleCode === "ADMIN")
    if (admin) {
      await post("/api/auth/email-otp/send-verification-otp", { email: admin.email, type: "sign-in" })
      const asAdmin = await post("/api/auth/sign-in/email-otp", {
        email: admin.email,
        otp: DEMO_SIGN_IN_CODE,
      })
      if (asAdmin.ok) {
        await release(asAdmin)
        E2E.env = { ...E2E.env, TEST_ADMIN_SIGNIN: "1" }
        console.log(`check --e2e: ${environment} allows admin sign-in — the admin specs will run`)
      } else {
        console.log(
          `check --e2e: ${environment} refuses admin sign-in, so the admin console specs skip.\n` +
            `  To include them:  mise run ops -- demo on  --env ${environment}\n` +
            `  And afterwards:   mise run ops -- demo off --env ${environment}`,
        )
      }
    }
    return
  }

  console.error(
    `\ncheck --e2e: ${environment} will not accept the suite's sign-in code.\n\n` +
      `  ${who.email} was refused with HTTP ${res.status}, and every spec signs in,\n` +
      `  so the run would fail thirty-odd times over one switch.\n\n` +
      (environment === "production"
        ? "  Production keeps the code in a secret a human sets:\n" +
          "    mise run ops -- demo on  --env production\n" +
          "    mise run ops -- demo off --env production   ← before real users\n"
        : `  ${environment} derives it, so this means the deployment is older than\n` +
          "  the policy that grants it, or is not seeded:\n" +
          `    mise run ops -- seed --env ${environment}\n` +
          `    mise run ops -- demo status --env ${environment}\n`),
  )
  process.exit(1)
}

export function e2eTarget(argv: string[]): { origin: string; environment: string } | null {
  const at = argv.indexOf("--env")
  const named = at !== -1 ? argv[at + 1] : argv.find((a) => a.startsWith("--env="))?.split("=")[1]
  if (!named) return null

  /**
   * `dev` is answered here, before `resolveTarget` refuses it.
   *
   * That refusal is right for everything it guards — dev provisions nothing on
   * the account, so `--env dev` to a deploy or a secret write is a mistake worth
   * stopping. Reading is different: dev is a real place to run the suite, and it
   * is the place it runs by default. Same shape as `deploy/versions.ts`, which
   * had to answer dev ahead of the same call for the same reason.
   *
   * Null rather than a localhost origin, deliberately: leaving `BASE_URL` unset
   * is what keeps `IS_LOCAL` true, and with it the dev outbox, the real emailed
   * code, and the `webServer` block that starts a Worker if none is up. Naming
   * dev explicitly and saying nothing are the same run.
   */
  if (named === "dev") return null

  const target = resolveTarget(argv, "explicit")
  return { origin: originOf(target), environment: target.environment }
}

const TARGET = e2eTarget(process.argv.slice(2))

export const E2E: Step = {
  name: "e2e",
  cmd: bun("x", "playwright", "test"),
  // Timed only against localhost. The ceiling describes this machine talking to
  // a Worker on loopback; the same suite over the network to Bangkok is slower
  // for reasons no budget should be reporting as a regression.
  ...(TARGET ? {} : { budget: "e2e" }),
  /**
   * Absent for a local run, so `IS_LOCAL` stays true and the tier keeps reading
   * real codes out of the dev outbox rather than relying on TEST_OTP.
   *
   * `TEST_OTP` comes from the model, not from the operator's shell. It is the
   * same `DEMO_SIGN_IN_CODE` that `dev-vars.ts` writes locally and that
   * `provision.ts` puts on the deployment as a secret — one constant, three
   * places, so a deployed run cannot be checking a code the Worker never had.
   * Requiring it in the environment instead made "run the suite against staging"
   * fail on setup with a message about a missing variable, which is a
   * prerequisite the repo already knows the answer to.
   */
  ...(TARGET && { env: { BASE_URL: TARGET.origin, TEST_OTP: DEMO_SIGN_IN_CODE } }),
}

export const PHASES: Step[][] = [
  /**
   * Phase 0 — the generator, alone, because everything after it reads what it
   * writes.
   *
   * `seed` regenerates src/db/seed.sql from the model and fails if the result
   * differs from the committed copy. It was in the cheap phase beside
   * `seed:order`, which reads that same file, and beside the worker tests, which
   * execute its bytes. One step writing a file twenty others read, concurrently.
   * It passed alone and failed inside the gate, which is the signature of a race
   * rather than a broken check.
   *
   * Cheap enough (~100ms) that serialising it costs nothing.
   */
  [{ name: "seed", cmd: script("lib/seed.ts", "--check") }],
  /**
   * Phase 1 — seconds, and deterministic. The first thing that can fail should
   * be the fastest thing that can fail.
   *
   * This ran LAST, after the two browser-and-workerd tiers. A missing semicolon
   * cost thirty-five seconds of Playwright before anything mentioned it, and a
   * flaky browser test failed the gate ahead of the typecheck that would have
   * named the actual mistake. The `--fast` mode is these exact four steps, which
   * was the standing admission that they belong first.
   *
   * Reordering is free on the green path. Phases run in sequence, so the total
   * is the sum of the phases either way — nothing gets slower when everything
   * passes. What changes is the red path, which is the one you are on when you
   * care.
   */
  [
    { name: "typecheck-worker", cmd: bun("x", "tsc", "--noEmit", "-p", "tsconfig.json", "--incremental", "false") },
    { name: "typecheck-spa", cmd: bun("x", "tsc", "--noEmit", "-p", "src/web/tsconfig.json", "--incremental", "false") },
    { name: "typecheck-tests", cmd: bun("x", "tsc", "--noEmit", "-p", "tsconfig.tests.json", "--incremental", "false") },
    { name: "unit", cmd: bun("test", "tests/unit/"), budget: "unit" },
  ],
  /**
   * Phase 2 — everything that reads the tree and answers without a runtime.
   *
   * Static and cheap: dead code, dependency direction, translations, the
   * consistency checks between the model and what is generated from it. They
   * cost a few seconds together and none of them can flake, so they belong ahead
   * of anything that starts a browser.
   */
  [
    { name: "worker-assets", cmd: bun("x", "vitest", "run", "--config", "vitest.config.ts", "tests/worker/assets.test.ts") },
    { name: "dead", cmd: bun("x", "knip", "--include", "files,unlisted", "--no-config-hints") },
    { name: "deps", cmd: bun("x", "depcruise", "src", "--config", ".dependency-cruiser.cjs") },
    { name: "i18n", cmd: bun("x", "eslint", "src/web") },
    { name: "i18n-validate", cmd: bun("x", "inlang", "validate", "--project", "./project.inlang") },
    { name: "docs", cmd: script("check/docs.ts") },
    { name: "authz", cmd: script("check/authz.ts") },
    { name: "conventions", cmd: script("check/conventions.ts") },
    { name: "seed-order", cmd: script("check/seed-order.ts") },
    { name: "seed-coverage", cmd: script("check/seed-coverage.ts") },
    { name: "domain", cmd: script("ops/domain.ts", "--check") },
    { name: "tables", cmd: script("check/tables.ts") },
    { name: "assets", cmd: script("check/assets.ts") },
    { name: "messages", cmd: script("check/messages.ts") },
    { name: "notifications", cmd: script("check/notifications.ts") },
    { name: "coverage-gui", cmd: script("ops/coverage-gui.ts") },
    { name: "actions", cmd: script("check/actions.ts") },
    { name: "bundle", cmd: script("check/bundle.ts") },
    { name: "envs", cmd: script("check/envs.ts") },
  ],
  /**
   * Phase 3 — the tiers that start something. Last, because they are the
   * slowest and the only ones that can flake.
   *
   * Together, as they always were: the budgets' `shared` figures were measured
   * with these two alongside each other and nothing else, and that is still what
   * happens here. Moving them did not change what they share.
   *
   * They are last for the reason a test pyramid has an order at all. A failure
   * here is worth reading — it means the code typechecks, the model agrees with
   * what is generated from it, and something still does not work when run. A
   * failure here *before* those is usually just noise about a mistake the cheap
   * steps would have named exactly.
   */
  [
    {
      name: "worker",
      cmd: bun("x", "vitest", "run", "--config", "vitest.config.ts", "--exclude", "tests/worker/assets.test.ts"),
      env: { BUDGET_SHARED: "1" },
      budget: "worker",
    },
    {
      name: "render",
      cmd: bun("x", "playwright", "test", "--config", "playwright.render.config.ts"),
      env: { RENDER_WORKERS: "3", BUDGET_SHARED: "1" },
      budget: "render",
    },
  ],
]

/**
 * Every step's script exists, checked before any of them runs.
 *
 * These are spawned by string, so a path that moved fails as a confusing step
 * failure minutes in — "seed failed" when the truth is "there is no such file".
 * That has now happened twice from the same cause: a rename whose sed matched
 * `scripts/build/` and missed `script("build/...")`, which carries no prefix.
 */
/**
 * Only the e2e tier still shares anything with the dev server.
 *
 * The render tier used to preview `dist/web`, which `mise run 1-dev`'s
 * `vite build --watch` rewrites on every save — two hundred tests reading a
 * directory a watcher was writing, producing timeouts in whichever spec was
 * mid-read. The first fix was a guard here refusing to run at all, and that was
 * the wrong shape: it made testing and using the dev server mutually exclusive,
 * so one person had to stop for the other.
 *
 * The render tier builds its own bundle into dist/render now (see
 * playwright.render.config.ts) and shares nothing, so the default gate has no
 * conflict left and runs happily beside a dev server.
 *
 * `--e2e` is different by design: its webServer sets `reuseExistingServer`, so
 * it deliberately tests against whatever is on :8787 — which is the dev server
 * when one is up, still serving the directory the watcher rewrites. Short
 * enough that it usually survives, and worth saying rather than leaving as a
 * coin flip.
 */
// Only when the tier is pointed at :8787. Against staging or production the dev
// bundler is irrelevant — it feeds a server the run never touches, and refusing
// there would make "test what is deployed" require stopping local development.
if (process.argv.includes("--e2e") && !TARGET && webWatcherRunning()) {
  console.error(
    "\ncheck --e2e: the dev bundler is running, and this tier reuses the server it feeds.\n" +
      "  `vite build --watch` rewrites dist/web on every save, and the Worker on :8787\n" +
      "  serves it. A rebuild mid-run shows up as a timeout in an unrelated spec.\n\n" +
      "    mise run 1-dev -- stop     then run this again\n" +
      "  The default gate needs no such thing — the render tier builds its own.\n",
  )
  process.exit(1)
}

for (const step of [...PHASES.flat(), E2E]) {
  const file = step.cmd[1]
  if (file?.startsWith("scripts/") && !existsSync(file)) {
    console.error(`check: step "${step.name}" points at ${file}, which does not exist`)
    process.exit(1)
  }
}

/**
 * How far over its measured time a failing tier has to be before the failure is
 * more likely to be the machine than the code.
 *
 * Measured on 2026-09-04, on a laptop running a browser, a desktop app and two
 * agents: `render` reported **149 failures in 1.5 minutes** and 240 passes in 25
 * seconds a minute later; `worker` failed `authz-equivalence` at 21s and passed
 * it at 14s; `moq-support` timed out spawning a probe that runs in 40ms. None
 * of those was a defect and each cost a re-run to find out.
 *
 * Three is deliberate and not tight. Ordinary variation on this tier is ~1.4s
 * against 27s. A run that took three times its own measurement was not running
 * the same experiment.
 */
const CONTENTION = 3

export function run(step: Step): Promise<{ name: string; ok: boolean }> {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(step.cmd[0]!, step.cmd.slice(1), {
      stdio: "inherit",
      env: { ...process.env, ...step.env },
    })
    child.on("exit", (code) => {
      const ok = code === 0
      const took = Date.now() - started
      // Timed, and the number is printed on every run. A tier that got six
      // times slower went unnoticed for a whole session because nothing ever
      // said how long it took.
      if (ok && step.budget) {
        const within = budgetFor(step.budget, took, step.env?.BUDGET_SHARED === "1")
        return resolve({ name: step.name, ok: within })
      }
      /**
       * Say which kind of failure this was. Do not retry it.
       *
       * A gate that goes red for reasons outside the repo teaches you to re-run
       * it, and once that habit exists the signal is gone — this file's own note
       * on the render budget says exactly that. But hiding the failure behind an
       * automatic retry is worse: it would swallow a real one.
       *
       * So the run still fails and the reader is told which experiment they
       * just ran. One sentence, and it names the command that settles it.
       */
      if (!ok && step.budget) {
        const measured = measuredFor(step.budget, step.env?.BUDGET_SHARED === "1")
        if (measured && took > measured * CONTENTION * 1000) {
          console.error(
            `\n  ${step.name} failed after ${(took / 1000).toFixed(0)}s, against ${measured}s measured.\n` +
              `  That is ${Math.round(took / 1000 / measured)}x, which is the machine rather than the code —\n` +
              `  this tier starves when something else is using the CPU.\n` +
              `  Settle it: mise run 2-check -- --only ${step.name}\n`,
          )
        }
      }
      resolve({ name: step.name, ok })
    })
  })
}

export async function gate(phases: Step[][]): Promise<string[]> {
  let failed: string[] = []
  for (const phase of phases) {
    const results = await Promise.all(phase.map(run))
    failed = failed.concat(results.filter((r) => !r.ok).map((r) => r.name))
    // A failing heavy tier stops the cheap phase: there is nothing to learn from
    // twenty green checks beside a red suite, and the gate is faster when it stops.
    if (failed.length) break
  }
  return failed
}

/**
 * `--fast` is the six-second loop: typecheck and unit tests only.
 *
 * A mode rather than a second script, because the steps are the same steps. A
 * separate file restating "how do you typecheck this project" is how the two
 * drift.
 */
const FAST = new Set(["typecheck-worker", "typecheck-spa", "typecheck-tests", "unit"])

/**
 * `--only <step>` runs one step, on its own, with nothing before it.
 *
 * A step lives in a phase, and a phase only starts when the one before it
 * passed — which is right for a gate and wrong for a person who wants to know
 * about *one* thing. An agent asked how to run `i18n` while typecheck was red
 * and there was no answer but "read check.ts and copy the command out", which
 * is a second place for that command to live and drift.
 *
 * It is not a way around the gate. `2-check` still runs everything in order;
 * this is for the loop where you are fixing one check and want its output in a
 * second rather than in a minute.
 */
function only(name: string): Step[][] {
  const all = [...PHASES.flat(), E2E]
  const step = all.find((s) => s.name === name)
  if (!step) {
    console.error(
      `check --only: no step named "${name}".\n\n  Steps:\n` +
        PHASES.map((phase, i) => `    phase ${i}  ${phase.map((s) => s.name).join(" ")}`).join("\n") +
        `\n    e2e      ${E2E.name}\n`,
    )
    process.exit(1)
  }
  // No budget: a step run alone is not sharing the machine, and a solo ceiling
  // measured inside `check` would be the wrong number to hold it to.
  return [[{ ...step, budget: undefined }]]
}

/**
 * The order, written down, so neither a person nor an agent has to guess it.
 *
 * Every step of this existed and none of it was stated anywhere: which command
 * comes after which, what each one is for, when the slow one is worth paying
 * for. Both of us reconstructed it from the scripts every time, and got it wrong
 * — the gate itself ran the two browser tiers ahead of the typecheck for months.
 */
if (import.meta.main && process.argv.includes("--help")) {
  console.log(`
mise run 2-check [-- --fast | --e2e [--env dev|staging|production]]

THE LOOP, in order. Each step is worth the one before it having passed.

  1  mise run 1-dev                     work. leave it running.
  2  mise run 2-check -- --fast         ~6s   after a change. typecheck + unit.
  3  mise run 2-check                   ~60s  before you commit. everything but e2e.
  4  mise run 2-check -- --e2e          ~50s  before you deploy. real browser,
                                              real Worker, real database.
  5  mise run 3-deploy -- --env staging       ships it. runs 3 and 4 again first.
  6  mise run 2-check -- --e2e --env staging  the suite against what is deployed.
  7  mise run 3-deploy -- --env production

  Nothing here is optional-but-nice. 3 is what 5 runs; 4 is what catches the
  things 3 cannot see. Running 3 before 2 only means waiting longer to be told
  the same thing.

WHICH SERVER --env picks. Only meaningful beside --e2e.

    dev         localhost:8787. Starts a Worker if none is up, and reads the
                real emailed code from the dev outbox. The default.
    staging     the deployed origin, resolved from the config 3-deploy uses,
    production  so the gate and the deploy cannot disagree about a hostname.

  Against a deployment it first checks two things and refuses rather than
  guessing: that the origin is serving THIS commit (otherwise the specs and the
  code under test are different software), and that it will accept the suite's
  sign-in code (otherwise every spec fails on a switch that is deliberately
  off, and says so). Sessions it opens are given back.

  Production keeps that code in a secret nobody sets by default:
    mise run ops -- demo on  --env production      before
    mise run ops -- demo off --env production      after, always

WHAT IT RUNS, in the order it runs it — cheapest and most certain first, so the
first thing that fails is the fastest thing that could have told you.
`)
  PHASES.forEach((phase, i) => {
    const why = [
      "the generator. everything after it reads what it writes",
      "seconds, and cannot flake. the first failure should be the fastest one",
      "static: dead code, dependency direction, translations, model consistency",
      "the tiers that start a browser or a workerd. slowest, and the only flaky ones",
    ][i]
    console.log(`\n  phase ${i}${phase.length > 1 ? "  (in parallel)" : ""}   ${why ?? ""}`)
    for (const s of phase) console.log(`    ${s.name}`)
  })
  console.log("\n  A phase finishes before the next starts. Within one, there is no order.")
  console.log("  A phase that fails stops the run — later phases would only repeat it.")
  console.log("  bun scripts/lib/prepare.ts --help  — what runs before all of this\n")
  process.exit(0)
}

if (import.meta.main) {
  // The gate owns its prerequisites: deps, fonts, the bundle, worker types.
  // These were four mise tasks whose only content was `depends`.
  prepare()
  const fast = process.argv.includes("--fast")
  const e2e = process.argv.includes("--e2e")
  const onlyAt = process.argv.indexOf("--only")
  const onlyName = onlyAt === -1 ? null : process.argv[onlyAt + 1]
  if (onlyAt !== -1 && !onlyName) {
    console.error("check --only: needs a step name. 'mise run 2-check -- --help' lists them.")
    process.exit(1)
  }
  // Said out loud, because "which system am I about to write to" is not a
  // question an operator should have to infer from an absent flag.
  if (e2e) console.log(`check --e2e: against ${TARGET ? `${TARGET.environment} — ${TARGET.origin}` : "dev — http://localhost:8787"}`)
  // Ask before running: a deployment that will not sign the suite in fails every
  // spec, and the reason is a policy switch rather than anything the tests did.
  if (e2e && TARGET) await preflight(TARGET.origin, TARGET.environment)
  const phases = onlyName
    ? only(onlyName)
    : e2e
      ? [[E2E]]
      : fast
        ? [PHASES.flat().filter((s) => FAST.has(s.name))]
        : PHASES
  const failed = await gate(phases)
  if (failed.length) {
    console.error(`\ncheck: ${failed.length} failed — ${failed.join(", ")}\n`)
    process.exit(1)
  }
  if (fast) {
    // A nudge, not a gate. Touching code a heavy tier covers is worth a sentence
    // before you commit; it is not worth six seconds becoming forty.
    const changed = Bun.spawnSync(["git", "diff", "--name-only", "HEAD"]).stdout.toString()
    const tier = /src\/(api|db|domain)\//.test(changed)
      ? "the worker suite"
      : /src\/web\//.test(changed)
        ? "the render suite"
        : null
    if (tier) console.log(`  you touched code ${tier} covers — run 'mise run 2-check' before you commit`)
  }
  /**
   * Say what comes next, every time, whichever step this was.
   *
   * Only the full gate said anything, and only "commit it, then deploy" — which
   * skips the e2e tier entirely. So the sequence lived in nobody's head and got
   * reconstructed from the scripts each time, wrongly.
   */
  const next = fast
    ? "  Next:\n    mise run 2-check                    everything but e2e, before you commit\n"
    : e2e
      ? TARGET
        ? `  ${TARGET.environment} is good.\n` +
          (TARGET.environment === "staging"
            ? "\n  Next:\n    mise run 3-deploy -- --env production\n"
            : "")
        : "  Next:\n    mise run 3-deploy -- --env staging   ships it (runs this again first)\n"
      : "  Next:\n    mise run 2-check -- --e2e           real browser, real Worker, real database\n" +
        "    mise run 3-deploy -- --env staging   ships it (runs both of the above first)\n"
  if (onlyName) {
    console.log(`\ncheck: green (${onlyName} only — the gate is 'mise run 2-check')\n`)
    process.exit(0)
  }
  console.log(`\ncheck: green${e2e ? " (e2e)" : fast ? " (fast)" : ""}\n\n${next}`)
}
