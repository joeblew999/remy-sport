import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/domain/model/entities"
import { ORIGIN, actorFor, api, post, signIn } from "./helpers"
import { gamesIn } from "../helpers/fixtures"
import { isRefusedStatus } from "../../src/auth.config"

/**
 * Everything that writes, and everything that decides who may.
 *
 * Sign-in, the six-role permission matrix, ownership, and the two
 * access-control questions a team write has to answer — all against real Better
 * Auth and real Miniflare D1. Nothing is mocked: these assert authorization, so
 * a mocked session would assert only that the mock was written correctly.
 *
 * One file, for the same reason as read.test.ts — ~3s of workerd startup per
 * file, measured.
 */

/** One seeded actor per role, read from the PO's fixtures, never typed here. */
const ADMIN = actorFor("ADMIN")
const ORGANIZER = actorFor("ORGANIZER")
const COACH = actorFor("COACH")
const SPECTATOR = actorFor("SPECTATOR")

/**
 * Sign-in, in workerd. Converted from tests/auth.spec.ts and tests/otp.spec.ts.
 *
 * Neither ever needed a browser: both drove the API with Playwright's `request`
 * fixture. What they cost was a wrangler dev server, a Playwright runner, and a
 * slot in a 1.6-minute suite.
 *
 * The outbox tests come along too. They used to `test.skip(!IS_LOCAL)` because
 * reading a real emailed code needs `MAIL_TRANSPORT=outbox`, which a deployed
 * run does not have — here that binding is set per test file in
 * vitest.config.ts, so the mail path is always exercised rather than skipped
 * exactly when someone runs the suite against production.
 */


const nameFor = (roleCode: string) =>
  SEED_ENTITIES.users.find((u) => u.roleCode === roleCode)!.names.en

/** A unique address per test, so nothing rotates a code underneath another. */
let n = 0
const fresh = (p: string) => `${p}-${++n}@example.com`

async function outbox(email: string) {
  const res = await api(`/api/dev/outbox?to=${encodeURIComponent(email)}`)
  expect(res.status, "the dev outbox should exist under MAIL_TRANSPORT=outbox").toBe(200)
  const { messages } = (await res.json()) as { messages: { subject: string; body: string }[] }
  return messages
}

const codeFrom = (body: string) => {
  const m = body.match(/Your code is (\d{6})/)
  expect(m, "a code should have been emailed").toBeTruthy()
  return m![1]!
}


describe("seeding", () => {
  /**
   * The database is already seeded — apply-migrations.ts applies the same
   * statements before this file runs. So what is under test is that POSTing the
   * route on top of that writes **nothing**: every statement is
   * `INSERT OR IGNORE`, and re-seeding a live database must not duplicate rows
   * or clobber edited ones.
   *
   * That is the property the old assertion could not make. It counted a
   * per-user `created | exists` array the route built as it went, which reported
   * "exists" for a user whose *account* row had failed — the shape that hid the
   * missing `local:credential` issuer behind a green test.
   */
  it("is idempotent against an already-seeded database", async () => {
    // Not "writes nothing": the vocabularies upsert, so re-seeding re-asserts
    // the PO's labels on purpose — that is how a renamed city reaches a database
    // that was seeded before the rename. What must not change is how many rows
    // there are. Duplicating is the failure this guards.
    const count = async () => {
      const res = await api("/api/teams")
      const { teams } = (await res.json()) as { teams: unknown[] }
      const events = (await (await api("/api/events")).json()) as { events: unknown[] }
      return { teams: teams.length, events: events.events.length }
    }
    const before = await count()

    const res = await SELF.fetch(`${ORIGIN}/api/seed`, { method: "POST" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { statements: number; written: number }
    expect(body.statements).toBeGreaterThan(SEED_ENTITIES.users.length)

    expect(await count(), "re-seeding must not duplicate a single row").toEqual(before)
  })

  it("seeds every active actor the fixtures define, signable-in", async () => {
    // Not a count of a response array: the fixtures' users are in the database
    // and can each authenticate, which is what "seeded" has to mean.
    const active = SEED_ENTITIES.users.filter((u) => u.statusCode === "ACTIVE")
    expect(active.length, "the fixtures should have active users").toBeGreaterThan(0)
    for (const u of active) {
      const cookie = await signIn(u.email)
      const session = (await (await api("/api/auth/get-session", { cookie })).json()) as {
        user: { email: string } | null
      }
      expect(session.user?.email, `${u.id} should be able to sign in`).toBe(u.email)
    }
  })

  it("refuses a session to anyone the model does not call ACTIVE", async () => {
    // The lifecycle the model always described and nothing implemented: until
    // migration 0008 the `user` table had no status column at all, so a
    // DEACTIVATED account signed in exactly like a live one.
    //
    // Refused at session creation rather than at the sign-in endpoint, because
    // every way in ends up creating a session — so this is the one chokepoint
    // another entry point cannot slip past.
    // The two that are refused, named rather than "everything that is not
    // ACTIVE". PENDING_APPROVAL is the third non-active status and it *must*
    // sign in: a referee awaiting approval has an account and needs to see that
    // they are waiting. Writing the filter as `!== "ACTIVE"` swept them in and
    // asserted the opposite of what the model means.
    const refused = SEED_ENTITIES.users.filter(
      (u) => u.statusCode === "SUSPENDED" || u.statusCode === "DEACTIVATED",
    )
    expect(refused.length, "the fixtures should exercise both refused statuses").toBe(2)

    for (const u of refused) {
      await post("/api/auth/email-otp/send-verification-otp", { email: u.email, type: "sign-in" })
      const res = await post("/api/auth/sign-in/email-otp", { email: u.email, otp: "424242" })
      expect(res.status, `${u.id} (${u.statusCode}) must not get a session`).toBe(403)
    }

    // And the one that is not refused, so this cannot pass by blocking everyone.
    const waiting = SEED_ENTITIES.users.find((u) => u.statusCode === "PENDING_APPROVAL")
    if (waiting) {
      const cookie = await signIn(waiting.email)
      const session = (await (await api("/api/auth/get-session", { cookie })).json()) as {
        user: { email: string } | null
      }
      expect(session.user?.email, "a person awaiting approval still signs in").toBe(waiting.email)
    }
  })
})

describe("seeded actors sign in with the fixed code", () => {
  it("admin gets a session carrying their identity", async () => {
    const cookie = await signIn(ADMIN)
    const session = (await (await api("/api/auth/get-session", { cookie })).json()) as {
      user: { email: string; name: string }
      session: { token: string }
    }
    expect(session.user.email).toBe(ADMIN)
    expect(session.user.name).toBe(nameFor("ADMIN"))
    expect(session.session.token).toBeTruthy()
  })

  it("spectator too — sign-in is not admin-shaped", async () => {
    const cookie = await signIn(SPECTATOR)
    const session = (await (await api("/api/auth/get-session", { cookie })).json()) as {
      user: { email: string; name: string }
    }
    expect(session.user.email).toBe(SPECTATOR)
    expect(session.user.name).toBe(nameFor("SPECTATOR"))
  })

  it("a wrong code is refused", async () => {
    await post("/api/auth/email-otp/send-verification-otp", { email: ADMIN, type: "sign-in" })
    const res = await post("/api/auth/sign-in/email-otp", { email: ADMIN, otp: "000000" })
    expect(res.status).not.toBe(200)
  })

  it("password sign-in does not exist", async () => {
    // ADR 012: not "passwords are discouraged" but "there is no password path".
    // If this ever succeeds, a second way in has returned.
    const res = await post("/api/auth/sign-in/email", { email: ADMIN, password: "admin1234!" })
    expect(res.status).not.toBe(200)
  })
})

describe("a genuinely emailed code", () => {
  // The fixed TEST_OTP above is a shortcut for the six shared actors, and it
  // would hide a broken mail path. These use a real generated code, mailed,
  // read back out of the outbox, and redeemed.
  it("is mailed, and works", async () => {
    const email = fresh("otp")
    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })

    const [mail] = await outbox(email)
    expect(mail!.subject).toMatch(/^\d{6} is your Remy Sport code$/)

    const res = await post("/api/auth/sign-in/email-otp", { email, otp: codeFrom(mail!.body) })
    expect(res.status).toBe(200)
  })

  it("gives a first-time address an account, defaulted to spectator", async () => {
    const email = fresh("new")
    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
    const [mail] = await outbox(email)
    const res = await post("/api/auth/sign-in/email-otp", { email, otp: codeFrom(mail!.body) })
    expect(res.status).toBe(200)

    const cookie = res.headers.get("set-cookie")!.split(";")[0]!
    const session = (await (await api("/api/auth/get-session", { cookie })).json()) as {
      user: { role: string }
    }
    // Sign-up is not a separate act, and it does not grant anything.
    expect(session.user.role).toBe("spectator")
  })

  it("cannot be used twice", async () => {
    const email = fresh("once")
    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
    const [mail] = await outbox(email)
    const code = codeFrom(mail!.body)

    expect((await post("/api/auth/sign-in/email-otp", { email, otp: code })).status).toBe(200)
    expect((await post("/api/auth/sign-in/email-otp", { email, otp: code })).status).not.toBe(200)
  })

  it("is invalidated by requesting a newer one", async () => {
    const email = fresh("rotate")
    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
    const first = codeFrom((await outbox(email))[0]!.body)

    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
    const messages = await outbox(email)
    const second = codeFrom(messages[0]!.body)
    expect(second).not.toBe(first)

    expect((await post("/api/auth/sign-in/email-otp", { email, otp: first })).status).not.toBe(200)
    expect((await post("/api/auth/sign-in/email-otp", { email, otp: second })).status).toBe(200)
  })
})

/**
 * The six-role permission matrix, in workerd.
 *
 * This is the repo's most valuable test and it never needed a browser: it
 * posts to `/api/events` as each actor and asserts 201 or 403. In Playwright it
 * cost a wrangler dev server, a Playwright runner and a slice of a 1.6-minute
 * suite. Here it is `SELF.fetch()` against the Worker in this process.
 *
 * Auth is real — a real OTP sign-in against real Better Auth against real
 * Miniflare D1. Nothing is mocked. That matters: the thing being asserted IS
 * the authorization, so a mock would assert only that the mock was written
 * correctly.
 *
 * `isolatedStorage` means this file owns its D1, so it can seed and create
 * freely without racing another spec — the contention that held Playwright to
 * two workers.
 */

const WRITERS = ["ADMIN", "ORGANIZER"]
const READERS = ["COACH", "PLAYER", "SPECTATOR", "REFEREE"]


describe("event:create — who may, by role", () => {
  for (const role of WRITERS) {
    it(`${role.toLowerCase()} CAN create an event`, async () => {
      const cookie = await signIn(actorFor(role))
      const res = await post(
        "/api/events",
        { names: { en: `${role} event` }, typeCode: "TOURNAMENT" },
        cookie,
      )
      expect(res.status).toBe(201)
    })
  }

  for (const role of READERS) {
    it(`${role.toLowerCase()} CANNOT create an event (403)`, async () => {
      const cookie = await signIn(actorFor(role))
      const res = await post(
        "/api/events",
        { names: { en: `${role} event` }, typeCode: "TOURNAMENT" },
        cookie,
      )
      expect(res.status).toBe(403)
    })
  }

  it("an anonymous caller gets 401, not 403", async () => {
    // The distinction matters: 403 would tell an anonymous caller the endpoint
    // exists and they are merely not permitted.
    const res = await post("/api/events", { names: { en: "x" }, typeCode: "TOURNAMENT" })
    expect(res.status).toBe(401)
  })
})

