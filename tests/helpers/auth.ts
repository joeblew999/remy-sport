import { LOCAL_BROWSER_ORIGIN } from "../../scripts/lib/local-browser"
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"
import { saveSession, endSession } from "./session-cleanup"
import { SEED_ENTITIES } from "../../src/domain/model/entities"
import { E2E_EMAIL_DOMAIN, isReservedTestEmail } from "../../src/environment"
import { apiFor } from "./api.ts"

/**
 * Signing in, now that there are no passwords (ADR 012).
 *
 * Every spec routes through here so the mechanism lives in one place. It was
 * eight copies of a two-line password POST before, which is exactly why
 * removing passwords touched every file.
 *
 * Two ways to obtain the code, because the suite runs in two environments:
 *
 *   - **Local** — read the real code out of `/api/dev/outbox`. Higher fidelity:
 *     the code is genuinely generated, mailed and parsed back out, so the whole
 *     path is under test rather than stubbed.
 *   - **Deployed** (`BASE_URL` set) — use `TEST_OTP`. There is no outbox in
 *     production and no way to read a real inbox, so a fixed code for the
 *     seeded @remy.dev accounts is what keeps auth coverage on `test:deployed`.
 *     The Worker only honours it when its own `TEST_OTP` secret is set, and
 *     only for that domain.
 */

export const BASE = process.env.BASE_URL || LOCAL_BROWSER_ORIGIN
export const IS_LOCAL = !process.env.BASE_URL

/**
 * Whether the seeded ADMIN can sign in wherever this run points.
 *
 * Measured by `check --e2e`, which asks the deployment before starting anything
 * and sets `TEST_ADMIN_SIGNIN` from the answer. Locally it is always true — dev
 * has `offersAdminSignIn: true`.
 *
 * The specs that need it used to key off `!IS_LOCAL`, which conflated three
 * different questions: is there a fixed code, does it cover the admin, and is
 * this a deployment. Staging answers yes, no, yes — so `devices.spec.ts` and
 * `spa-login.spec.ts`, which need only the first, sat skipped on a deployment
 * that could have run them the whole time. Fifteen tests reading green while
 * doing nothing.
 *
 * A deployment says yes only after `ops -- demo on`, which sets the secret that
 * `adminSignInAllowed()` reads, and `demo off` removes. Default is no, which is
 * what "a deployment never publishes a way in as the account that can
 * impersonate" is protecting.
 */
export const ADMIN_SIGN_IN = IS_LOCAL || process.env.TEST_ADMIN_SIGNIN === "1"

/**
 * An account belonging to one test and nobody else.
 *
 * The fix the rest of this file kept working around. Specs shared the PO's
 * seeded people, and so does anyone on the dev tunnel — two writers on one
 * account is why sessions appeared under a running assertion, why two specs ate
 * each other's OTP, and why every count assertion was a guess.
 *
 * A test that mints its own account owns everything on it, so counts are
 * legitimate and `revoke-other-sessions` is scoped by definition.
 *
 * Sign-in creates the account on first use. The address space is reserved and
 * unroutable; see `isReservedTestEmail`.
 *
 * Nothing to clean up on purpose: the account holds one session, which the
 * per-test revoke ends, and an empty row in a fixture database is not worth a
 * deletion endpoint that exists only for tests.
 */
let minted = 0
export function freshActor(): string {
  // Run id keeps two concurrent runs — a person's and CI's, or two workers —
  // from ever choosing the same address.
  const run = process.env.PW_TEST_RUN_ID ?? `${process.pid}`
  return `e2e-${run}-${++minted}-${Date.now().toString(36)}@${E2E_EMAIL_DOMAIN}`
}

/**
 * Every session a test creates, so the test can put the system back.
 *
 * The suite is designed to inject into a live system — that is the only way to
 * validate a deployed production, and it is why there is no scratch database to
 * hide in. Injection is only sound if it is reversible: seeding idempotent, side
 * effects undone. Sign-in was the one side effect nothing undid. Eleven
 * sign-ins per run, one sign-out, and sessions accumulated forever — 57 to 77 in
 * two runs on this machine.
 *
 * That is not cosmetic. `devices.spec.ts` asserts on how many sessions a person
 * has, which is the correct thing for it to assert; against a table that only
 * ever grows, and that concurrent specs write to, the count moves underneath it.
 * The two failures it produced were real reports of a real leak.
 *
 * Revoked by token, one at a time. Never `revoke-other-sessions`: run against
 * production that signs real people out of their real devices, which is a far
 * worse thing than a slow test.
 */
