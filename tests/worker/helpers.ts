import { SELF } from "cloudflare:test"
import { expect } from "vitest"
import { SEED_ENTITIES } from "../../src/domain/model/entities"
import { DEMO_SIGN_IN_CODE } from "../../src/environment"

/**
 * The whole harness for a Worker test. Three functions, no fixtures.
 *
 * The Playwright equivalents needed a `request` fixture, a BASE_URL, a running
 * wrangler dev, and a storageState file per actor. Here the Worker is in the
 * process, so "call the API as the coach" is one await.
 */

export const ORIGIN = "https://remy.test"

/**
 * The code seeded actors sign in with.
 *
 * Imported rather than repeated: the tier binds no TEST_OTP, so this is the
 * derived code from the policy table and the Worker has to agree with it. A
 * literal here would have let the two drift and turned a real break into a
 * puzzle about which 424242 was wrong.
 */
const OTP = DEMO_SIGN_IN_CODE

export const api = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  SELF.fetch(`${ORIGIN}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      ...(init.cookie ? { Cookie: init.cookie } : {}),
      ...init.headers,
    },
  })

export const post = (path: string, body: unknown, cookie?: string) =>
  api(path, { method: "POST", body: JSON.stringify(body), cookie })

/** One seeded actor per role, read from the PO's fixtures, never typed here. */
export const actorFor = (roleCode: string) =>
  SEED_ENTITIES.users.find((u) => u.roleCode === roleCode)!.email

/**
 * Sign in and return the session cookie, the way a browser would hold it.
 *
 * Real Better Auth, real OTP, real D1 — nothing mocked. These tests exist to
 * assert authorization, and a mocked session would assert only that the mock
 * was written correctly.
 */
export async function signIn(email: string): Promise<string> {
  const sent = await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
  expect(sent.status, `requesting a code for ${email}`).toBe(200)

  const res = await post("/api/auth/sign-in/email-otp", { email, otp: OTP })
  expect(res.status, `signing in as ${email}`).toBe(200)

  const cookie = res.headers.get("set-cookie")
  expect(cookie, `no session cookie for ${email}`).toBeTruthy()
  return cookie!.split(";")[0]!
}

/**
 * No `seed()` here any more.
 *
 * Each test file's database arrives already seeded, from src/db/seed.sql via
 * apply-migrations.ts. That used to be a `beforeAll` POSTing /api/seed — a
 * Better Auth `createUser` round trip per user, per file.
 */