describe("event:read is public", () => {
  it("lists events without a session", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/events`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { events: unknown[] }
    expect(Array.isArray(body.events)).toBe(true)
  })

  it("404s an unknown id rather than leaking which ids exist", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/events/nope`)
    expect(res.status).toBe(404)
  })
})

describe("ownership — layer 2", () => {
  it("an organizer cannot update an event they did not create", async () => {
    const admin = await signIn(actorFor("ADMIN"))
    const created = await post(
      "/api/events",
      { names: { en: "Admin's event" }, typeCode: "TOURNAMENT" },
      admin,
    )
    const { id } = (await created.json()) as { id: string }

    const organizer = await signIn(actorFor("ORGANIZER"))
    const res = await SELF.fetch(`${ORIGIN}/api/events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: organizer },
      body: JSON.stringify({ names: { en: "Hijacked" } }),
    })
    expect(res.status).toBe(403)
  })
})

/**
 * ADR 009. Team writes are the first endpoints where "may you do this?" needs
 * two answers: a platform-wide one (may this actor type touch teams at all) and
 * an object-scoped one (is this person part of *this* school). The organization
 * plugin's `member` table supplies the second.
 *
 * Converted from tests/org-teams.spec.ts, which never opened a browser. Two
 * constraints it carried are gone with it: it needed one sign-in per test
 * because a second sign-in on the same Playwright request context arrives
 * carrying a cookie, and its create/delete pair had to be `describe.serial`
 * because the rows were shared with every other spec. Here each cookie is a
 * value and `isolatedStorage` gives this file its own database.
 */


const put = (path: string, body: unknown, cookie: string) =>
  api(path, { method: "PUT", body: JSON.stringify(body), cookie })

const del = (path: string, cookie?: string) => api(path, { method: "DELETE", cookie })

/** Resolve an org id through the public teams listing, which joins organization. */
async function orgIdForTeam(teamId: string) {
  const res = await api(`/api/teams/${teamId}`)
  expect(res.status, `${teamId} should be seeded`).toBe(200)
  return ((await res.json()) as { orgId: string }).orgId
}


describe("Team writes need platform permission AND org membership", () => {
  it("a coach can create a team in the school they belong to, and an admin can delete it", async () => {
    const coach = await signIn(COACH)
    // team_001 is an Assumption College team, and the seed makes the coach an
    // org admin of Assumption College.
    const orgId = await orgIdForTeam("team_001")

    const res = await post(
      "/api/teams",
      { names: { en: "Assumption U14 Boys" }, orgId, ageGroupCode: "U14", genderCode: "M" },
      coach,
    )
    expect(res.status).toBe(201)
    const team = (await res.json()) as { id: string; orgName: string; ageGroupCode: string }
    expect(team.orgName).toBe("Assumption College")
    expect(team.ageGroupCode).toBe("U14")

    // biz data/access/matrix.md: DELETE_TEAM -> PLATFORM_ADMIN and nobody else.
    // One test, not two: the pair used to need `describe.serial` and a
    // module-level `let` to pass the id between them.
    const admin = await signIn(ADMIN)
    const deleted = await del(`/api/teams/${team.id}`, admin)
    expect(deleted.status).toBe(200)
    expect(((await deleted.json()) as { deleted: string }).deleted).toBe(team.id)
  })
})

describe("Team writes — refusals", () => {
  it("a coach creating a team becomes its head coach, and can then edit it", async () => {
    const coach = await signIn(COACH)
    // team_003 is Montfort College; this coach is at Assumption. The PO grants
    // CREATE_TEAM to ANY_COACH with no relation to an org — it is a PLATFORM
    // action, because the team does not exist yet to be related to. This used to
    // be refused by requireOrgMember, a relation the model does not define.
    const otherOrg = await orgIdForTeam("team_003")

    const res = await post(
      "/api/teams",
      { names: { en: "Created By A Visiting Coach" }, orgId: otherOrg, ageGroupCode: "U14", genderCode: "M" },
      coach,
    )
    expect(res.status).toBe(201)
    const created = (await res.json()) as { id: string }

    // And the loop closes: every later action on a team is scoped by
    // team_coaches, so creating one has to make you its coach or you could not
    // edit what you just made.
    const edit = await put(
      `/api/teams/${created.id}`,
      { names: { en: "Renamed By Its Creator" } },
      coach,
    )
    expect(edit.status, "the creator should hold HEAD_COACH on it").toBe(200)
  })

  it("a spectator is refused before membership is even considered", async () => {
    const cookie = await signIn(SPECTATOR)
    const orgId = await orgIdForTeam("team_001")
    // Platform permission runs first: a spectator holds no team:create at all,
    // so membership never gets asked about.
    const res = await post(
      "/api/teams",
      { names: { en: "Nope" }, orgId, ageGroupCode: "U14", genderCode: "M" },
      cookie,
    )
    expect(res.status).toBe(403)
  })

  it("an anonymous caller gets 401, not 403", async () => {
    const orgId = await orgIdForTeam("team_001")
    const res = await post("/api/teams", {
      names: { en: "Nope" },
      orgId,
      ageGroupCode: "U14",
      genderCode: "M",
    })
    expect(res.status).toBe(401)
  })

  it("a coach can update their own school's team", async () => {
    const cookie = await signIn(COACH)
    const res = await put("/api/teams/team_001", { names: { en: "Test Team", th: "ทีมทดสอบ" } }, cookie)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { names: { th: string } }).names.th).toBe("ทีมทดสอบ")
  })

  it("a coach cannot update another school's team", async () => {
    const cookie = await signIn(COACH)
    expect((await put("/api/teams/team_003", { names: { en: "hack" } }, cookie)).status).toBe(403)
  })

  it("an unknown team id is 404, not 403 — it must not leak which ids exist", async () => {
    const cookie = await signIn(COACH)
    const res = await put("/api/teams/team_definitely_not_real", { names: { en: "x" } }, cookie)
    expect(res.status).toBe(404)
  })

  it("a coach who is an org admin still cannot delete a team", async () => {
    const cookie = await signIn(COACH)
    expect((await del("/api/teams/team_001", cookie)).status).toBe(403)
  })

  it("an organizer cannot delete a team either", async () => {
    const cookie = await signIn(ORGANIZER)
    expect((await del("/api/teams/team_002", cookie)).status).toBe(403)
  })
})



describe("Co-organizers — the relation nothing used to create", () => {
  /**
   * EDIT_EVENT is granted to OWNER, CO_ORGANIZER and PLATFORM_ADMIN. Only the
   * first two of those were reachable, because no endpoint ever wrote an
   * event_co_organizers row — so the app was stricter than the matrix, and the
   * grant sat there meaning nothing.
   */
  it("an organizer added as co-organizer can edit an event they do not own", async () => {
    const owner = await signIn(actorFor("ORGANIZER"))
    const created = await post(
      "/api/events",
      { names: { en: "Co-organised Event" }, typeCode: "TOURNAMENT" },
      owner,
    )
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }

    // A different organizer: seeded, and not the one who created it.
    const other = SEED_ENTITIES.users.find(
      (u) => u.roleCode === "ORGANIZER" && u.email !== actorFor("ORGANIZER"),
    )!
    const otherCookie = await signIn(other.email)

    const refused = await put(`/api/events/${id}`, { names: { en: "Nope" } }, otherCookie)
    expect(refused.status, "not a co-organizer yet").toBe(403)

    const added = await post(`/api/events/${id}/co-organizers`, { userId: other.id }, owner)
    expect(added.status).toBe(201)

    // Still refused: the invitation is PENDING, and CO_ORGANIZER filters on
    // ACCEPTED. This is what makes ACCEPT_CO_ORGANIZER_INVITE an action rather
    // than a formality — being invited is not being a co-organizer.
    const pending = await put(`/api/events/${id}`, { names: { en: "Not Yet" } }, otherCookie)
    expect(pending.status, "a pending invitation grants nothing").toBe(403)

    const accepted = await post(`/api/events/${id}/co-organizers/accept`, {}, otherCookie)
    expect(accepted.status).toBe(200)

    const allowed = await put(`/api/events/${id}`, { names: { en: "Edited By Co" } }, otherCookie)
    expect(allowed.status, "CO_ORGANIZER grants EDIT_EVENT once accepted").toBe(200)

    // DELETE_EVENT is granted to OWNER and PLATFORM_ADMIN only — schema.md says
    // so in words too: "a co-organizer can edit the event but cannot delete it".
    const del = await api(`/api/events/${id}`, { method: "DELETE", cookie: otherCookie })
    expect(del.status, "but not DELETE_EVENT").toBe(403)
  })

  it("adding the same co-organizer twice is a no-op, not a duplicate tuple", async () => {
    const owner = await signIn(actorFor("ORGANIZER"))
    const { id } = (await (
      await post("/api/events", { names: { en: "Twice" }, typeCode: "CAMP" }, owner)
    ).json()) as { id: string }
    const other = SEED_ENTITIES.users.find(
      (u) => u.roleCode === "ORGANIZER" && u.email !== actorFor("ORGANIZER"),
    )!
    for (const _ of [1, 2]) {
      expect((await post(`/api/events/${id}/co-organizers`, { userId: other.id }, owner)).status).toBe(201)
    }
  })

  it("you cannot accept an invitation you were never sent", async () => {
    const owner = await signIn(actorFor("ORGANIZER"))
    const { id } = (await (
      await post("/api/events", { names: { en: "Uninvited" }, typeCode: "SHOWCASE" }, owner)
    ).json()) as { id: string }

    // ACCEPT_CO_ORGANIZER_INVITE is granted to ANY_SIGNED_IN, because the
    // invitee holds no relation to the event yet — that is the point of the
    // pending state. What stands in for the missing relation is the row.
    const coach = await signIn(actorFor("COACH"))
    const res = await post(`/api/events/${id}/co-organizers/accept`, {}, coach)
    expect(res.status, "no invitation to accept").toBe(404)
  })

  it("someone who is not the owner cannot add a co-organizer", async () => {
    const owner = await signIn(actorFor("ORGANIZER"))
    const { id } = (await (
      await post("/api/events", { names: { en: "Guarded" }, typeCode: "LEAGUE" }, owner)
    ).json()) as { id: string }

    const coach = await signIn(actorFor("COACH"))
    const res = await post(`/api/events/${id}/co-organizers`, { userId: "usr_org_002" }, coach)
    expect(res.status).toBe(403)
  })
})

describe("Organisations — the actions ORG was declared for", () => {
  /**
   * `ORG` was a declared object type with no relations and no actions until
   * 2026-08-27, so nothing could be authorised against a school. These four
   * endpoints are what the grants were always describing.
   */
  it("anyone may read an organisation — VIEW_ORG is granted to PUBLIC", async () => {
    const res = await api("/api/orgs/org_001")
    expect(res.status).toBe(200)
    const org = (await res.json()) as { slug: string; names: Record<string, string> }
    expect(org.slug).toBe("assumption-college")
    // A real JSON column, not a string somebody has to parse.
    expect(org.names.en).toBe("Assumption College")
  })

  /**
   * `canEdit` is what stops the GUI offering a Save button that 403s. It is the
   * same question `requireAction` asks — so the two must never disagree, which
   * is what the second half of this asserts.
   */
  it("the org reports whether the reader may edit it, and it matches what a write does", async () => {
    const anon = (await (await api("/api/orgs/org_001")).json()) as { canEdit: boolean }
    expect(anon.canEdit, "a stranger holds only PUBLIC").toBe(false)

    // usr_coach_001 is ADMIN of org_001.
    const admin = await signIn(actorFor("COACH"))
    const mine = (await (await api("/api/orgs/org_001", { cookie: admin })).json()) as {
      canEdit: boolean
    }
    expect(mine.canEdit).toBe(true)
    expect((await put("/api/orgs/org_001", { names: { en: "Assumption College" } }, admin)).status)
      .toBe(200)

    const outsider = await signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_coach_003")!.email)
    const theirs = (await (await api("/api/orgs/org_001", { cookie: outsider })).json()) as {
      canEdit: boolean
    }
    expect(theirs.canEdit).toBe(false)
    expect(
      (await put("/api/orgs/org_001", { names: { en: "Mine Now" } }, outsider)).status,
      "canEdit false and the write refused — the report and the enforcement agree",
    ).toBe(403)
  })

  it("an org admin may edit its profile; an unrelated coach may not", async () => {
    // usr_coach_001 is ADMIN of org_001 in the fixtures.
    const admin = await signIn(actorFor("COACH"))
    const ok = await put("/api/orgs/org_001", { names: { en: "Assumption College", th: "โรงเรียนอัสสัมชัญ" } }, admin)
    expect(ok.status, "ORG_ADMIN grants EDIT_ORG_PROFILE").toBe(200)

    // A coach at another school holds no relation to this one.
    const other = SEED_ENTITIES.users.find((u) => u.id === "usr_coach_003")!
    const outsider = await signIn(other.email)
    const refused = await put("/api/orgs/org_001", { names: { en: "Mine Now" } }, outsider)
    expect(refused.status, "no relation to this organisation").toBe(403)
  })

  it("an org admin can add and remove a member, and that grants the relation", async () => {
    const admin = await signIn(actorFor("COACH"))
    const newcomer = SEED_ENTITIES.users.find((u) => u.id === "usr_referee_001")!

    const added = await post("/api/orgs/org_001/members", { userId: newcomer.id }, admin)
    expect(added.status).toBe(201)
    // The model's own code, stored as the model spells it. It was lowercased
    // while membership lived in Better Auth's table, which is one translation
    // fewer now.
    expect(((await added.json()) as Record<string, unknown>).role).toBe("MEMBER")

    // A plain member cannot edit the profile — that is ORG_ADMIN and above.
    const member = await signIn(newcomer.email)
    expect((await put("/api/orgs/org_001", { names: { en: "No" } }, member)).status).toBe(403)

    const removed = await api(`/api/orgs/org_001/members/${newcomer.id}`, {
      method: "DELETE",
      cookie: admin,
    })
    expect(removed.status).toBe(200)
    // Removing twice is a 404: there is nothing left to remove.
    expect(
      (await api(`/api/orgs/org_001/members/${newcomer.id}`, { method: "DELETE", cookie: admin }))
        .status,
    ).toBe(404)
  })

  /**
   * The roster, and who may see it.
   *
   * The model declares no VIEW_ORG_MEMBERS, so this is gated on
   * INVITE_ORG_MEMBER — whoever may add and remove members may see them. The
   * profile stays public; a list of people's email addresses does not.
   */
  it("an org admin sees the roster; an outsider does not, and nor does a stranger", async () => {
    const admin = await signIn(actorFor("COACH"))
    const res = await api("/api/orgs/org_001/members", { cookie: admin })
    expect(res.status).toBe(200)
    const { members } = (await res.json()) as {
      members: { userId: string; email: string; orgRoleCode: string }[]
    }
    // The fixtures put usr_coach_001 in org_001 as ADMIN.
    expect(members.some((mem) => mem.userId === "usr_coach_001")).toBe(true)
    expect(members.every((mem) => mem.email.includes("@"))).toBe(true)

    const outsider = await signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_coach_003")!.email)
    expect((await api("/api/orgs/org_001/members", { cookie: outsider })).status).toBe(403)

    // Anonymous is 401 and not 403: "sign in" and "not yours" are different
    // answers, and the page renders them differently.
    expect((await api("/api/orgs/org_001/members")).status).toBe(401)
  })

  it("a member can be added by email, which is what a person actually knows", async () => {
    const admin = await signIn(actorFor("COACH"))
    const newcomer = SEED_ENTITIES.users.find((u) => u.id === "usr_referee_002")!

    const added = await post("/api/orgs/org_001/members", { email: newcomer.email }, admin)
    expect(added.status).toBe(201)
    // Resolved to the id, so the tuple the relations read is the same one the
    // userId form writes.
    expect(((await added.json()) as Record<string, unknown>).userId).toBe(newcomer.id)

    const listed = await api("/api/orgs/org_001/members", { cookie: admin })
    const { members } = (await listed.json()) as { members: { email: string }[] }
    expect(members.some((mem) => mem.email === newcomer.email)).toBe(true)

    await api(`/api/orgs/org_001/members/${newcomer.id}`, { method: "DELETE", cookie: admin })
  })

  it("an address nobody signed up with is 404, not a silent no-op", async () => {
    const admin = await signIn(actorFor("COACH"))
    const res = await post("/api/orgs/org_001/members", { email: "nobody@example.invalid" }, admin)
    expect(res.status).toBe(404)
  })

  it("giving both an id and an email, or neither, is refused", async () => {
    const admin = await signIn(actorFor("COACH"))
    const both = await post(
      "/api/orgs/org_001/members",
      { userId: "usr_referee_001", email: "a@b.test" },
      admin,
    )
    expect(both.status, "userId and email are alternatives, not a pair").toBeGreaterThanOrEqual(400)
    const neither = await post("/api/orgs/org_001/members", {}, admin)
    expect(neither.status).toBeGreaterThanOrEqual(400)
  })
})

describe("Games — the object type ENTER_SCORES was missing", () => {
  /**
   * The regression these exist for: `ENTER_SCORES` was granted to `ANY_REFEREE`,
   * the platform role, so any referee could score any game in any event. Adisorn
   * (usr_referee_001) is assigned to gam_001 and gam_002; Waraporn
   * (usr_referee_002) only to gam_003.
   */
  it("a schedule is public — a spectator needs no account to read a score", async () => {
    const res = await api("/api/games?eventId=evt_002")
    expect(res.status).toBe(200)
    const { games } = (await res.json()) as {
      games: { id: string; statusCode: string; homeScore: number | null; canEnterScore: boolean }[]
    }
    // As many as the fixtures schedule for this event — derived, not typed
    // here, so another round of matches does not fail a test about visibility.
    expect(games.map((g) => g.id).sort()).toEqual(gamesIn("evt_002").map((g) => g.id).sort())
    expect(games.find((g) => g.id === "gam_002")!.statusCode).toBe("LIVE")
    // Nobody is signed in, so nobody may score — for any of them.
    expect(games.every((g) => !g.canEnterScore)).toBe(true)
  })

  it("the assigned referee may enter a score, and it is read back", async () => {
    const adisorn = await signIn("adisorn.b@bat.test")
    const res = await put("/api/games/gam_002/score", { homeScore: 55, awayScore: 47 }, adisorn)
    expect(res.status).toBe(200)
    const game = (await res.json()) as { homeScore: number; awayScore: number; canEnterScore: boolean }
    expect(game.homeScore).toBe(55)
    expect(game.awayScore).toBe(47)
    expect(game.canEnterScore, "the API tells them they may do it again").toBe(true)
  })

  it("a referee assigned to another game may NOT — this is the whole point", async () => {
    const waraporn = await signIn("waraporn.j@bat.test")
    // Assigned to gam_003 only.
    expect((await put("/api/games/gam_002/score", { homeScore: 99, awayScore: 0 }, waraporn)).status)
      .toBe(403)
    expect((await put("/api/games/gam_003/score", { homeScore: 60, awayScore: 58 }, waraporn)).status)
      .toBe(200)
  })

  it("the event's organiser may score any game in it", async () => {
    // usr_org_002 owns evt_002.
    const organiser = await signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_org_002")!.email)
    expect((await put("/api/games/gam_002/score", { homeScore: 61, awayScore: 59 }, organiser)).status)
      .toBe(200)
    // ...and not one in an event they neither own nor co-organise. gam_001 is in
    // evt_001, where usr_org_002 IS an accepted co-organizer — so use a third.
    const outsider = await signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_org_003")!.email)
    expect((await put("/api/games/gam_002/score", { homeScore: 1, awayScore: 1 }, outsider)).status)
      .toBe(403)
  })

  it("an accepted co-organizer of the event may score its games", async () => {
    // usr_org_002 is an ACCEPTED co-organizer of evt_001, which gam_001 is in.
    const coOrganizer = await signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_org_002")!.email)
    expect((await put("/api/games/gam_001/score", { homeScore: 68, awayScore: 54 }, coOrganizer)).status)
      .toBe(200)
  })

  it("one score without the other is refused", async () => {
    const adisorn = await signIn("adisorn.b@bat.test")
    const res = await put("/api/games/gam_002/score", { homeScore: 55, awayScore: null }, adisorn)
    expect(res.status).toBe(400)
  })

  it("status is a separate action from scoring, and moves the game", async () => {
    const adisorn = await signIn("adisorn.b@bat.test")
    const res = await put("/api/games/gam_002/status", { statusCode: "FINISHED" }, adisorn)
    expect(res.status).toBe(200)
    expect(((await res.json()) as Record<string, unknown>).statusCode).toBe("FINISHED")
  })

  it("an unknown game is 404, not 403 — it must not leak which ids exist", async () => {
    const adisorn = await signIn("adisorn.b@bat.test")
    expect((await put("/api/games/gam_nope/score", { homeScore: 1, awayScore: 2 }, adisorn)).status)
      .toBe(404)
  })
})

describe("Registration — the action about a pair", () => {
  /**
   * `REGISTER_TEAM_FOR_EVENT` declared object type EVENT while every relation
   * granting it (HEAD_COACH, TEAM_MANAGER) is about a TEAM, so the check looked
   * for `team_coaches.team_id = <an event id>`, matched nothing, and failed
   * closed. No coach could register a team.
   *
   * It is TEAM-scoped now, with the event supplied as the context that narrows
   * the grant by subtype.
   */
  const post_ = (path: string, body: unknown, cookie: string) => post(path, body, cookie)

  it("a head coach can enter their own team, and it is idempotent", async () => {
    // usr_coach_001 is HEAD_COACH of team_001, which is U16 M like div_001.
    const coach = await signIn(actorFor("COACH"))
    const body = { teamId: "team_001", eventId: "evt_004", divisionId: "div_001" }

    const first = await post_("/api/events/evt_004/teams", body, coach)
    expect(first.status, "the fix: a coach may register their own team").toBe(201)

    // Pressing it again means the same thing it meant the first time.
    expect((await post_("/api/events/evt_004/teams", body, coach)).status).toBe(201)
    const { standings } = (await (await api("/api/standings?eventId=evt_004")).json()) as {
      standings: { teamId: string }[]
    }
    expect(standings.filter((s) => s.teamId === "team_001")).toHaveLength(1)

    // Put it back.
    expect(
      (await api("/api/events/evt_004/teams/team_001", { method: "DELETE", cookie: coach })).status,
    ).toBe(200)
  })

  it("a coach at another school cannot enter that team", async () => {
    const outsider = await signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_coach_003")!.email)
    const res = await post_(
      "/api/events/evt_004/teams",
      { teamId: "team_001", eventId: "evt_004", divisionId: "div_001" },
      outsider,
    )
    expect(res.status).toBe(403)
  })

  it("a team cannot enter a division it does not match", async () => {
    // team_002 is U18 F; div_001 is U16 M. The foreign keys allow it and
    // nothing else would have caught it.
    const coach = await signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_coach_002")!.email)
    const res = await post_(
      "/api/events/evt_004/teams",
      { teamId: "team_002", eventId: "evt_004", divisionId: "div_001" },
      coach,
    )
    expect(res.status).toBe(400)
    // A code and the facts, not a sentence. The sentence is written in the
    // reader's language client-side — an English message thrown from here would
    // reach a Thai page untranslated.
    const body = (await res.json()) as {
      code: string
      data: { teamAgeGroup: string; divisionAgeGroup: string }
    }
    expect(body.code).toBe("DIVISION_MISMATCH")
    expect(body.data).toMatchObject({ teamAgeGroup: "U18", divisionAgeGroup: "U16" })
  })

  it("withdrawing something never entered is 404", async () => {
    // Pranom coaches team_002, which is not entered in evt_001 (a TOURNAMENT,
    // so the grant covers it). Permitted to withdraw, nothing to withdraw.
    const coach = await signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_coach_002")!.email)
    const res = await api("/api/events/evt_001/teams/team_002", { method: "DELETE", cookie: coach })
    expect(res.status).toBe(404)
  })

  it("a camp is not something a team enters — the subtype narrows the grant", async () => {
    // Individuals register for camps; REGISTER_TEAM_FOR_EVENT covers
    // tournaments, leagues and showcases only. evt_003 is a CAMP.
    const coach = await signIn(actorFor("COACH"))
    const res = await post(
      "/api/events/evt_003/teams",
      { teamId: "team_001", eventId: "evt_003", divisionId: "div_001" },
      coach,
    )
    expect(res.status).toBe(403)
  })
})

describe("Rosters", () => {
  it("a head coach adds a player, and removing ends the spell rather than deleting it", async () => {
    const coach = await signIn(actorFor("COACH"))
    // ply_003 is not on team_001 in the fixtures.
    const added = await post("/api/teams/team_001/players", { teamId: "team_001", playerId: "ply_003" }, coach)
    expect(added.status).toBe(201)

    const removed = await api("/api/teams/team_001/players/ply_003", { method: "DELETE", cookie: coach })
    expect(removed.status).toBe(200)
    // An end date, not a deletion — last season's team sheet stays true.
    expect(((await removed.json()) as Record<string, unknown>).toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("a coach of another team may not touch this roster", async () => {
    const outsider = await signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_coach_003")!.email)
    const res = await post("/api/teams/team_001/players", { teamId: "team_001", playerId: "ply_003" }, outsider)
    expect(res.status).toBe(403)
  })

  it("an unknown player is 404, not a row nobody asked for", async () => {
    const coach = await signIn(actorFor("COACH"))
    const res = await post("/api/teams/team_001/players", { teamId: "team_001", playerId: "ply_nope" }, coach)
    expect(res.status).toBe(404)
  })
})

describe("Fixtures — the half of scheduling that did not exist", () => {
  /**
   * There was no way to create a game at all before 2026-08-27. An organiser
   * could create an event and register teams, then schedule nothing: the only
   * games in the database came from the seed.
   */
  const niran = () => signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_org_002")!.email)

  it("the event's organiser adds a fixture between two registered teams", async () => {
    const organiser = await niran() // owns evt_002
    const res = await post(
      "/api/events/evt_002/games",
      {
        eventId: "evt_002",
        homeTeamId: "team_001",
        awayTeamId: "team_003",
        startsAt: "2026-09-20T10:00:00Z",
      },
      organiser,
    )
    expect(res.status).toBe(201)
    const game = (await res.json()) as { id: string; statusCode: string; canEnterScore: boolean }
    expect(game.statusCode, "a new fixture has not been played").toBe("SCHEDULED")
    expect(game.canEnterScore, "the organiser may score it too").toBe(true)

    // And it is in the schedule immediately.
    const { games } = (await (await api("/api/games?eventId=evt_002")).json()) as {
      games: { id: string }[]
    }
    expect(games.map((g) => g.id)).toContain(game.id)

    await api(`/api/events/evt_002/games/${game.id}`, { method: "DELETE", cookie: organiser })
  })

  it("refuses a fixture with a team that never entered", async () => {
    const organiser = await niran()
    // evt_001's teams are 001, 003, 004 — team_002 is not among them, and it is
    // not in evt_002 either... it is. Use evt_001 where it genuinely is not.
    const res = await post(
      "/api/events/evt_001/games",
      { eventId: "evt_001", homeTeamId: "team_001", awayTeamId: "team_002", startsAt: "2026-06-12T10:00:00Z" },
      await signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_org_001")!.email),
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("TEAM_NOT_ENTERED")
    expect(organiser).toBeTruthy()
  })

  it("refuses a team playing itself", async () => {
    const organiser = await niran()
    const res = await post(
      "/api/events/evt_002/games",
      { eventId: "evt_002", homeTeamId: "team_001", awayTeamId: "team_001", startsAt: "2026-09-20T10:00:00Z" },
      organiser,
    )
    expect(res.status).toBe(400)
  })

  it("a coach cannot schedule fixtures in someone else's event", async () => {
    const coach = await signIn(actorFor("COACH"))
    const res = await post(
      "/api/events/evt_002/games",
      { eventId: "evt_002", homeTeamId: "team_001", awayTeamId: "team_003", startsAt: "2026-09-20T10:00:00Z" },
      coach,
    )
    expect(res.status).toBe(403)
  })

  it("removing a fixture takes its referee assignments with it", async () => {
    const organiser = await niran()
    const created = await post(
      "/api/events/evt_002/games",
      { eventId: "evt_002", homeTeamId: "team_001", awayTeamId: "team_003", startsAt: "2026-09-21T10:00:00Z" },
      organiser,
    )
    const { id } = (await created.json()) as { id: string }

    expect((await post(`/api/games/${id}/referees`, { id, userId: "usr_referee_001" }, organiser)).status)
      .toBe(201)
    expect((await api(`/api/events/evt_002/games/${id}`, { method: "DELETE", cookie: organiser })).status)
      .toBe(200)
    // The assignment pointed at the game and would otherwise orphan.
    expect((await api(`/api/games/${id}`)).status).toBe(404)
  })
})

describe("Referee assignment", () => {
  const niran = () => signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_org_002")!.email)

  it("the organiser puts a referee on a game, and takes them off", async () => {
    const organiser = await niran()
    // gam_003 has usr_referee_002; add the other one.
    expect((await post("/api/games/gam_003/referees", { id: "gam_003", userId: "usr_referee_001" }, organiser)).status)
      .toBe(201)
    expect(
      (await api("/api/games/gam_003/referees/usr_referee_001", { method: "DELETE", cookie: organiser })).status,
    ).toBe(200)
  })

  it("refuses an account that is not a referee", async () => {
    const organiser = await niran()
    const res = await post(
      "/api/games/gam_003/referees",
      { id: "gam_003", userId: "usr_coach_001" },
      organiser,
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("NOT_A_REFEREE")
  })

  it("a referee cannot assign themselves — that would undo the point", async () => {
    const adisorn = await signIn("adisorn.b@bat.test")
    // He is on gam_001 and gam_002, not gam_003.
    const res = await post(
      "/api/games/gam_003/referees",
      { id: "gam_003", userId: "usr_referee_001" },
      adisorn,
    )
    expect(res.status).toBe(403)
  })
})

describe("The seeded sign-in, and what it deliberately cannot reach", () => {
  /**
   * A fixed code is a published credential: it is in the repo, and where the
   * demo picker is enabled it is on the page. So the only question is what
   * someone can do with one.
   *
   * These run with MAIL_TRANSPORT=outbox, which is the *local* case — the admin
   * keeps its fixed code there, because an outbox is readable only by whoever
   * is running the Worker and the suite needs admin coverage. The deployment
   * case is asserted by cf:smoke, where the outbox does not exist.
   */
  it("only ever applies to a seeded address — a real one gets a random code", async () => {
    const stranger = fresh("outsider")
    await post("/api/auth/email-otp/send-verification-otp", { email: stranger, type: "sign-in" })
    // The fixed code must not work for an address the fixtures do not name.
    const res = await post("/api/auth/sign-in/email-otp", { email: stranger, otp: "424242" })
    expect(res.status, "TEST_OTP is scoped to the seeded set").not.toBe(200)

    // And the real emailed code does.
    const [mail] = await outbox(stranger)
    expect((await post("/api/auth/sign-in/email-otp", { email: stranger, otp: codeFrom(mail!.body) })).status)
      .toBe(200)
  })

  it("lists everyone locally who can actually sign in, admin included", async () => {
    const res = await api("/api/dev/accounts")
    expect(res.status).toBe(200)
    const { accounts, code } = (await res.json()) as {
      accounts: { role: string; email: string; holds: string[] }[]
      code?: string
    }

    // Everyone the guard would let through — not every seeded person. A
    // SUSPENDED or DEACTIVATED account is offered as a one-click sign-in that
    // then 403s and says nothing, which is the failure this list exists to
    // avoid. Derived from the same rule the guard uses, so the two cannot drift.
    const signable = SEED_ENTITIES.users.filter((u) => !isRefusedStatus(u.statusCode))
    expect(accounts).toHaveLength(signable.length)
    expect(signable.length).toBeLessThan(SEED_ENTITIES.users.length)

    // And the refused ones are absent by name, so this cannot pass by counting.
    const refused = SEED_ENTITIES.users.filter((u) => isRefusedStatus(u.statusCode))
    for (const u of refused) {
      expect(accounts.map((a) => a.email), `${u.id} (${u.statusCode})`).not.toContain(u.email)
    }

    expect(accounts.some((a) => a.role === "admin"), "the outbox makes this safe").toBe(true)
    // No published code here: the outbox carries a real generated one instead.
    expect(code).toBeUndefined()
  })

  it("carries what each account holds, so you can pick the right person", async () => {
    const { accounts } = (await (await api("/api/dev/accounts")).json()) as {
      accounts: { email: string; holds: string[] }[]
    }
    const adisorn = accounts.find((a) => a.email === "adisorn.b@bat.test")!
    expect(adisorn.holds).toContain("GAME_REFEREE gam_001")
    // Two referees differ by which game — the difference a role-shaped picker
    // could not show.
    const waraporn = accounts.find((a) => a.email === "waraporn.j@bat.test")!
    expect(waraporn.holds).not.toContain("GAME_REFEREE gam_001")
  })
})

describe("The sign-in email speaks the reader's language", () => {
  /**
   * `Accept-Language` on the OTP request is the browser about to read the code,
   * so it is a real signal — unlike on an invitation, where the recipient is
   * somebody else and the header describes the sender.
   */
  const send = (email: string, acceptLanguage?: string) =>
    api("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      body: JSON.stringify({ email, type: "sign-in" }),
      ...(acceptLanguage ? { headers: { "Accept-Language": acceptLanguage } } : {}),
    })

  it("sends Thai to a browser that asks for Thai", async () => {
    const to = fresh("th")
    await send(to, "th-TH,th;q=0.9,en;q=0.8")
    const [mail] = await outbox(to)
    expect(mail!.subject).toContain("คือรหัสเข้าใช้งาน")
    expect(mail!.body).toContain("รหัสของคุณคือ")
  })

  it("honours quality values rather than reading left to right", async () => {
    // English first in the list, Thai preferred. Taking the first tag would
    // answer English and be wrong.
    const to = fresh("q")
    await send(to, "en;q=0.5,th;q=0.9")
    const [mail] = await outbox(to)
    expect(mail!.subject).toContain("คือรหัสเข้าใช้งาน")
  })

  it("ignores a region and a language the product does not offer", async () => {
    const to = fresh("region")
    await send(to, "en-GB")
    expect((await outbox(to))[0]!.subject).toMatch(/is your Remy Sport code$/)

    const other = fresh("fr")
    await send(other, "fr-FR,fr;q=0.9")
    // Not nothing, and not French: the base locale.
    expect((await outbox(other))[0]!.subject).toMatch(/is your Remy Sport code$/)
  })

  it("falls back to English when the header is absent", async () => {
    const to = fresh("none")
    await send(to)
    expect((await outbox(to))[0]!.subject).toMatch(/is your Remy Sport code$/)
  })

  it("still carries a usable code, whatever the language", async () => {
    const to = fresh("usable")
    await send(to, "th")
    const [mail] = await outbox(to)
    const code = mail!.body.match(/(\d{6})/)?.[1]
    expect(code, "the code survives translation").toBeTruthy()
    expect((await post("/api/auth/sign-in/email-otp", { email: to, otp: code })).status).toBe(200)
  })
})

describe("Accepting an invitation to co-organise", () => {
  /**
   * The consequence, not the click. Accepting writes ACCEPTED, which is what
   * the CO_ORGANIZER relation filters on, which is what makes EDIT_EVENT true,
   * which is what puts the event under "Your events". Every step of that is the
   * database's answer, and it is the reason a pending invitation is worth
   * having a screen for at all.
   *
   * Here rather than in an e2e because `isolatedStorage` gives this file its
   * own D1: accepting is a one-way door — the PO's model has no revoke action —
   * so against a shared database the test would pass once and then assert
   * nothing forever.
   *
   * Derived from the fixtures, so a re-seed cannot make it pass by coincidence.
   */
  const pending = SEED_RELATIONSHIPS.eventCoOrganizers.find((c) => c.statusCode === "PENDING")!
  const invitee = SEED_ENTITIES.users.find((u) => u.id === pending.userId)!

  const canEdit = async (cookie: string, eventId: string) => {
    const { events } = (await (await api("/api/events", { cookie })).json()) as {
      events: { id: string; canEdit: boolean }[]
    }
    return events.find((e) => e.id === eventId)?.canEdit
  }

  it("turns an invitation into the right to edit the event", async () => {
    const cookie = await signIn(invitee.email)

    // The invitation is visible to its invitee, and grants nothing yet. Both
    // halves matter: a PENDING row that already granted EDIT_EVENT would make
    // the accept a formality and the whole state meaningless.
    const before = (await (await api("/api/events/invitations", { cookie })).json()) as {
      invitations: { eventId: string }[]
    }
    expect(before.invitations.map((i) => i.eventId)).toContain(pending.eventId)
    expect(await canEdit(cookie, pending.eventId)).toBe(false)

    const res = await post(`/api/events/${pending.eventId}/co-organizers/accept`, {}, cookie)
    expect(res.status, "accepting an invitation addressed to you").toBe(200)

    expect(await canEdit(cookie, pending.eventId), "ACCEPTED grants CO_ORGANIZER").toBe(true)
    // And it stops being an outstanding invitation, so the list is things to
    // act on rather than a history.
    const after = (await (await api("/api/events/invitations", { cookie })).json()) as {
      invitations: { eventId: string }[]
    }
    expect(after.invitations.map((i) => i.eventId)).not.toContain(pending.eventId)
  })

  it("refuses an invitation addressed to somebody else", async () => {
    // The row is what stands in for a relation here — an invitee is by
    // definition not yet related to the event — so "only yours" is the entire
    // authorisation, and it is enforced by the WHERE clause rather than by the
    // model. That makes it worth an explicit test.
    const stranger = SEED_ENTITIES.users.find(
      (u) => u.roleCode === "SPECTATOR" && u.statusCode === "ACTIVE",
    )!
    const cookie = await signIn(stranger.email)
    const res = await post(`/api/events/${pending.eventId}/co-organizers/accept`, {}, cookie)
    expect(res.status, "there is no invitation to accept").not.toBe(200)
    expect(await canEdit(cookie, pending.eventId)).toBe(false)
  })

  it("shows nobody else's invitations", async () => {
    const stranger = SEED_ENTITIES.users.find(
      (u) => u.roleCode === "SPECTATOR" && u.statusCode === "ACTIVE",
    )!
    const cookie = await signIn(stranger.email)
    const { invitations } = (await (
      await api("/api/events/invitations", { cookie })
    ).json()) as { invitations: unknown[] }
    expect(invitations).toHaveLength(0)
  })
})

describe("Inviting a co-organiser by email", () => {
  /**
   * The invite takes an email as well as a user id, the way `orgs.addMember`
   * does, because nobody knows another person's id — and the only way to offer
   * one from a screen would be a searchable directory of everybody on the
   * platform, which is not a surface this product should grow to power an
   * invite box.
   */
  const owned = SEED_ENTITIES.events[0]!
  const owner = SEED_ENTITIES.users.find((u) => u.id === owned.organizerUserId)!

  /** Somebody with no relation to this event, so the invite is a real change. */
  const outsider = SEED_ENTITIES.users.find(
    (u) => u.roleCode === "SPECTATOR" && u.statusCode === "ACTIVE",
  )!

  it("creates a pending invitation the invitee can then see", async () => {
    const cookie = await signIn(owner.email)
    const res = await post(
      `/api/events/${owned.id}/co-organizers`,
      { email: outsider.email },
      cookie,
    )
    expect(res.status, "an owner may invite").toBe(201)

    // PENDING, so it grants nothing yet — and it is visible to the person it
    // was addressed to, which is the whole point of the read added alongside.
    const theirs = await signIn(outsider.email)
    const { invitations } = (await (
      await api("/api/events/invitations", { cookie: theirs })
    ).json()) as { invitations: { eventId: string }[] }
    expect(invitations.map((i) => i.eventId)).toContain(owned.id)

    const { events } = (await (await api("/api/events", { cookie: theirs })).json()) as {
      events: { id: string; canEdit: boolean }[]
    }
    expect(
      events.find((e) => e.id === owned.id)?.canEdit,
      "an unaccepted invitation grants nothing",
    ).toBe(false)
  })

  it("refuses an address nobody has", async () => {
    const cookie = await signIn(owner.email)
    const res = await post(
      `/api/events/${owned.id}/co-organizers`,
      { email: "nobody@nowhere.test" },
      cookie,
    )
    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe("UNKNOWN_USER")
  })

  it("refuses both an email and an id at once, rather than picking one", () => {
    // Silently preferring one would make the other look like it worked.
    return signIn(owner.email).then(async (cookie) => {
      const res = await post(
        `/api/events/${owned.id}/co-organizers`,
        { email: outsider.email, userId: outsider.id },
        cookie,
      )
      expect(res.status).toBe(400)
    })
  })

  it("is not something a co-organiser may do", async () => {
    /**
     * The grant this separates. EDIT_EVENT includes CO_ORGANIZER;
     * INVITE_CO_ORGANIZER does not — deciding who else runs an event is not
     * delegated by having been delegated to. Without this test the two flags
     * agree for every owner, so nothing would notice them being conflated.
     */
    const accepted = SEED_RELATIONSHIPS.eventCoOrganizers.find(
      (c) => c.statusCode === "ACCEPTED",
    )!
    const coOrganiser = SEED_ENTITIES.users.find((u) => u.id === accepted.userId)!
    const cookie = await signIn(coOrganiser.email)

    // They really can edit — otherwise this would pass for the wrong reason.
    const { events } = (await (await api("/api/events", { cookie })).json()) as {
      events: { id: string; canEdit: boolean; canInviteCoOrganizer: boolean }[]
    }
    const row = events.find((e) => e.id === accepted.eventId)!
    expect(row.canEdit, "a co-organiser may edit").toBe(true)
    expect(row.canInviteCoOrganizer, "and may not recruit").toBe(false)

    const res = await post(
      `/api/events/${accepted.eventId}/co-organizers`,
      { email: outsider.email },
      cookie,
    )
    expect(res.status, "the API must agree with the flag").toBe(403)
  })
})

describe("Entering a player into an event", () => {
  /**
   * `eventPlayer` was the only table in the model with neither an API nor a
   * screen, and `REGISTER_PLAYER_FOR_EVENT` had nothing behind it.
   *
   * The grant is **conditional** and that is the whole reason this describe
   * block is worth its length: SELF and GUARDIAN hold it only for CAMP and
   * SHOWCASE. A tournament or a league is entered by a *team* — a parent cannot
   * put their child into the Bangkok Schools League, because the league plays
   * teams and the team's coach enters it.
   *
   * The types come from the fixtures rather than being written here, so a PO
   * who reclassifies an event moves this test with it.
   */
  const guardianship = SEED_RELATIONSHIPS.guardians[0]!
  const parent = SEED_ENTITIES.users.find((u) => u.id === guardianship.userId)!
  const byType = (t: string) => SEED_ENTITIES.events.find((e) => e.typeCode === t)!

  const register = (eventId: string, cookie: string) =>
    post(`/api/events/${eventId}/players`, { eventId, playerId: guardianship.playerId }, cookie)

  it("lets a guardian enter their child in a camp", async () => {
    const cookie = await signIn(parent.email)
    const res = await register(byType("CAMP").id, cookie)
    expect(res.status, "CAMP is in the grant's eventTypes").toBe(201)
  })

  it("and in a showcase", async () => {
    const cookie = await signIn(parent.email)
    expect((await register(byType("SHOWCASE").id, cookie)).status).toBe(201)
  })

  it("refuses a tournament, which teams enter and individuals do not", async () => {
    // The conditional half. If `eventFrom` were omitted the resolver would have
    // no event to narrow against, every eventTypes grant would be skipped, and
    // this would pass for the wrong reason — by denying everybody, everywhere.
    const cookie = await signIn(parent.email)
    expect((await register(byType("TOURNAMENT").id, cookie)).status).toBe(403)
  })

  it("refuses a league for the same reason", async () => {
    const cookie = await signIn(parent.email)
    expect((await register(byType("LEAGUE").id, cookie)).status).toBe(403)
  })

  it("refuses somebody who is not this child's guardian, even for a camp", async () => {
    const stranger = SEED_ENTITIES.users.find(
      (u) => u.roleCode === "REFEREE" && u.statusCode === "ACTIVE",
    )!
    const cookie = await signIn(stranger.email)
    expect((await register(byType("CAMP").id, cookie)).status).toBe(403)
  })

  it("is idempotent, and withdrawing puts it back", async () => {
    const cookie = await signIn(parent.email)
    const camp = byType("CAMP").id
    expect((await register(camp, cookie)).status).toBe(201)
    // The unique index is on (event, player): pressing twice is a no-op rather
    // than a second row or a 500.
    expect((await register(camp, cookie)).status).toBe(201)

    const res = await api(`/api/events/${camp}/players/${guardianship.playerId}`, {
      method: "DELETE",
      cookie,
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { withdrawn: boolean }).withdrawn).toBe(true)
  })
})

describe("Correcting a player's profile", () => {
  const guardianship = SEED_RELATIONSHIPS.guardians[0]!
  const parent = SEED_ENTITIES.users.find((u) => u.id === guardianship.userId)!

  it("lets a guardian change the squad number and position", async () => {
    const cookie = await signIn(parent.email)
    const res = await api(`/api/players/${guardianship.playerId}`, {
      method: "PUT",
      body: JSON.stringify({ id: guardianship.playerId, jerseyNumber: 42, positionCode: "SG" }),
      cookie,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { jerseyNumber: number; positionCode: string }
    expect(body.jerseyNumber).toBe(42)
    expect(body.positionCode).toBe("SG")
  })

  it("refuses somebody with no relation to the player", async () => {
    const stranger = SEED_ENTITIES.users.find(
      (u) => u.roleCode === "REFEREE" && u.statusCode === "ACTIVE",
    )!
    const cookie = await signIn(stranger.email)
    const res = await api(`/api/players/${guardianship.playerId}`, {
      method: "PUT",
      body: JSON.stringify({ id: guardianship.playerId, jerseyNumber: 1 }),
      cookie,
    })
    expect(res.status).toBe(403)
  })

  it("refuses a squad number that is not one", async () => {
    // FIBA allows 0-99 and the column is a plain integer, so the schema is the
    // only place that rule exists.
    const cookie = await signIn(parent.email)
    for (const n of [-1, 100]) {
      const res = await api(`/api/players/${guardianship.playerId}`, {
        method: "PUT",
        body: JSON.stringify({ id: guardianship.playerId, jerseyNumber: n }),
        cookie,
      })
      expect(res.status, `jersey ${n}`).toBe(400)
    }
  })

  it("keeps the other languages when only one name is sent", async () => {
    // `player` has no `name` pivot column — event, team and org all do — so an
    // earlier version wrote one by habit and would have failed at the database.
    const cookie = await signIn(parent.email)
    const res = await api(`/api/players/${guardianship.playerId}`, {
      method: "PUT",
      body: JSON.stringify({
        id: guardianship.playerId,
        names: { en: "Renamed Player", th: "ชื่อไทย" },
      }),
      cookie,
    })
    expect(res.status).toBe(200)
    const { names } = (await res.json()) as { names: Record<string, string> }
    expect(names.en).toBe("Renamed Player")
    expect(names.th).toBe("ชื่อไทย")
  })
})

describe("Creating a player", () => {
  /**
   * Until 2026-08-31 there was no way to make one.
   *
   * The players API was `mine`, `update`, `registerForEvent` and
   * `withdrawFromEvent`, so every player on the platform came from the seed —
   * and the whole guardian thread built on top of it (the Your Players card,
   * the edit form, entering a child in a camp) sat on rows nobody could create.
   * A real parent signed in to an empty list with no way to fill it.
   *
   * The model has two actions for this and grants them to different people, so
   * these are two procedures rather than one with a flag.
   */
  const child = {
    names: { en: "Ploy Suksawat" },
    dob: "2012-04-18",
    jerseyNumber: 12,
    positionCode: "PG",
  }

  const myPlayers = async (cookie: string) =>
    (await (await api("/api/players/mine", { cookie })).json()) as {
      players: { playerId: string; guardianTypeCode: string | null }[]
    }

  it("lets a guardian sign up a child, and the child is then theirs", async () => {
    // The round trip that matters: create, then find it through the relation.
    // `players.mine` resolves via objectsHeldBy("GUARDIAN"), so this passes only
    // if the guardian row was written with the player.
    const parent = SEED_ENTITIES.users.find((u) => u.roleCode === "SPECTATOR" && u.statusCode === "ACTIVE")!
    const cookie = await signIn(parent.email)

    const before = (await myPlayers(cookie)).players.length
    const res = await post("/api/players/mine", { ...child, guardianTypeCode: "PARENT" }, cookie)
    expect(res.status).toBe(201)
    const created = (await res.json()) as { playerId: string }

    const after = await myPlayers(cookie)
    expect(after.players.length).toBe(before + 1)
    const found = after.players.find((p) => p.playerId === created.playerId)
    expect(found, "the child they just signed up should be on their own list").toBeTruthy()
    expect(found!.guardianTypeCode).toBe("PARENT")
  })

  it("gives the child to that guardian and to nobody else", async () => {
    // The assertion that catches a missing guardian row, which otherwise looks
    // exactly like success: the create returns 201 either way.
    const parent = SEED_ENTITIES.users.find((u) => u.roleCode === "SPECTATOR" && u.statusCode === "ACTIVE")!
    const other = SEED_ENTITIES.users.find(
      (u) => u.roleCode === "REFEREE" && u.statusCode === "ACTIVE",
    )!

    const res = await post(
      "/api/players/mine",
      { ...child, names: { en: "Kan Wattana" }, guardianTypeCode: "LEGAL_GUARDIAN" },
      await signIn(parent.email),
    )
    expect(res.status).toBe(201)
    const created = (await res.json()) as { playerId: string }

    const theirs = await myPlayers(await signIn(other.email))
    expect(theirs.players.map((p) => p.playerId)).not.toContain(created.playerId)
  })

  it("lets a coach create a player without making them its guardian", async () => {
    // CREATE_PLAYER is the coach's action: it makes the person, and putting
    // them in a squad is MANAGE_ROSTER on a team. No guardianship is implied —
    // a coach is not a parent.
    const coach = await signIn(actorFor("COACH"))
    const res = await post("/api/players", { ...child, names: { en: "Anucha P." } }, coach)
    expect(res.status).toBe(201)
    const created = (await res.json()) as { playerId: string }

    const theirs = await myPlayers(coach)
    expect(
      theirs.players.map((p) => p.playerId),
      "creating a player is not becoming their guardian",
    ).not.toContain(created.playerId)
  })

  it("refuses a spectator the coach's action, while allowing them the parent's", async () => {
    // The pair that proves the two actions are not interchangeable.
    // CREATE_PLAYER is ANY_COACH / ANY_PLAYER / PLATFORM_ADMIN;
    // SIGN_UP_PLAYER_AS_GUARDIAN is ANY_SIGNED_IN, because any parent may
    // register their own child whatever else they are.
    const cookie = await signIn(actorFor("SPECTATOR"))
    expect((await post("/api/players", { ...child, names: { en: "No" } }, cookie)).status).toBe(403)
    expect(
      (await post("/api/players/mine", { ...child, names: { en: "Yes" }, guardianTypeCode: "PARENT" }, cookie)).status,
    ).toBe(201)
  })

  it("refuses an anonymous caller either way", async () => {
    expect((await post("/api/players", child)).status).toBe(401)
    expect((await post("/api/players/mine", { ...child, guardianTypeCode: "PARENT" })).status).toBe(401)
  })

  it("will not take a birth date that is not one", async () => {
    // `dob` decides age-group eligibility and the edit form deliberately cannot
    // change it, so creation is the only place it is ever set.
    const cookie = await signIn(actorFor("COACH"))
    const res = await post("/api/players", { ...child, dob: "18/04/2012" }, cookie)
    expect(res.status).toBe(400)
  })
})

describe("Approving a referee", () => {
  /**
   * `PENDING_APPROVAL` has been a real state since migration 0008 and nothing
   * could leave it. A referee signs up, can sign in — deliberately, so they can
   * see they are waiting — and then waits forever, because `APPROVE_REFEREE`
   * was granted to PLATFORM_ADMIN and had no endpoint at all.
   *
   * Derived from the fixtures rather than naming an id, so a re-seed cannot make
   * these pass by coincidence.
   */
  const pending = SEED_ENTITIES.users.find(
    (u) => u.roleCode === "REFEREE" && u.statusCode === "PENDING_APPROVAL",
  )!
  const approve = (id: string, cookie?: string) =>
    post(`/api/admin/referees/${id}/approve`, {}, cookie)

  it("the fixtures seed somebody actually waiting", () => {
    // If this stops being true the rest of the describe is vacuous.
    expect(pending, "a referee awaiting approval").toBeTruthy()
  })

  it("lets an admin approve them, and the change sticks", async () => {
    const admin = await signIn(actorFor("ADMIN"))
    const res = await approve(pending.id, admin)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { statusCode: string }).statusCode).toBe("ACTIVE")

    // Read back through a different route, so this asserts the write and not
    // the handler's own return value.
    const users = (await (
      await api("/api/auth/admin/list-users?limit=50", { cookie: admin })
    ).json()) as { users?: { id: string; statusCode?: string }[] }
    const row = users.users?.find((u) => u.id === pending.id)
    expect(row?.statusCode, "the approval should be stored, not just returned").toBe("ACTIVE")
  })

  it("refuses anyone who is not a platform admin", async () => {
    // APPROVE_REFEREE is granted to PLATFORM_ADMIN and to nobody else — not to
    // an organiser, and not to another referee.
    for (const role of ["ORGANIZER", "COACH", "REFEREE"]) {
      const res = await approve(pending.id, await signIn(actorFor(role)))
      expect(res.status, `${role} must not approve referees`).toBe(403)
    }
  })

  it("refuses an anonymous caller", async () => {
    expect((await approve(pending.id)).status).toBe(401)
  })

  it("refuses an account that is not a referee", async () => {
    // The model grants "approve a referee", not "set any account's status". A
    // handler that took a status would be a larger power than the action names.
    const coach = SEED_ENTITIES.users.find((u) => u.roleCode === "COACH")!
    const res = await approve(coach.id, await signIn(actorFor("ADMIN")))
    expect(res.status).toBe(400)
  })

  it("404s an account that does not exist", async () => {
    const res = await approve("usr_nope", await signIn(actorFor("ADMIN")))
    expect(res.status).toBe(404)
  })
})

describe("A fixture cannot cross a division", () => {
  /**
   * Until 2026-08-31 it could. `games.create` checked that a team was not
   * playing itself and that both were entered, and nothing else — so a U16
   * boys' team could be scheduled against a U18 girls' team in a league whose
   * whole structure is divisions. Confirmed against a running server, which
   * answered 201.
   *
   * Every other piece of the rule already existed: `eventTeam` is keyed on
   * (event, team, division), and registration refuses a team whose age group or
   * gender does not match the division it enters. Only the fixture was
   * unguarded.
   *
   * Pairs are derived from the fixtures rather than named, so a re-seed cannot
   * make this pass by picking two teams that happen to agree.
   */
  const EVENT = "evt_002"
  const inEvent = SEED_RELATIONSHIPS.eventTeams.filter((t) => t.eventId === EVENT)
  const divisionsOf = (teamId: string) =>
    inEvent.filter((t) => t.teamId === teamId).map((t) => t.divisionId as string)

  const teams = [...new Set(inEvent.map((t) => t.teamId as string))]
  const crossing = teams
    .flatMap((a) => teams.map((b) => [a, b] as const))
    .find(([a, b]) => a !== b && !divisionsOf(a).some((d) => divisionsOf(b).includes(d)))
  const sharing = teams
    .flatMap((a) => teams.map((b) => [a, b] as const))
    .find(([a, b]) => a !== b && divisionsOf(a).some((d) => divisionsOf(b).includes(d)))

  const organiser = SEED_ENTITIES.users.find(
    (u) => u.id === SEED_ENTITIES.events.find((e) => e.id === EVENT)!.organizerUserId,
  )!

  const fixture = (home: string, away: string, cookie: string) =>
    post(
      `/api/events/${EVENT}/games`,
      { eventId: EVENT, homeTeamId: home, awayTeamId: away, startsAt: "2026-07-01T10:00:00.000Z", venueId: null },
      cookie,
    )

  it("the fixtures give us a crossing pair and a sharing pair", () => {
    // Without both, the two assertions below are vacuous.
    expect(crossing, "two teams in different divisions of the same event").toBeTruthy()
    expect(sharing, "two teams sharing a division").toBeTruthy()
  })

  it("refuses two teams with no division in common", async () => {
    const cookie = await signIn(organiser.email)
    const res = await fixture(crossing![0], crossing![1], cookie)
    expect(res.status, `${crossing![0]} v ${crossing![1]} cross divisions`).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe("TEAMS_IN_DIFFERENT_DIVISIONS")
  })

  it("still allows two teams that share one", async () => {
    // The half that stops this passing by refusing everything.
    const cookie = await signIn(organiser.email)
    const res = await fixture(sharing![0], sharing![1], cookie)
    expect(res.status).toBe(201)
  })

  it("refuses a reschedule that changes only one side into another division", async () => {
    // The way round the rule if it were enforced on create alone: leave the
    // fixture, swap one team. The input is partial, so the stored row supplies
    // the side that was not sent.
    const cookie = await signIn(organiser.email)
    const created = await fixture(sharing![0], sharing![1], cookie)
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }

    const res = await SELF.fetch(`${ORIGIN}/api/events/${EVENT}/games/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie, origin: ORIGIN },
      body: JSON.stringify({ id, eventId: EVENT, homeTeamId: crossing![0], awayTeamId: crossing![1] }),
    })
    expect(res.status).toBe(400)
  })
})

