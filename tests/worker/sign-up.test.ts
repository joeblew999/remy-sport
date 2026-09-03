import { env } from "cloudflare:test"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import * as schema from "../../src/db/schema"
import { GRANTS, STORED_ROLE } from "../../src/domain/vocabularies"
import type { Db } from "../../src/api/base"
import { post, signIn } from "./helpers"
import "./apply-migrations"

/**
 * Saying what you are, and the one that is a request rather than a claim.
 *
 * Signing up was never the missing part: `disableSignUp` is false, so a
 * first-time address that receives a code gets an account, and
 * `auth.config.ts` gives it `spectator`. What did not exist was choosing to be
 * anything else — four of the model's five `SIGN_UP_AS_*` actions had no way to
 * happen.
 *
 * The referee is different by the model's own naming: `SIGN_UP_AS_REFEREE_REQUEST`
 * is a request, and lands `PENDING_APPROVAL`. That status is already refused at
 * `session.create`, already explained to the person by `main.tsx`, and already
 * resolved by `admin.approveReferee` — so this asserts the piece that was
 * missing joins up with the three that were not.
 */

const db = drizzle(env.DB, { schema }) as unknown as Db

/** A never-seen address, so each test starts from a genuinely new account. */
const fresh = () => `signup-${crypto.randomUUID()}@e2e.test`

/** Sign up the way a person does: ask for a code, redeem it. */
async function join(email: string): Promise<string> {
  const cookie = await signIn(email)
  return cookie
}

const roleOf = async (email: string) => {
  const [row] = await db
    .select({ role: schema.user.role, statusCode: schema.user.statusCode })
    .from(schema.user)
    .where(eq(schema.user.email, email))
  return row
}

describe("Signing up", () => {
  it("a brand-new address becomes a spectator, which is SIGN_UP_AS_SPECTATOR", async () => {
    const email = fresh()
    await join(email)
    expect((await roleOf(email))?.role).toBe(STORED_ROLE.SPECTATOR)
  })

  it("a spectator can say they are a coach, a player or an organiser", async () => {
    for (const code of ["COACH", "PLAYER", "ORGANIZER"] as const) {
      const email = fresh()
      const cookie = await join(email)
      const res = await post("/api/me/role", { roleCode: code }, cookie)
      expect(res.status, `choosing ${code}`).toBe(200)

      const row = await roleOf(email)
      expect(row?.role, `${code} should be stored`).toBe(STORED_ROLE[code])
      // Not a request: these take effect immediately, and the model says so by
      // not naming them `_REQUEST`.
      expect(row?.statusCode, `${code} should be active straight away`).toBe("ACTIVE")
    }
  })

  it("a referee is a request, and lands waiting for approval", async () => {
    const email = fresh()
    const cookie = await join(email)
    const res = await post("/api/me/role", { roleCode: "REFEREE" }, cookie)
    expect(res.status).toBe(200)

    const row = await roleOf(email)
    expect(row?.role).toBe(STORED_ROLE.REFEREE)
    // The whole difference between a claim and a request, and the reason
    // APPROVE_REFEREE exists in the model with an endpoint already built.
    expect(row?.statusCode, "a referee should be waiting, not active").toBe("PENDING_APPROVAL")
  })

  it("somebody who is already something keeps it", async () => {
    const email = fresh()
    const cookie = await join(email)
    await post("/api/me/role", { roleCode: "COACH" }, cookie)
    // Second attempt: a coach must not be able to promote themselves.
    await post("/api/me/role", { roleCode: "ORGANIZER" }, cookie)

    expect((await roleOf(email))?.role, "a coach became an organiser").toBe(STORED_ROLE.COACH)
  })

  it("refuses a role the model does not grant to the public", async () => {
    const email = fresh()
    const cookie = await join(email)
    // ADMIN is not in GRANTS as a SIGN_UP_AS_* action, so it is not in the
    // procedure's input enum at all — the refusal is the schema's, not a check
    // somebody remembered to write.
    const res = await post("/api/me/role", { roleCode: "ADMIN" }, cookie)
    expect(res.status, "admin must not be self-assignable").toBeGreaterThanOrEqual(400)
    expect((await roleOf(email))?.role).toBe(STORED_ROLE.SPECTATOR)
  })

  it("offers exactly the roles the model grants to the public", () => {
    // Derived on both sides, so a role the PO adds or removes upstream changes
    // this without anybody editing a list.
    const signUps = Object.keys(GRANTS).filter((a) => a.startsWith("SIGN_UP_AS_"))
    expect(signUps.length, "the model should grant some sign-up actions").toBeGreaterThan(0)
    expect(signUps.some((a) => a.endsWith("_REQUEST")), "one of them is a request").toBe(true)
    expect(signUps.some((a) => a.includes("ADMIN")), "admin is never self-assignable").toBe(false)
  })
})