const createdSessions: string[] = []

async function remember(ctx: APIRequestContext, email: string): Promise<string | null> {
  createdSessions.push(await saveSession(ctx))
  const response = await ctx.get("/api/auth/get-session", { headers: { Origin: BASE } })
  expect(response.ok(), `read session for ${email}`).toBeTruthy()
  const body = await response.json() as { session?: { token?: string } } | null
  return body?.session?.token ?? null
}

export async function releaseSessions(): Promise<void> {
  const errors: unknown[] = []
  for (const path of createdSessions.splice(0)) {
    try { await endSession(path, BASE) } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, "Per-test session cleanup failed")
}

// Registered only where a runner exists. `test.afterEach` throws when called
// outside Playwright, which made this whole module un-importable from a plain
// script — and the sign-in above is exactly what a script that wants to look
// at the app as a seeded person needs. No runner, no hook; the API stays.
try {
  test.afterEach(async () => {
    await releaseSessions()
  })
} catch {
  // Not under `playwright test`: sessions a script keeps are its own to end.
}

/** The six seeded actors. No passwords — an address is the whole credential. */
/**
 * The seeded actors, from the Product Owner's fixtures.
 *
 * These were six invented addresses. Resolving them from the fixtures means a
 * spec cannot sign in as an account the seed route never created — which is
 * what these constants silently became every time the seed data moved.
 *
 * `first` rather than a hardcoded pick: the fixtures list three coaches at
 * three schools, and the tests want a stable one, not a particular one.
 */
const first = (role: string) => {
  const user = SEED_ENTITIES.users.find((u) => u.roleCode === role)
  if (!user) throw new Error(`no seeded user with role ${role}`)
  return user.email
}

/**
 * A role's Nth seeded actor, so two specs need not share one.
 *
 * Better Auth refuses a sign-in whose OTP was superseded by another request for
 * the same address, so two specs signing in as *the* organizer make one fail
 * with INVALID_OTP — and which one loses moves between runs.
 *
 * The fixtures already seed three of each role; the specs were all taking the
 * first. `actor("ORGANIZER", 1)` takes the second.
 *
 * Ordering is the fixtures' own, so an index is stable across runs. Past the end
 * it throws rather than wrapping onto an actor another spec is using.
 */
/**
 * The display name of a specific actor.
 *
 * Distinct from the private `nameOf(role)` below, which answers "the name of
 * *a* coach". A spec using its own indexed actor needs the name of *that*
 * person — asserting the shared one's name would pass for the wrong reason.
 */
export function nameOfActor(email: string): string {
  const user = SEED_ENTITIES.users.find((u) => u.email === email)
  if (!user) throw new Error(`no seeded user with email ${email}`)
  return user.names.en
}

export function actor(role: string, index = 0): string {
  const all = SEED_ENTITIES.users.filter((u) => u.roleCode === role)
  const user = all[index]
  if (!user) {
    throw new Error(
      `no seeded ${role} at index ${index} — the fixtures have ${all.length}. ` +
        `Add one upstream in remy-sport-biz rather than sharing an actor with another spec.`,
    )
  }
  return user.email
}

export const ADMIN = first("ADMIN")
export const ORGANIZER = first("ORGANIZER")
export const COACH = first("COACH")
export const PLAYER = first("PLAYER")
export const SPECTATOR = first("SPECTATOR")
export const REFEREE = first("REFEREE")

/** The six seeded actors, by role, for specs that want them keyed. */
export const ACTORS = { ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE } as const

/**
 * What each seeded actor is called, in English.
 *
 * Specs used to assert "Admin" and "Coach" — the names of accounts this repo
 * invented. They are the PO's people now, so the expected name comes from the
 * same fixtures the seed route reads.
 */
const nameOf = (role: string) => {
  const user = SEED_ENTITIES.users.find((u) => u.roleCode === role)
  if (!user) throw new Error(`no seeded user with role ${role}`)
  return user.names.en
}

export const ACTOR_NAMES = {
  ADMIN: nameOf("ADMIN"),
  ORGANIZER: nameOf("ORGANIZER"),
  COACH: nameOf("COACH"),
  PLAYER: nameOf("PLAYER"),
  SPECTATOR: nameOf("SPECTATOR"),
  REFEREE: nameOf("REFEREE"),
} as const

