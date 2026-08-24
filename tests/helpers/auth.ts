import { expect, type APIRequestContext, type Page } from "@playwright/test"

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
export const ADMIN = "admin@remy.dev"
export const ORGANIZER = "organizer@remy.dev"
export const COACH = "coach@remy.dev"
export const PLAYER = "player@remy.dev"
export const SPECTATOR = "spectator@remy.dev"
export const REFEREE = "referee@remy.dev"

export const ALL_ACTORS = [ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE]

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
const SEEDED_DOMAIN = "@remy.dev"
const LOCAL_TEST_OTP = "424242"

function fixedCodeFor(email: string): string | null {
  if (!email.endsWith(SEEDED_DOMAIN)) return null
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

/** Same flow driven from a page, for specs that need browser cookies. */
export async function signInViaPage(page: Page, email: string): Promise<void> {
  await page.goto("/login")
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
  await page.goto("/login")
  await page.getByTestId("email-input").fill(email)
  await page.getByTestId("send-code").click()

  const otpField = page.getByTestId("otp-input")
  await otpField.waitFor({ state: "visible" })

  const otp = fixedCodeFor(email) ?? (await codeFromOutboxViaPage(page, email))
  await otpField.fill(otp)
  await page.getByTestId("verify-code").click()
  await page.waitForURL("**/")
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