describe("Generating a schedule", () => {
  /**
   * An organiser registered fifteen teams and then typed the fixtures into a
   * form one at a time. `GENERATE_FIXTURES` is the model's answer and had no
   * endpoint.
   *
   * The interesting assertions are not "it made some games" — they are that it
   * respects divisions, that running it twice is not a double schedule, and
   * that it is refused where the model does not grant it.
   */
  const EVENT = "evt_002"
  const inEvent = SEED_RELATIONSHIPS.eventTeams.filter((t) => t.eventId === EVENT)
  const organiser = SEED_ENTITIES.users.find(
    (u) => u.id === SEED_ENTITIES.events.find((e) => e.id === EVENT)!.organizerUserId,
  )!

  /** What a per-division round robin comes to, from the fixtures themselves. */
  const expectedPairs = () => {
    const byDivision = new Map<string, Set<string>>()
    for (const t of inEvent) {
      const set = byDivision.get(t.divisionId as string) ?? new Set<string>()
      set.add(t.teamId as string)
      byDivision.set(t.divisionId as string, set)
    }
    const pairs = new Set<string>()
    for (const teams of byDivision.values()) {
      const list = [...teams]
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) pairs.add([list[i]!, list[j]!].sort().join("|"))
      }
    }
    return pairs
  }

  const generate = (cookie: string, eventId = EVENT) =>
    post(`/api/events/${eventId}/games/generate`, { eventId, startDate: "2026-10-03" }, cookie)

  const gamesOf = async (eventId: string) =>
    (
      (await (await api(`/api/games?eventId=${eventId}`)).json()) as {
        games: { homeTeamId: string; awayTeamId: string; startsAt: string }[]
      }
    ).games

  it("fills the division round robins, leaving the fixtures already there alone", async () => {
    const cookie = await signIn(organiser.email)
    const before = await gamesOf(EVENT)

    const res = await generate(cookie)
    expect(res.status).toBe(201)
    const { created, skipped } = (await res.json()) as { created: number; skipped: number }

    const after = await gamesOf(EVENT)
    expect(after.length).toBe(before.length + created)
    // Every pairing the divisions imply now exists, and the count adds up
    // against what was already there rather than against a number typed here.
    expect(created + skipped).toBe(expectedPairs().size)
  })

  it("never pairs two teams across divisions", async () => {
    // Read back and checked, not trusted: the generator is exactly the code
    // that could reintroduce the bug the guard above exists for.
    const cookie = await signIn(organiser.email)
    await generate(cookie)

    const divisionsOf = (teamId: string) =>
      inEvent.filter((t) => t.teamId === teamId).map((t) => t.divisionId as string)
    for (const g of await gamesOf(EVENT)) {
      const shared = divisionsOf(g.homeTeamId).some((d) => divisionsOf(g.awayTeamId).includes(d))
      expect(shared, `${g.homeTeamId} v ${g.awayTeamId} share no division`).toBe(true)
    }
  })

  it("is idempotent — running it again adds nothing", async () => {
    // The claim most likely to be wrong, so it is asserted rather than argued.
    const cookie = await signIn(organiser.email)
    await generate(cookie)
    const between = (await gamesOf(EVENT)).length

    const again = await generate(cookie)
    const { created } = (await again.json()) as { created: number }
    expect(created, "a second run should add no fixtures").toBe(0)
    expect((await gamesOf(EVENT)).length).toBe(between)
  })

  it("spreads rounds across dates rather than stacking one day", async () => {
    // A schedule, not a list: nobody plays twice in a round, so the rounds have
    // to land on different days for that to mean anything.
    const cookie = await signIn(organiser.email)
    await generate(cookie)
    const days = new Set((await gamesOf(EVENT)).map((g) => g.startsAt.slice(0, 10)))
    expect(days.size).toBeGreaterThan(1)
  })

  it("refuses somebody who does not run the event", async () => {
    const res = await generate(await signIn(actorFor("COACH")))
    expect(res.status).toBe(403)
  })

  it("refuses a camp, which the model does not grant it for", async () => {
    // GENERATE_FIXTURES is TOURNAMENT and LEAGUE only. A camp has
    // DEFINE_SESSION_SCHEDULE, which is a different shape entirely.
    const camp = SEED_ENTITIES.events.find((e) => e.typeCode === "CAMP")
    expect(camp, "the fixtures seed a camp").toBeTruthy()
    const owner = SEED_ENTITIES.users.find((u) => u.id === camp!.organizerUserId)!
    const res = await generate(await signIn(owner.email), camp!.id)
    expect(res.status).toBe(403)
  })
})