/**
 * Every seeded address, so auth.setup.ts can save a session for each.
 *
 * Not just the six above. Specs that need an actor nobody else is using take an
 * indexed one — `actor("ORGANIZER", 2)` — and those need a saved session just as
 * much, or they are back to signing in for themselves and racing whoever else
 * wants that address.
 */
export const EVERY_SEEDED_ACTOR = SEED_ENTITIES.users
  // Everyone who can actually hold a session. A SUSPENDED or DEACTIVATED
  // account is refused one at `session.create.before`, so trying to save state
  // for it fails the whole setup — which is the enforcement working, in the one
  // place that reads as a broken suite. The fixtures gained both on 2026-08-29.
  .filter((u) => u.statusCode !== "SUSPENDED" && u.statusCode !== "DEACTIVATED")
  /**
   * The admin, but only against a deployment — where the Worker refuses it.
   *
   * `src/auth.ts` scopes the fixed code to seeded addresses that are *not* the
   * admin, because that one account can reach everything — so a deployed run
   * cannot hold an admin session, and asking for one failed the setup project
   * outright with "sign-in for admin should succeed", which reads as a broken
   * deployment rather than a rule working as designed.
   *
   * Keyed on `ADMIN_SIGN_IN`, the same signal the specs use, so setup and specs
   * cannot disagree about whether there is a session to adopt. Two guesses at
   * one fact is how a spec adopts a state file setup never wrote.
   *
   * Idempotent: the list is derived from the answer, so turning the switch
   * converges rather than accumulating.
   */
  .filter((u) => ADMIN_SIGN_IN || u.roleCode !== "ADMIN")
  .map((u) => u.email)

/**
 * Where auth.setup.ts parks each actor's cookies, and how a spec asks for one.
 *
 * `.playwright/` is already the project-scoped, gitignored home for Playwright
 * state (AGENTS.md), so the sessions land beside the browsers rather than in a
 * new top-level directory.
 */
export const AUTH_STATE_DIR = process.env.E2E_STATE_DIR ?? ".playwright/auth"
export const stateFor = (email: string) =>
  `${AUTH_STATE_DIR}/${email.replace(/[@.]/g, "_")}.json`

const CODE_RE = /Your code is (\d{6})/

/**
 * The seeded actors use a fixed code; everyone else gets the real emailed one.
 *
 * Not laziness. The suite is `fullyParallel` and the six actors are shared, so
 * two tests asking for a code for coach@remy.dev race: Better Auth rotates the
 * code on each request, so whichever test reads the outbox second invalidates
 * the first. A fixed code for exactly those accounts removes the race. The
 * genuine path — generate, mail, read back, redeem — is still covered by
 * otp.spec.ts using addresses nothing else touches.
 */
/**
 * Matches src/auth.ts: the fixed code applies to the addresses the fixtures
 * seed, not to a domain. The PO's people are at their own schools and
 * federations, so there is no single demo domain left to match on.
 */
const SEEDED_EMAILS: ReadonlySet<string> = new Set<string>(
  SEED_ENTITIES.users.map((u) => u.email),
)
const LOCAL_TEST_OTP = "424242"

function fixedCodeFor(email: string): string | null {
  // Reserved addresses too — the Worker's own predicate is the same union
  // (src/auth.ts), and the two halves have to agree or a fresh account signs in
  // locally and fails on a deployment.
  if (!SEEDED_EMAILS.has(email) && !isReservedTestEmail(email)) return null
  return IS_LOCAL ? LOCAL_TEST_OTP : requireTestOtp()
}

async function codeFromOutbox(request: APIRequestContext, email: string): Promise<string> {
  // Observation, not the subject — so the typed client. The outbox's shape is
  // the procedure's now, and a renamed field stops the build rather than
  // every e2e sign-in at once.
  const { messages } = await apiFor(request).dev.outbox.list({ to: email })
  const match = messages.map((m: { body: string }) => m.body.match(CODE_RE)).find(Boolean)
  expect(match, `no sign-in code was emailed to ${email}`).toBeTruthy()
  return match![1]!
}

/**
 * Request a code and use it. Returns once the session cookie is on `request`.
 *
 * Note the Origin header on the second call: the first request has no cookie,
 * but requesting a code sets nothing while *verifying* it arrives after any
 * earlier session cookie — and Better Auth's origin check is gated on a request
 * carrying a cookie (ADR 006 §9a). Browsers send Origin automatically;
 * APIRequestContext does not.
 */
