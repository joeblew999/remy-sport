import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { SEED_ENTITIES } from "../../src/domain/model/entities"
import { ORIGIN, actorFor, api, post, signIn } from "./helpers"

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

  it("seeds every actor the fixtures define, signable-in", async () => {
    // Not a count of a response array: the fixtures' users are in the database
    // and can each authenticate, which is what "seeded" has to mean.
    for (const u of SEED_ENTITIES.users) {
      const cookie = await signIn(u.email)
      const session = (await (await api("/api/auth/get-session", { cookie })).json()) as {
        user: { email: string } | null
      }
      expect(session.user?.email, `${u.id} should be able to sign in`).toBe(u.email)
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
    expect((await added.json()).role).toBe("MEMBER")

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
    expect((await added.json()).userId).toBe(newcomer.id)

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
    expect(games.map((g) => g.id)).toEqual(["gam_002", "gam_003"])
    expect(games[0]!.statusCode).toBe("LIVE")
    // Nobody is signed in, so nobody may score.
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
    expect((await res.json()).statusCode).toBe("FINISHED")
  })

  it("an unknown game is 404, not 403 — it must not leak which ids exist", async () => {
    const adisorn = await signIn("adisorn.b@bat.test")
    expect((await put("/api/games/gam_nope/score", { homeScore: 1, awayScore: 2 }, adisorn)).status)
      .toBe(404)
  })
})
