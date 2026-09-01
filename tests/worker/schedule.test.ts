import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/domain/model/entities"
import { ORIGIN, actorFor, api, post, signIn } from "./helpers"
import { gamesIn } from "../helpers/fixtures"

/**
 * Scheduling: fixtures, courts, referees, divisions and camp sessions.
 *
 * Split out of write.test.ts on 2026-08-31, and the reason is measured. Vitest
 * runs test files in parallel, so this tier's wall clock is its *slowest file*,
 * not the sum of them — and write.test.ts had grown to 2279 lines and 21.5s
 * while every other worker file finished in about 5. The tier took 24.5s, which
 * was write.test.ts plus noise.
 *
 * That is worth writing down because the note it corrects is still in
 * apply-migrations.ts: "~3s of workerd startup per file... the only lever is
 * having fewer files." That is the serial reading, and under it the fix for a
 * slow tier is to merge files. I tried exactly that first — folded
 * authz-equivalence.test.ts into relations.test.ts, measured, and the tier did
 * not move by a tenth of a second. Fewer files is the wrong lever; a smaller
 * *biggest* file is the right one.
 *
 * The seam is subject, not size: everything here is about arranging a
 * competition. Accounts, sign-in, organisations, registration and players stay
 * in write.test.ts.
 */


const put = (path: string, body: unknown, cookie: string) =>
  api(path, { method: "PUT", body: JSON.stringify(body), cookie })

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

  it("cannot yet reach a coach, and scripts/checks/check-tables.ts says why", async () => {
    /**
     * The model grants RECORD_ATTENDANCE to a camp's HEAD_COACH and
     * ASSISTANT_COACH as well as its organisers. Those two grants cannot be
     * satisfied by anybody: HEAD_COACH is a **TEAM** relation resolved from
     * `team_coaches.team_id`, and this action acts on an **EVENT**, so the
     * lookup asks for an event id in a team column and matches nothing.
     *
     * Already known and deliberately tracked — `RECORD_ATTENDANCE/HEAD_COACH`
     * and `/ASSISTANT_COACH` are two of the four pairs in KNOWN_UNRESOLVABLE in
     * scripts/checks/check-tables.ts, listed individually so the next mismatch is not
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

/**
 * Which court a fixture is played on — `ASSIGN_COURTS`.
 *
 * The action had no endpoint, and `generateFixtures` writes every game with
 * `venueId: null`. So generating a season produced thirty-one fixtures reading
 * "Venue TBC" that nothing in the platform could ever change.
 */
/**
 * Which court a fixture is played on — `ASSIGN_COURTS`.
 *
 * The action had no endpoint, and `generateFixtures` writes every game with
 * `venueId: null`. So generating a season produced thirty-one fixtures reading
 * "Venue TBC" that nothing in the platform could ever change.
 */
describe("Assigning a fixture to a court", () => {
  const niran = () => signIn(SEED_ENTITIES.users.find((u) => u.id === "usr_org_002")!.email)

  /** A fixture of evt_002's to move around, cleaned up by the caller. */
  const aFixture = async (cookie: string) => {
    const res = await post(
      "/api/events/evt_002/games",
      {
        eventId: "evt_002",
        homeTeamId: "team_001",
        awayTeamId: "team_003",
        startsAt: "2026-09-21T10:00:00Z",
      },
      cookie,
    )
    return ((await res.json()) as { id: string }).id
  }

  it("the organiser puts a fixture on one of the event's courts, and takes it off again", async () => {
    const organiser = await niran()
    const id = await aFixture(organiser)

    // evt_002 plays at ven_001 — see `eventVenue`.
    const on = await put(`/api/events/evt_002/games/${id}/venue`, { venueId: "ven_001" }, organiser)
    expect(on.status).toBe(200)
    expect(((await on.json()) as { venueId: string | null }).venueId).toBe("ven_001")

    // Un-assigning is a real thing an organiser does when a court falls
    // through and the fixture stands — so null is accepted, not rejected.
    const off = await put(`/api/events/evt_002/games/${id}/venue`, { venueId: null }, organiser)
    expect(off.status).toBe(200)
    expect(((await off.json()) as { venueId: string | null }).venueId).toBeNull()

    await api(`/api/events/evt_002/games/${id}`, { method: "DELETE", cookie: organiser })
  })

  it("refuses a venue the event does not play at", async () => {
    const organiser = await niran()
    const id = await aFixture(organiser)

    // ven_003 is evt_003's hall. It exists, which is exactly why this is a 400
    // and not a 404 — the fix is to add it to the event, not to hunt a typo.
    const res = await put(`/api/events/evt_002/games/${id}/venue`, { venueId: "ven_003" }, organiser)
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("VENUE_NOT_AT_EVENT")

    await api(`/api/events/evt_002/games/${id}`, { method: "DELETE", cookie: organiser })
  })

  /**
   * The path carries two ids and only one of them is authorised.
   *
   * `requireAction` reads the eventId, so without this check an organiser could
   * name an event they own and any game id on the platform, and the write would
   * land on somebody else's fixture.
   */
  it("refuses a fixture that belongs to a different event", async () => {
    const organiser = await niran() // owns evt_002, not evt_001
    const { games } = (await (await api("/api/games?eventId=evt_001")).json()) as {
      games: { id: string }[]
    }
    const elsewhere = games[0]!.id

    const res = await put(
      `/api/events/evt_002/games/${elsewhere}/venue`,
      { venueId: "ven_001" },
      organiser,
    )
    expect(res.status).toBe(400)
  })

  it("a coach may not assign courts in someone else's event", async () => {
    const coach = await signIn(actorFor("COACH"))
    const { games } = (await (await api("/api/games?eventId=evt_002")).json()) as {
      games: { id: string }[]
    }
    const res = await put(
      `/api/events/evt_002/games/${games[0]!.id}/venue`,
      { venueId: "ven_001" },
      coach,
    )
    expect(res.status).toBe(403)
  })

  /**
   * The reason `venueId` came off `update`.
   *
   * The model names ASSIGN_COURTS and MANAGE_FIXTURES separately. They carry
   * identical grants today, so routing courts through `update` was invisible
   * rather than wrong — and would have stayed invisible if the Product Owner
   * ever widened one of them. Two actions, two doors.
   */
  it("does not accept a court through the fixture editor", async () => {
    const organiser = await niran()
    const id = await aFixture(organiser)

    const res = await put(
      `/api/events/evt_002/games/${id}`,
      { id, eventId: "evt_002", venueId: "ven_001" },
      organiser,
    )
    // zod strips the key it does not know, so the request succeeds and does
    // nothing — which is the guarantee that matters here: MANAGE_FIXTURES
    // cannot put a fixture on a court.
    expect(res.status).toBe(200)

    // And nothing was assigned.
    const after = (await (await api(`/api/games/${id}`)).json()) as { venueId: string | null }
    expect(after.venueId).toBeNull()

    await api(`/api/events/evt_002/games/${id}`, { method: "DELETE", cookie: organiser })
  })
})