export async function signIn(
  request: APIRequestContext,
  email: string,
  /**
   * `keep` opts out of the per-test revoke.
   *
   * For `auth.setup.ts` alone, whose session is the whole point: it is saved to
   * `storageState` and adopted by every spec that starts already signed in.
   * Revoking it after the setup "test" would sign out the suite before it
   * began — the cleanup would have been strictly worse than the leak.
   *
   * Those sessions are not exempt from being cleaned up, only from being cleaned
   * up *here*. `auth.teardown.ts` ends them after the whole run.
   */
  opts: { keep?: boolean } = {},
): Promise<string | null> {
  const sent = await request.post("/api/auth/email-otp/send-verification-otp", {
    data: { email, type: "sign-in" },
    headers: { Origin: BASE },
  })
  expect(sent.ok(), `requesting a code for ${email} should succeed`).toBeTruthy()

  const otp = fixedCodeFor(email) ?? (await codeFromOutbox(request, email))
  const res = await request.post("/api/auth/sign-in/email-otp", {
    data: { email, otp },
    headers: { Origin: BASE },
  })
  expect(res.ok(), `sign-in for ${email} should succeed`).toBeTruthy()
  // The token of the session just created, so a caller can name it later — see
  // devices.spec.ts. `keep` still skips the ledger, but the token is honest
  // either way.
  if (opts.keep) { await saveSession(request); return null }
  return await remember(request, email)
}

/**
 * Navigate so the SPA definitely remounts.
 *
 * One GUI at `/` means `goto("/#/x")` from `/` is a *same-document* hash change:
 * React does not remount, `useSession` does not refetch, and a page renders
 * against whoever was signed in before. That never bit while a server-rendered
 * harness sat on `/login` and the SPA on `/app`, because every identity switch
 * crossed a document boundary.
 *
 * Any spec that changes identity — signs in, signs out, clears cookies — must
 * use this rather than `page.goto`.
 */
export async function gotoFresh(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.reload()
}

/**
 * Become a seeded actor without signing in.
 *
 * The reason to prefer this over `signInViaPage` everywhere identity is
 * incidental: a sign-in is not concurrency-safe per address. `TEST_OTP` stops
 * the *code* rotating, but Better Auth still writes and consumes a verification
 * row per request, so two tests signing in as the same person invalidate each
 * other and the loser fails with INVALID_OTP — which surfaces as a locator
 * timeout, not an auth error. With `fullyParallel` that is any two tests in the
 * same file naming the same actor.
 *
 * The cookies come from auth.setup.ts, which signs in once per seeded address
 * before any spec runs. Adopting them costs no request at all.
 *
 * Use `signInViaPage`/`signInThroughLoginForm` only where signing in is the
 * thing under test.
 */
export async function adoptSession(page: Page, email: string): Promise<void> {
  const path = stateFor(email)
  if (!existsSync(path)) {
    throw new Error(
      `no saved session for ${email} at ${path} — auth.setup.ts saves one per ` +
        `seeded address; is this an address the fixtures do not define?`,
    )
  }
  const { cookies } = JSON.parse(readFileSync(path, "utf8")) as {
    cookies: Parameters<BrowserContext["addCookies"]>[0]
  }
  // Clear first: a test that adopts a second identity would otherwise keep the
  // first one's cookie alongside it, and Better Auth resolves whichever it sees.
  await page.context().clearCookies()
  await page.context().addCookies(cookies)
  // Same reason signInViaPage reloads — `/#/x` is a same-document navigation, so
  // React never remounts and useSession never refetches. See AGENTS.md.
  await page.goto("/")
  await page.reload()
}

/** Same flow driven from a page, for specs that need browser cookies. */
export async function signInViaPage(page: Page, email: string): Promise<void> {
  await page.goto("/")
  const status = await page.evaluate(async (address) => {
    const send = await fetch("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address, type: "sign-in" }),
    })
    if (!send.ok) return { step: "send", status: send.status, otp: "" }
    return { step: "sent", status: 200, otp: "" }
  }, email)
  expect(status.status, `requesting a code for ${email}`).toBe(200)

  const otp = fixedCodeFor(email) ?? (await codeFromOutboxViaPage(page, email))

  const signInStatus = await page.evaluate(
    async ({ address, code }) => {
      const res = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, otp: code }),
      })
      return res.status
    },
    { address: email, code: otp },
  )
  expect(signInStatus, `sign-in for ${email} should succeed`).toBe(200)
  // `page.request` shares the page's cookie jar, so this reads the session the
  // browser just obtained — and can revoke it later.
  await remember(page.request, email)

  // Force a document load so the SPA picks the session up.
  //
  // Necessary since ADR 020 collapsed the two GUIs. Sign-in used to happen on
  // the server-rendered /login, so the next `goto("/app#/…")` was a real
  // cross-document navigation and React mounted fresh. Now everything is one
  // document at `/`, so `goto("/#/…")` is a same-document hash change: React
  // never remounts, `useSession` never refetches, and the page renders for a
  // signed-out visitor even though the cookie is set.
  await page.reload()
}