describe("The divisions an event runs", () => {
  /**
   * `MANAGE_DIVISIONS` is an EVENT action and the `division` table is global,
   * which made it look unbuildable — "manage my event's divisions" reading as
   * "edit rows every other event points at".
   *
   * It is not what the model means. A division is a classification: an age
   * group, a gender, a skill tier and a name. "U16 Boys" is the same thing in
   * every tournament, so that table is rightly global. What belongs to an event
   * is which of them it *runs*, and that had nowhere to live — it was inferred
   * from whoever registered.
   */
  const EVENT = "evt_002"
  const organiser = SEED_ENTITIES.users.find(
    (u) => u.id === SEED_ENTITIES.events.find((e) => e.id === EVENT)!.organizerUserId,
  )!
  const runs = [
    ...new Set(
      SEED_RELATIONSHIPS.eventTeams
        .filter((t) => t.eventId === EVENT)
        .map((t) => t.divisionId as string),
    ),
  ]

  const entries = async (cookie: string, eventId = EVENT) =>
    (await (await api(`/api/events/${eventId}/teams`, { cookie })).json()) as {
      divisions: { id: string }[]
    }

  const setDivisions = (divisionIds: string[], cookie: string, eventId = EVENT) =>
    SELF.fetch(`${ORIGIN}/api/events/${eventId}/divisions`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie, origin: ORIGIN },
      body: JSON.stringify({ id: eventId, divisionIds }),
    })

  it("starts as exactly the divisions its teams are already in", async () => {
    // The migration and the derived seed must change nothing observable: an
    // event runs today what its registrations always implied.
    const cookie = await signIn(organiser.email)
    const { divisions } = await entries(cookie)
    expect(divisions.map((d) => d.id).sort()).toEqual([...runs].sort())
  })

  it("offers registration only those, not every division on the platform", async () => {
    // The symptom that made the design obvious: this used to be
    // `db.query.division.findMany()`, so a Bangkok league offered divisions
    // created for somebody else's tournament.
    const all = (await (await api("/api/divisions")).json()) as { items: { id: string }[] }
    expect(all.items.length, "the platform has more divisions than this event runs")
      .toBeGreaterThan(runs.length)

    const { divisions } = await entries(await signIn(organiser.email))
    expect(divisions.length).toBe(runs.length)
  })

  it("refuses a team entered into a division the event does not run", async () => {
    // A coach, not the organiser: REGISTER_TEAM_FOR_EVENT is granted to the
    // team's own coaches, so the organiser gets a 403 before the division is
    // ever looked at.
    const coach = SEED_ENTITIES.users.find(
      (u) => u.roleCode === "COACH" && SEED_RELATIONSHIPS.teamCoaches.some((c) => c.userId === u.id),
    )!
    const cookie = await signIn(coach.email)
    const notRun = (
      (await (await api("/api/divisions")).json()) as { items: { id: string }[] }
    ).items.find((d) => !runs.includes(d.id))!
    expect(notRun, "a division this event does not run").toBeTruthy()

    // Every seeded team is already in this event, and `eventTeam` is keyed on
    // (event, team, division) — so entering one of this coach's teams into a
    // *new* division is a legitimate request, and the right one to refuse here.
    const team = SEED_RELATIONSHIPS.teamCoaches.find((c) => c.userId === coach.id)!.teamId
    const res = await post(
      `/api/events/${EVENT}/teams`,
      { eventId: EVENT, teamId: team, divisionId: notRun.id },
      cookie,
    )
    expect(res.status).toBe(404)
  })

  it("lets the organiser add one, and it shows up for registration", async () => {
    const cookie = await signIn(organiser.email)
    const extra = (
      (await (await api("/api/divisions")).json()) as { items: { id: string }[] }
    ).items.find((d) => !runs.includes(d.id))!

    const res = await setDivisions([...runs, extra.id], cookie)
    expect(res.status).toBe(200)

    const { divisions } = await entries(cookie)
    expect(divisions.map((d) => d.id)).toContain(extra.id)
  })

  it("refuses to drop a division that has teams in it", async () => {
    // Dropping it would orphan eventTeam rows — silently unregistering people
    // from an event they entered.
    //
    // Reads the current set first rather than assuming it: an earlier test in
    // this file adds a division, and tests in one worker file share a database.
    const cookie = await signIn(organiser.email)
    const before = (await entries(cookie)).divisions.map((d) => d.id)

    const res = await setDivisions([runs[0]!], cookie)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe("DIVISION_IN_USE")

    // And nothing moved.
    expect((await entries(cookie)).divisions.map((d) => d.id).sort()).toEqual(before.sort())
  })

  it("refuses somebody who does not run the event", async () => {
    expect((await setDivisions(runs, await signIn(actorFor("COACH")))).status).toBe(403)
  })

  it("refuses a camp, which the model does not grant it for", async () => {
    // MANAGE_DIVISIONS is TOURNAMENT, LEAGUE and SHOWCASE. A camp has
    // DEFINE_SESSION_SCHEDULE instead — sessions, not divisions.
    const camp = SEED_ENTITIES.events.find((e) => e.typeCode === "CAMP")!
    const owner = SEED_ENTITIES.users.find((u) => u.id === camp.organizerUserId)!
    const res = await setDivisions([], await signIn(owner.email), camp.id)
    expect(res.status).toBe(403)
  })
})

