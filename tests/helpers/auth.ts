import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"
import { SEED_ENTITIES } from "../../src/db/seed-data"

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

export const BASE = process.env.BASE_URL || "http://localhost:8787"
export const IS_LOCAL = !process.env.BASE_URL

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
 * The e2e tier runs against one local D1 with one set of seeded people, and
 * Better Auth refuses a sign-in whose OTP was superseded by another request for
 * the same address. Two specs signing in as *the* organizer at the same time
 * therefore make one of them fail with INVALID_OTP — and which one loses moves
 * between runs, so it reads as a bug in whichever spec happened to be second.
 *
 * The fixtures already seed three organizers and three coaches at three
 * different schools. Nothing needed adding; the specs were simply all taking
 * the first one. `actor("ORGANIZER", 1)` takes the second.
 *
 * Ordering is the fixtures' own, so a given index is stable across runs. Ask
 * for one past the end and it throws rather than silently wrapping onto an
 * actor another spec is already using.
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
export const EVERY_SEEDED_ACTOR = SEED_ENTITIES.users.map((u) => u.email)

/**
 * Where auth.setup.ts parks each actor's cookies, and how a spec asks for one.
 *
 * `.playwright/` is already the project-scoped, gitignored home for Playwright
 * state (AGENTS.md), so the sessions land beside the browsers rather than in a
 * new top-level directory.
 */
export const AUTH_STATE_DIR = ".playwright/auth"
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
  if (!SEEDED_EMAILS.has(email)) return null
  return IS_LOCAL ? LOCAL_TEST_OTP : requireTestOtp()
}

async function codeFromOutbox(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)
  expect(res.ok(), "dev outbox should exist locally").toBeTruthy()
  const { messages } = await res.json()
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
export async function signIn(request: APIRequestContext, email: string): Promise<void> {
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
  await page.getByTestId("spa-email-input").fill(email)
  await page.getByTestId("spa-send-code").click()

  const otpField = page.getByTestId("spa-otp-input")
  await otpField.waitFor({ state: "visible" })

  const otp = fixedCodeFor(email) ?? (await codeFromOutboxViaPage(page, email))
  await otpField.fill(otp)
  await page.getByTestId("spa-verify-code").click()
  // Hash routing: the SPA stays on one document, so there is no navigation to
  // wait for. Wait for the identity to appear instead.
  await page.getByTestId("topbar-user").waitFor({ state: "visible", timeout: 20000 })
}

async function codeFromOutboxViaPage(page: Page, email: string): Promise<string> {
  const body = await page.evaluate(async (address) => {
    const res = await fetch(`/api/dev/outbox?to=${encodeURIComponent(address)}`)
    if (!res.ok) return null
    const { messages } = await res.json()
    return (messages as { body: string }[]).map((m) => m.body).join("\n---\n")
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

/**
 * Delete an organization created by a test.
 *
 * Specs that create organizations must call this. Without it local D1 grew to
 * 126 organizations, and the accumulation eventually broke an unrelated
 * assertion: `organization/list` returns a bounded set, so a freshly created
 * org stopped appearing in it. That failure looked like a bug in listing and
 * was really a bug in cleanup — the worst kind to chase.
 *
 * Best-effort: a test that already failed should not fail again in teardown.
 */
export async function deleteOrg(request: APIRequestContext, organizationId: string): Promise<void> {
  await request
    .post("/api/auth/organization/delete", {
      data: { organizationId },
      headers: { Origin: BASE },
    })
    .catch(() => undefined)
}

/** Page-driven variant, for specs that work through the browser context. */
export async function deleteOrgViaPage(page: Page, organizationId: string): Promise<void> {
  await page
    .evaluate(async (id) => {
      await fetch("/api/auth/organization/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: id }),
      })
    }, organizationId)
    .catch(() => undefined)
}