/**
 * Sign in by driving the actual login form, rather than posting to the API.
 *
 * Worth keeping distinct from `signInViaPage`: this is the only thing that
 * exercises the two-step screen itself — that requesting a code reveals the
 * code field, that the field accepts it, and that success lands you back on the
 * home page. Bypassing the form would leave the login UI untested.
 */
export async function signInThroughLoginForm(page: Page, email: string): Promise<void> {
  // The SPA's login screen, which is the only one now — ADR 020 deleted the
  // server-rendered harness this used to drive at /login. Same two steps, same
  // endpoints; the testids carry the `spa-` prefix they always had.
  await page.goto("/#/login")
  // Clear any pending code for this address first. `auth.setup` has already
  // signed every actor in through the API, and Better Auth both invalidates an
  // OTP after `allowedAttempts` and throttles re-sends — so asking for a second
  // code within the window returns 200, issues nothing, and leaves the fixed
  // code being checked against a spent one. That failed about half the time and
  // reported a missing identity element rather than a rejected code.
  // Awaited to completion, and returning something serialisable so it actually
  // is. Returning the `Response` meant Playwright could not serialise the
  // result, so the clear was not reliably finished before the next request —
  // and a delete that lands *after* the new code is issued removes the code
  // being typed. Which is the same "Invalid OTP", from the opposite direction.
  await page.evaluate(async (address) => {
    const res = await fetch(`/api/dev/otp?to=${encodeURIComponent(address)}`, {
      method: "DELETE",
    })
    return res.status
  }, email)
  await page.getByTestId("spa-email-input").fill(email)
  await page.getByTestId("spa-send-code").click()

  const otpField = page.getByTestId("spa-otp-input")
  await otpField.waitFor({ state: "visible" })

  const otp = fixedCodeFor(email) ?? (await codeFromOutboxViaPage(page, email))
  await otpField.fill(otp)
  // No Sign in press: the sixth digit submits — docs/done/2026-09-09-01-sign-in-code-autofill.md.
  //
  // spa-login.spec.ts was moved off the button when that landed; this shared
  // helper was not, and kept clicking a button the completed field had already
  // turned into a disabled "Signing in…". Playwright waited out the timeout for
  // an enabled button that never comes back, then reported a missing identity
  // element — against a sign-in that had in fact worked. A race, and one that
  // `freshActor()` loses reliably, because its first-ever sign-in also creates
  // the account and now registers an EMAIL channel, so the submit is in flight
  // for longer. Two specs failed; the click was the only thing wrong.
  //
  // Hash routing: the SPA stays on one document, so there is no navigation to
  // wait for. Wait for the identity to appear instead.
  await page.getByTestId("account-user").waitFor({ state: "visible", timeout: 20000 })
  // The identity can render before LoginPage finishes its success redirect.
  // Wait for that redirect before callers navigate to their test's subject.
  await expect(page.getByTestId("spa-login")).toHaveCount(0)
  await remember(page.request, email)
}

async function codeFromOutboxViaPage(page: Page, email: string): Promise<string> {
  const body = await page.evaluate(async (address) => {
    const res = await fetch(`/api/dev/outbox?to=${encodeURIComponent(address)}`)
    if (!res.ok) return null
    const { messages } = (await res.json()) as { messages: { body: string }[] }
    return messages.map((m) => m.body).join("\n---\n")
  }, email)
  expect(body, "dev outbox should exist locally").toBeTruthy()
  const match = body!.match(CODE_RE)
  expect(match, `no sign-in code was emailed to ${email}`).toBeTruthy()
  return match![1]!
}

function requireTestOtp(): string {
  const otp = process.env.TEST_OTP
  if (!otp) {
    throw new Error(
      "TEST_OTP must be set to run the suite against a deployed Worker — " +
        "there is no dev outbox there to read the emailed code from (ADR 012).",
    )
  }
  return otp
}