describe("A camp's session schedule", () => {
  /**
   * A camp is skill training, not competition — the model's own description —
   * so it has no fixtures. It has sessions, and `DEFINE_SESSION_SCHEDULE` had no
   * endpoint: an organiser could create a camp, watch children register, and had
   * no way to say when anyone should turn up. Three are registered to evt_003
   * in the fixtures, so the dead end was reachable.
   */
  const camp = SEED_ENTITIES.events.find((e) => e.typeCode === "CAMP")!
  const league = SEED_ENTITIES.events.find((e) => e.typeCode === "LEAGUE")!
  const owner = (eventId: string) =>
    SEED_ENTITIES.users.find(
      (u) => u.id === SEED_ENTITIES.events.find((e) => e.id === eventId)!.organizerUserId,
    )!

  const session = (over: Record<string, unknown> = {}) => ({
    eventId: camp.id,
    names: { en: "Shooting fundamentals" },
    startsAt: "2026-07-06T09:00:00.000Z",
    endsAt: "2026-07-06T11:00:00.000Z",
    ...over,
  })

  const add = (body: Record<string, unknown>, cookie?: string) =>
    post(`/api/events/${body.eventId}/sessions`, body, cookie)

  const list = async (eventId: string, cookie?: string) =>
    (await (await api(`/api/events/${eventId}/sessions`, cookie ? { cookie } : {})).json()) as {
      sessions: { id: string; names: Record<string, string>; startsAt: string }[]
      canDefine: boolean
    }

  it("lets the camp's organiser add one, and anybody read it", async () => {
    const cookie = await signIn(owner(camp.id).email)
    const res = await add(session(), cookie)
    expect(res.status).toBe(201)

    // Public: a parent deciding whether to enter their child reads the
    // timetable before they register, so this must answer without a session.
    const { sessions, canDefine } = await list(camp.id)
    expect(sessions.map((s) => s.names.en)).toContain("Shooting fundamentals")
    expect(canDefine, "an anonymous reader may not define").toBe(false)
  })

  it("tells the organiser they may define, and a stranger they may not", async () => {
    expect((await list(camp.id, await signIn(owner(camp.id).email))).canDefine).toBe(true)
    expect((await list(camp.id, await signIn(actorFor("SPECTATOR")))).canDefine).toBe(false)
  })

  it("refuses a coach — they record attendance, they do not move the timetable", async () => {
    // The model draws this line itself: DEFINE_SESSION_SCHEDULE is OWNER,
    // CO_ORGANIZER and PLATFORM_ADMIN, while RECORD_ATTENDANCE adds HEAD_COACH
    // and ASSISTANT_COACH. Collapsing the two would hand coaches the schedule.
    const res = await add(session(), await signIn(actorFor("COACH")))
    expect(res.status).toBe(403)
  })

  it("refuses a league, which has fixtures rather than sessions", async () => {
    const res = await add(
      session({ eventId: league.id }),
      await signIn(owner(league.id).email),
    )
    expect(res.status).toBe(403)
  })

  it("refuses a block that ends before it starts", async () => {
    const cookie = await signIn(owner(camp.id).email)
    const res = await add(
      session({ startsAt: "2026-07-06T11:00:00.000Z", endsAt: "2026-07-06T09:00:00.000Z" }),
      cookie,
    )
    expect(res.status).toBe(400)
  })

  it("removes one, and only the organiser can", async () => {
    const cookie = await signIn(owner(camp.id).email)
    const created = await add(session({ names: { en: "Defence" } }), cookie)
    const { id } = (await created.json()) as { id: string }

    const asCoach = await SELF.fetch(`${ORIGIN}/api/events/${camp.id}/sessions/${id}`, {
      method: "DELETE",
      headers: { cookie: await signIn(actorFor("COACH")), origin: ORIGIN },
    })
    expect(asCoach.status).toBe(403)

    const asOwner = await SELF.fetch(`${ORIGIN}/api/events/${camp.id}/sessions/${id}`, {
      method: "DELETE",
      headers: { cookie, origin: ORIGIN },
    })
    expect(asOwner.status).toBe(200)
    expect((await list(camp.id)).sessions.map((s) => s.id)).not.toContain(id)
  })

  it("reads forwards, whatever order they were added", async () => {
    // A timetable that is not in time order is a list.
    const cookie = await signIn(owner(camp.id).email)
    await add(session({ names: { en: "Late" }, startsAt: "2026-07-08T09:00:00.000Z", endsAt: "2026-07-08T11:00:00.000Z" }), cookie)
    await add(session({ names: { en: "Early" }, startsAt: "2026-07-05T09:00:00.000Z", endsAt: "2026-07-05T11:00:00.000Z" }), cookie)

    const { sessions } = await list(camp.id)
    const times = sessions.map((s) => s.startsAt)
    expect([...times].sort()).toEqual(times)
  })
})

describe("The register for a camp session", () => {
  /**
   * `RECORD_ATTENDANCE` had no endpoint, so a camp could have a timetable and no
   * way to say who turned up.
   *
   * The grant is deliberately wider than the timetable's: a camp's OWNER and
   * CO_ORGANIZER *and* its HEAD_COACH and ASSISTANT_COACH. The coach carrying
   * the register is not the person who moves the schedule, and both halves of
   * that are asserted here.
   */
  const camp = SEED_ENTITIES.events.find((e) => e.typeCode === "CAMP")!
  const owner = SEED_ENTITIES.users.find((u) => u.id === camp.organizerUserId)!
  // Everything below reads the register back rather than trusting the fixtures:
  // earlier tests in this file enter and withdraw children from this same camp,
  // and a worker file shares one database.

  const makeSession = async (cookie: string) => {
    const res = await post(
      `/api/events/${camp.id}/sessions`,
      {
        eventId: camp.id,
        names: { en: "Register test" },
        startsAt: "2026-07-07T09:00:00.000Z",
        endsAt: "2026-07-07T11:00:00.000Z",
      },
      cookie,
    )
    return ((await res.json()) as { id: string }).id
  }

  const register = async (sessionId: string, cookie: string) =>
    (await (
      await api(`/api/events/${camp.id}/sessions/${sessionId}/attendance`, { cookie })
    ).json()) as { players: { playerId: string; attended: boolean }[]; canRecord: boolean }

  const mark = (sessionId: string, playerId: string, attended: boolean, cookie: string) =>
    SELF.fetch(
      `${ORIGIN}/api/events/${camp.id}/sessions/${sessionId}/attendance/${playerId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", cookie, origin: ORIGIN },
        body: JSON.stringify({ eventId: camp.id, sessionId, playerId, attended }),
      },
    )

  it("lists everyone entered, not only those marked", async () => {
    // A register showing only the present children is a list. The coach needs
    // to see who is missing, so an unmarked child is a row with attended:false.
    const cookie = await signIn(owner.email)
    const sessionId = await makeSession(cookie)
    const { players } = await register(sessionId, cookie)

    expect(players.length, "children are entered in the camp").toBeGreaterThan(0)
    expect(players.every((p) => !p.attended), "a new session starts unmarked").toBe(true)

    // Everyone on the register is entered in the camp, and nobody else.
    const entered = (await (
      await api(`/api/event-players`, { cookie })
    ).json()) as { items: { eventId: string; playerId: string }[] }
    const inCamp = new Set(
      entered.items.filter((e) => e.eventId === camp.id).map((e) => e.playerId),
    )
    expect(players.map((p) => p.playerId).sort()).toEqual([...inCamp].sort())
  })

  it("marks one present and takes it back", async () => {
    const cookie = await signIn(owner.email)
    const sessionId = await makeSession(cookie)
    const who = (await register(sessionId, cookie)).players[0]!.playerId

    expect((await mark(sessionId, who, true, cookie)).status).toBe(200)
    expect((await register(sessionId, cookie)).players.find((p) => p.playerId === who)!.attended).toBe(true)

    // Undoing deletes the row rather than storing a negative — "marked absent"
    // and "not marked yet" are the same state on purpose.
    expect((await mark(sessionId, who, false, cookie)).status).toBe(200)
    expect((await register(sessionId, cookie)).players.find((p) => p.playerId === who)!.attended).toBe(false)
  })

  it("marking twice is not two rows", async () => {
    const cookie = await signIn(owner.email)
    const sessionId = await makeSession(cookie)
    const who = (await register(sessionId, cookie)).players[0]!.playerId

    await mark(sessionId, who, true, cookie)
    expect((await mark(sessionId, who, true, cookie)).status).toBe(200)
    const { players } = await register(sessionId, cookie)
    expect(players.filter((p) => p.playerId === who).length).toBe(1)
  })

  it("refuses a child who is not entered in this camp", async () => {
    // Otherwise a typo writes a register entry for somebody not on the course.
    const cookie = await signIn(owner.email)
    const sessionId = await makeSession(cookie)
    const onRegister = new Set((await register(sessionId, cookie)).players.map((p) => p.playerId))
    const outsider = SEED_ENTITIES.players.find((p) => !onRegister.has(p.id))!
    expect((await mark(sessionId, outsider.id, true, cookie)).status).toBe(404)
  })

  it("cannot yet reach a coach, and scripts/check-tables.ts says why", async () => {
    /**
     * The model grants RECORD_ATTENDANCE to a camp's HEAD_COACH and
     * ASSISTANT_COACH as well as its organisers. Those two grants cannot be
     * satisfied by anybody: HEAD_COACH is a **TEAM** relation resolved from
     * `team_coaches.team_id`, and this action acts on an **EVENT**, so the
     * lookup asks for an event id in a team column and matches nothing.
     *
     * Already known and deliberately tracked — `RECORD_ATTENDANCE/HEAD_COACH`
     * and `/ASSISTANT_COACH` are two of the four pairs in KNOWN_UNRESOLVABLE in
     * scripts/check-tables.ts, listed individually so the next mismatch is not
     * hidden by a blanket exemption.
     *
     * Asserted rather than left implicit: when the model gains a way for a coach
     * to relate to a camp, this test fails and this endpoint is one of the
     * places that has to change.
     */
    const cookie = await signIn(owner.email)
    const sessionId = await makeSession(cookie)
    const coach = await signIn(actorFor("COACH"))

    expect(
      (await register(sessionId, coach)).canRecord,
      "no coach can hold a TEAM relation on an EVENT — see KNOWN_UNRESOLVABLE",
    ).toBe(false)

    // The organisers, who the grant does reach.
    expect((await register(sessionId, cookie)).canRecord).toBe(true)
  })

  it("refuses a spectator, and an anonymous caller", async () => {
    const cookie = await signIn(owner.email)
    const sessionId = await makeSession(cookie)
    const who = (await register(sessionId, cookie)).players[0]!.playerId

    expect((await mark(sessionId, who, true, await signIn(actorFor("SPECTATOR")))).status).toBe(403)
    expect(
      (await api(`/api/events/${camp.id}/sessions/${sessionId}/attendance`)).status,
      "these rows name minors",
    ).toBe(401)
  })
})
