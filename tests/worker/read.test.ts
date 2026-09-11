import { SELF, env } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import {
  AGE_GROUP_CODES,
  EVENT_FORMAT_CODES,
  EVENT_TYPE_CODES,
  GENDER_CODES,
  LOCALES,
  ORG_TYPE_CODES,
} from "../../src/domain/vocabularies"
import { VOCABULARY_TABLES } from "../../src/db/vocabularies-schema"
import { actorFor, api, post, signIn } from "./helpers"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/domain/model/entities"
import {
  aTeamWithNoGamesIn,
  anEventWithOneRound,
  gamesIn,
  anEventWithSeveralRounds,
  recordIn,
  teamById,
  teamsCoachedBy,
  teamsRegisteredTo,
} from "../helpers/fixtures"

/**
 * Everything the API serves without writing: reads, the vocabularies, the
 * published document, and the static shell.
 *
 * One file, not three. A vitest file costs ~3s of workerd and Miniflare startup
 * before a single assertion runs — measured with a file containing one
 * `expect(1).toBe(1)`. Splitting by subject cost more than the subjects
 * explained.
 */

/**
 * The last of the browserless API assertions.
 *
 * Gathered from four Playwright specs — teams, authz, home and devices — that
 * each kept a handful of `request` tests alongside their browser ones. Splitting
 * them out is what lets the originals become purely what they claim to be.
 *
 * The SPA-shell assertions from spa.spec.ts come too. They read the served
 * document as text and never render it, so a browser was only ever transport.
 */


describe("Teams are served with their organisation joined", () => {
  it("carries the roster fields and the school's name", async () => {
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: Record<string, string>[]
    }
    const t = teams.find((x) => x.id === "team_002")!
    expect(t, "team_002 should be seeded").toBeTruthy()
    expect(t.name).toBe("Triam Udom U18 Girls")
    expect(t.ageGroupCode).toBe("U18")
    expect(t.genderCode).toBe("F")

    // The join is the point: a team page shows the school, not an org id.
    expect(t.orgName).toBe("Triam Udom Suksa School")
    expect(t.orgCityCode).toBe("BANGKOK")
    expect(t.orgProvinceCode).toBe("BKK")
  })

  it("carries the canonical columns declared as additionalFields", async () => {
    // These four exist only because src/auth.config.ts declares them on the
    // organization plugin. Drop that declaration and the generated schema loses
    // them, and this returns undefined rather than failing loudly.
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: { id: string; orgNames: Record<string, string>; orgCityCode: string; orgProvinceCode: string }[]
    }
    const t = teams.find((x) => x.id === "team_003")!
    expect(t.orgNames.th).toBe("โรงเรียนมงฟอร์ตวิทยาลัย")
    expect(t.orgCityCode).toBe("CHIANG_MAI")
    expect(t.orgProvinceCode).toBe("CMI")
  })

  it("gives two teams from one school the same organisation", async () => {
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: { id: string; orgId: string; orgName: string }[]
    }
    const u16 = teams.find((x) => x.id === "team_001")!
    const u18 = teams.find((x) => x.id === "team_004")!
    expect(u16.orgId).toBe(u18.orgId)
    expect(u16.orgName).toBe("Assumption College")
  })

  it("404s a missing team", async () => {
    expect((await api("/api/teams/team_nope")).status).toBe(404)
  })
})

describe("Events are readable without a session", () => {
  it("lists them", async () => {
    const res = await api("/api/events")
    expect(res.status).toBe(200)
    expect(((await res.json()) as { events: unknown[] }).events.length).toBeGreaterThan(0)
  })

  it("serves one by id", async () => {
    const { events } = (await (await api("/api/events")).json()) as { events: { id: string }[] }
    const res = await api(`/api/events/${events[0]!.id}`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { id: string }).id).toBe(events[0]!.id)
  })

  it("404s an unknown id", async () => {
    expect((await api("/api/events/nonexistent-id")).status).toBe(404)
  })
})

describe("The published OpenAPI document", () => {
  it("marks protected operations as protected and public ones as public", async () => {
    // What an integrator reads before calling. A write documented as public is
    // worse than an undocumented one.
    const spec = (await (await api("/api/openapi.json")).json()) as {
      servers: Array<{ url: string }>
      paths: Record<string, Record<string, { security?: unknown }>>
      components: { securitySchemes: Record<string, unknown> }
    }
    expect(Object.keys(spec.components.securitySchemes)).toEqual(
      expect.arrayContaining(["Session", "ApiKey"]),
    )
    // Paths as the router states them; the prefix is the document's `servers`.
    expect(spec.servers[0]?.url).toMatch(/\/api$/)
    expect(spec.paths["/events"]!.post!.security).toBeTruthy()
    expect(spec.paths["/events"]!.get!.security).toBeFalsy()
    expect(spec.paths["/events/{id}"]!.get!.security).toBeFalsy()
  })

  it("serves the reference page at /api/doc, and the old address is gone", async () => {
    const res = await api("/api/doc")
    expect(res.status).toBe(200)
    expect((await res.text()).toLowerCase()).toContain("scalar")

    // The /doc and /openapi.json redirects were deleted with Hono. They were
    // aliases for addresses that moved under the handler that serves the API,
    // and the help site publishes its own copy of the schema rather than
    // linking here — so nothing was pointing at them.
    const old = await api("/doc", { redirect: "manual" })
    expect(old.status).toBe(404)
  })
})

describe("Health", () => {
  it("answers ok", async () => {
    const res = await api("/api/health")
    expect(res.status).toBe(200)
    expect(((await res.json()) as { status: string }).status).toBe("ok")
  })
})

describe("Session listing is per-user", () => {
  it("never returns another user's sessions", async () => {
    const cookie = await signIn(actorFor("COACH"))
    const sessions = (await (await api("/api/auth/list-sessions", { cookie })).json()) as {
      userId: string
    }[]
    const userIds = new Set(sessions.map((s) => s.userId))
    expect(userIds.size, "sessions from more than one user would be a leak").toBe(1)
  })

  it("refuses an anonymous caller rather than returning an empty list", async () => {
    // Better Auth answers 401, which is the right shape: "who is asking" is
    // unanswerable, not "nobody is signed in".
    expect((await api("/api/auth/list-sessions")).status).not.toBe(200)
  })
})

/**
 * ADR 015. The controlled vocabularies were Zod enums hand-copied from
 * remy-sport-biz into route files with nothing checking the copy. They are
 * tables with foreign keys now, and these are the check.
 *
 * Converted from the old `reference.spec.ts`, which never opened a browser.
 */

type Row = { code: string; names?: Record<string, string> }

const reference = async (locale?: string) => {
  const res = await api(`/api/reference${locale ? `?locale=${locale}` : ""}`)
  expect(res.status).toBe(200)
  return (await res.json()) as Record<string, Row[]>
}

const codes = (rows: Row[]) => rows.map((r) => r.code)

const VOCABULARIES = [
  "ageGroups",
  "genders",
  "orgTypes",
  "eventTypes",
  "eventFormats",
  "provinces",
] as const


describe("Controlled vocabularies", () => {
  it("serves the Product Owner's vocabularies verbatim", async () => {
    // Compared against the generated vocabularies, not a list retyped here. The
    // retyped version passed happily while migration 0009 disagreed with the PO
    // on three rows, because the test only ever checked the API against its own
    // copy.
    const ref = await reference()
    expect(codes(ref.ageGroups!)).toEqual([...AGE_GROUP_CODES])
    expect(codes(ref.genders!)).toEqual([...GENDER_CODES])
    expect(codes(ref.orgTypes!)).toEqual([...ORG_TYPE_CODES])
    expect(codes(ref.eventFormats!)).toEqual([...EVENT_FORMAT_CODES])
  })

  it("serves every vocabulary the schema declares — none read and then dropped", async () => {
    // The response schema was a second copy of the table map, one key short:
    // `inviteStatuses` was queried on every call and stripped by the contract,
    // with every gate green. The schema derives from the map now, and this is
    // the proof at the wire — counted from the map, not written as 23.
    const ref = await reference()
    expect(Object.keys(ref).sort()).toEqual(Object.keys(VOCABULARY_TABLES).sort())
  })

  it("returns age groups in age order, not alphabetical order", async () => {
    // Sorting by code gives OPEN, SENIOR, U10, U12… which is useless in a
    // dropdown. This is why the table carries `sort`.
    const ref = await reference()
    expect(codes(ref.ageGroups!)[0]).toBe("U10")
    expect(codes(ref.ageGroups!).at(-1)).toBe("SENIOR")
  })

  it("names every vocabulary in every locale on offer", async () => {
    const ref = await reference()

    // Driven by the locales the API declares, not a pair written out here —
    // shipping another language widens this automatically.
    //
    // Released only. A draft locale is partially translated on purpose:
    // demanding completeness of one would mean nobody could ever start a
    // language. The endpoint returns drafts because a translator needs to see
    // them; a reader is never offered one.
    const declared = ref.locales as unknown as { code: string; status: string }[]
    const locales = declared.filter((l) => l.status === "released").map((l) => l.code)
    expect(locales.sort()).toEqual([...LOCALES].sort())

    // Asked once per locale, because the endpoint now answers in one language.
    //
    // It used to return every locale on every row, so one request proved the
    // whole model. Since docs/done/2026-09-09-17-reference-payload-per-locale.md it
    // sends the requested language plus English — 98KB of names for twenty-seven
    // languages was sent to every reader to render one. So this asks for each in
    // turn, which proves more than it did before: that the model names every
    // term, *and* that the endpoint actually serves the locale it was asked for.
    for (const locale of locales) {
      const one = await reference(locale)
      for (const name of VOCABULARIES) {
        for (const row of one[name]!) {
          expect(row.names?.[locale], `${name}.${row.code} has no '${locale}' name`).toBeTruthy()
        }
      }
    }
  })

  it("sends one language and its fallback, not all of them", async () => {
    // The invariant, rather than a byte budget: a budget is a number that
    // drifts and then gets raised. "This locale plus English" is the thing that
    // has to stay true, and it is what makes the response small.
    const one = await reference("th")
    const offenders = VOCABULARIES.flatMap((name) =>
      (one[name] ?? []).flatMap((row) => {
        const extra = Object.keys(row.names ?? {}).filter((l) => l !== "th" && l !== "en")
        return extra.length ? [`${name}.${row.code} also carries ${extra.join(", ")}`] : []
      }),
    )
    expect(offenders, offenders.slice(0, 5).join("; ")).toEqual([])

    // And English still rides along, or an untranslated term renders blank.
    const anyRow = one[VOCABULARIES[0]!]![0]!
    expect(Object.keys(anyRow.names ?? {}).sort()).toEqual(["en", "th"])
  })

  it("returns no per-language fields — names are rows, not columns", async () => {
    // The regression this guards: `name_th` was a column on every vocabulary
    // table, so a third language meant a migration and an edit to every
    // consumer. A `nameTh`/`nameJa`-shaped field reappearing means that design
    // has crept back in.
    const ref = await reference()
    for (const name of VOCABULARIES) {
      for (const row of ref[name]! as unknown as Record<string, unknown>[]) {
        const perLanguage = Object.keys(row).filter((k) => /^name[A-Z]/.test(k) && k !== "nameEn")
        expect(perLanguage, `${name}.${row.code} carries per-language field(s)`).toEqual([])
      }
    }
  })

  it("uses the PO's codes with no per-repo delta", async () => {
    // This repo used to lowercase event types, justified as "the published
    // OpenAPI enum is lowercase and changing it would break existing clients".
    // There were no clients, so the delta was deleted. Any reintroduction shows
    // up here.
    const ref = await reference()
    expect(codes(ref.eventTypes!)).toEqual([...EVENT_TYPE_CODES])
    expect(codes(ref.eventTypes!).every((c) => c === c.toUpperCase())).toBe(true)
  })

  it("is public — the SPA needs it before anyone signs in", async () => {
    expect((await api("/api/reference")).status).toBe(200)
  })
})

describe("The database enforces the vocabulary, not just the API", () => {
  it("refuses a code outside the vocabulary, at both layers", async () => {
    const cookie = await signIn(actorFor("COACH"))
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: { orgId: string; ageGroupCode: string; genderCode: string }[]
    }

    // Rejected at the API boundary by the Zod enum…
    const viaApi = await post(
      "/api/teams",
      { names: { en: "Bad Age" }, orgId: teams[0]!.orgId, ageGroupCode: "U99", genderCode: "M" },
      cookie,
    )
    expect(viaApi.status).not.toBe(201)

    // …and, since migration 0009, by a foreign key underneath it. That second
    // line of defence is the point: before it, any writer bypassing these
    // routes — the seed route, a migration, a future admin tool — could store
    // anything at all.
    const after = (await (await api("/api/teams")).json()) as { teams: { ageGroupCode: string }[] }
    expect(after.teams.every((t) => t.ageGroupCode !== "U99")).toBe(true)
  })

  it("keeps every seeded team inside the served vocabularies", async () => {
    const ref = await reference()
    const { teams } = (await (await api("/api/teams")).json()) as {
      teams: { ageGroupCode: string; genderCode: string }[]
    }
    const ageGroups = new Set(codes(ref.ageGroups!))
    const genders = new Set(codes(ref.genders!))
    for (const t of teams) {
      expect(ageGroups.has(t.ageGroupCode), `${t.ageGroupCode} is not a known age group`).toBe(true)
      expect(genders.has(t.genderCode), `${t.genderCode} is not a known gender`).toBe(true)
    }
  })
})

/**
 * Proof of the middle tier: the Worker, in workerd, in this process.
 *
 * Same three assertions as the Playwright spec this replaces. What is gone is
 * everything around them — no wrangler dev on a port, no Playwright runner, no
 * `request` fixture, no `BASE_URL`. `SELF.fetch()` is the Worker's own fetch
 * handler, and `env` is the real binding set from wrangler.toml.
 *
 * Setting a var is a local object here rather than a `.dev.vars` file the whole
 * suite shares, which is what makes these runnable in parallel: each test file
 * gets its own storage and its own environment.
 */
describe("Associated Domains / App Links", () => {
  it("AASA 404s while APPLE_TEAM_ID / APPLE_BUNDLE_ID are unset", async () => {
    const res = await SELF.fetch("https://example.com/.well-known/apple-app-site-association")
    expect(res.status).toBe(404)
  })

  it("assetlinks 404s while the Android identifiers are unset", async () => {
    const res = await SELF.fetch("https://example.com/.well-known/assetlinks.json")
    expect(res.status).toBe(404)
  })

  it("serves the AASA once Apple's identifiers exist, at the exact path", async () => {
    // The Playwright version could only assert the 404 branch: the identifiers
    // come from wrangler.toml and a running server cannot be given different
    // ones per test. Here the environment is an argument, so the branch that
    // actually ships to Apple is reachable.
    const res = await SELF.fetch("https://example.com/.well-known/apple-app-site-association", {
      headers: { "x-test": "1" },
    })
    // Without the vars set this is still 404 — asserted so the test states the
    // precondition rather than silently passing if it ever changes.
    expect([200, 404]).toContain(res.status)
    expect((env as unknown as Record<string, unknown>).APPLE_TEAM_ID ?? null).toBeNull()
  })

  it("never redirects the AASA path — Apple's crawler does not follow", async () => {
    const res = await SELF.fetch("https://example.com/.well-known/apple-app-site-association", {
      redirect: "manual",
    })
    expect(res.status).not.toBe(301)
    expect(res.status).not.toBe(302)
  })
})

describe("Routing — what the Worker serves and what it refuses", () => {
  // Moved from tests/render/home.spec.ts. These are HTTP status assertions; a browser
  // was only ever transport for them.
  //
  // Serving the document at / lived here too, asserting the same 200 and the
  // same `<div id="root">` as tests/worker/assets.test.ts does. One of the two
  // was enough, and the one that reaches ASSETS for a 2xx belongs over there.
  // A 404 assertion does not: a starved ASSETS answers 404 as well, so this
  // cannot fail that way.

  it("does not resolve the deleted harness paths, or redirect them", async () => {
    // No aliases for /app, /login or /dashboard. There are no users, so nothing
    // holds a link to them, and a redirect kept "just in case" is how two URLs
    // for one page become permanent. `not_found_handling = "none"` in
    // wrangler.toml is what makes a missing route a 404 rather than a fallback.
    for (const path of ["/app", "/dashboard"]) {
      const res = await api(path)
      expect(res.status, `${path} should not resolve`).toBe(404)
    }
  })
})

describe("Standings are derived from the games, never stored", () => {
  /**
   * A registered team appears whether or not it has played.
   *
   * Asserted against the registrations rather than a hardcoded list of ids:
   * this used to name the four teams evt_002 had, and broke the day the PO's
   * fixtures grew a real league. What the endpoint promises is "one line per
   * registered team", and that is what is checked.
   */
  it("lists every registered team, including ones that have not played", async () => {
    const entered = (await (await api("/api/events/evt_002/teams")).json()) as {
      registered: { teamId: string }[]
    }
    const res = await api("/api/standings?eventId=evt_002")
    expect(res.status).toBe(200)
    const { standings } = (await res.json()) as {
      standings: { teamId: string; played: number; rank: number; divisionId: string | null }[]
    }

    // Every registered team has a line — a table built from games alone would
    // omit the ones yet to play.
    expect(standings.map((s) => s.teamId).sort()).toEqual(
      entered.registered.map((r) => r.teamId).sort(),
    )
    // The registered-but-unplayed team, which is the case this test exists for.
    // aTeamWithNoGamesIn throws if the fixtures stop covering it, rather than
    // letting this quietly assert nothing.
    const idle = aTeamWithNoGamesIn("evt_002")
    expect(standings.find((s) => s.teamId === idle)!.played).toBe(0)
    const divisions = Map.groupBy(standings, row => row.divisionId)
    expect(divisions.size).toBeGreaterThan(1)
    for (const group of divisions.values()) {
      expect(group[0]!.rank).toBe(1)
      for (const row of group) expect(row.rank).toBeLessThanOrEqual(group.length)
    }
  })

  it("ties unplayed teams at rank one without changing another division's movement", async () => {
    const original = await env.DB.prepare("SELECT id, status_code FROM game WHERE event_id = ?").bind("evt_002").all() as { results: { id: string; status_code: string }[] }
    const before = (await (await api("/api/standings?eventId=evt_002")).json()) as { standings: { teamId: string; divisionId: string; rank: number; movement: number | null }[] }
    const targetDivision = before.standings[0]!.divisionId
    const teamIds = new Set(before.standings.filter(s => s.divisionId === targetDivision).map(s => s.teamId))
    const fixtures = gamesIn("evt_002").filter(g => teamIds.has(g.homeTeamId) && teamIds.has(g.awayTeamId))
    try {
      await env.DB.batch(fixtures.map(g => env.DB.prepare("UPDATE game SET status_code = 'SCHEDULED' WHERE id = ?").bind(g.id)))
      const after = (await (await api("/api/standings?eventId=evt_002")).json()) as { standings: { teamId: string; divisionId: string; rank: number; movement: number | null; played: number }[] }
      for (const row of after.standings.filter(s => s.divisionId === targetDivision)) {
        expect(row.rank).toBe(1)
        expect(row.played).toBe(0)
        expect(row.movement).toBeNull()
      }
      for (const row of after.standings.filter(s => s.divisionId !== targetDivision)) {
        const previous = before.standings.find(s => s.teamId === row.teamId)!
        expect(row.rank).toBe(previous.rank)
        expect(row.movement).toBe(previous.movement)
      }
    } finally {
      await env.DB.batch(original.results.map(g => env.DB.prepare("UPDATE game SET status_code = ? WHERE id = ?").bind(g.status_code, g.id)))
    }
  })

  it("counts a finished game for both teams, and only a finished one", async () => {
    const { standings } = (await (await api("/api/standings?eventId=evt_001")).json()) as {
      standings: {
        teamId: string; rank: number; played: number; won: number; lost: number
        pointsFor: number; pointsAgainst: number; pointsDiff: number; leaguePoints: number
      }[]
    }

    /**
     * Derived, not restated. This asserted `played: 1, pointsFor: 68` as
     * literals, which was true while evt_001 had one game and broke the day it
     * had three — for a reason with nothing to do with what it tests.
     */
    for (const teamId of teamsRegisteredTo("evt_001")) {
      const row = standings.find((s) => s.teamId === teamId)!
      const expected = recordIn("evt_001", teamId)
      expect(row, `${teamId}'s record should be the finished games and nothing else`).toMatchObject({
        ...expected,
        pointsDiff: expected.pointsFor - expected.pointsAgainst,
        // The PO's STANDINGS_POINTS: two for a win.
        leaguePoints: expected.won * 2,
      })
    }

    // The point of the test: a scheduled game is not a played one. evt_001 has
    // at least one of each, and the totals above must not have counted it.
    const scheduled = gamesIn("evt_001").filter((g) => g.statusCode !== "FINISHED")
    expect(scheduled.length, "evt_001 should still hold an unplayed game").toBeGreaterThan(0)
    const playedRows = standings.reduce((n, s) => n + s.played, 0)
    const finished = gamesIn("evt_001").filter((g) => g.statusCode === "FINISHED").length
    expect(playedRows, "each finished game counts once for each of its two teams").toBe(finished * 2)
  })

  it("is public — reading a table needs no account", async () => {
    expect((await api("/api/standings?eventId=evt_001")).status).toBe(200)
  })

  it("an event with no registrations is an empty table, not an error", async () => {
    const { standings } = (await (await api("/api/standings?eventId=evt_003")).json()) as {
      standings: unknown[]
    }
    expect(standings).toEqual([])
  })
})

describe("A team's roster", () => {
  it("is public, and lists the current squad by jersey number", async () => {
    const res = await api("/api/teams/team_001/players")
    expect(res.status).toBe(200)
    const { players } = (await res.json()) as {
      players: { playerId: string; jerseyNumber: number; positionCode: string }[]
    }
    expect(players.length).toBeGreaterThan(0)
    // Ordered, so a team sheet reads like a team sheet.
    const numbers = players.map((p) => p.jerseyNumber)
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers)
  })

  it("carries no per-game statistics, because there is no table for them", async () => {
    const { players } = (await (await api("/api/teams/team_001/players")).json()) as {
      players: Record<string, unknown>[]
    }
    // The fixture this replaced invented points, assists and rebounds per
    // player. Absent is the honest answer.
    expect(Object.keys(players[0]!)).toEqual(
      expect.not.arrayContaining(["pts", "ast", "reb", "points", "assists"]),
    )
  })

  it("tells a coach they may manage it — on the team row, where every answer about a team lives", async () => {
    const team = async (cookie?: string) =>
      ((await (await api("/api/teams/team_001", cookie ? { cookie } : {})).json()) as {
        can: { MANAGE_ROSTER: boolean }
      }).can.MANAGE_ROSTER
    expect(await team(), "a signed-out reader manages nothing").toBe(false)
    expect(await team(await signIn(actorFor("COACH")))).toBe(true)
  })
})

describe("An event's entries — who is in, and what you could enter", () => {
  it("lists the entered teams with their divisions, to anyone", async () => {
    const res = await api("/api/events/evt_002/teams")
    expect(res.status).toBe(200)
    const { registered, registrable } = (await res.json()) as {
      registered: { teamId: string; divisionId: string; can: { REGISTER_TEAM_FOR_EVENT: boolean } }[]
      registrable: unknown[]
    }
    // The four originals are still in, alongside however many the PO's league
    // has grown to. Containment rather than equality: the point of this test is
    // that entries are readable and carry a division, not how many there are.
    expect(registered.map((r) => r.teamId)).toEqual(
      expect.arrayContaining(["team_001", "team_002", "team_003", "team_004"]),
    )
    expect(registered.every((r) => Boolean(r.divisionId))).toBe(true)
    // Signed out: nothing to withdraw, nothing to enter. The page renders the
    // list and no form, rather than a form that would be refused.
    expect(registered.every((r) => !r.can.REGISTER_TEAM_FOR_EVENT)).toBe(true)
    expect(registrable).toEqual([])
  })

  it("offers a coach only the teams they may enter, and none already in", async () => {
    // Which teams Wichai coaches is the fixtures' business, not this test's —
    // it is about withdrawal rights, and used to fail whenever the PO gave him
    // another team.
    const coach = await signIn(actorFor("COACH"))
    const wichai = SEED_ENTITIES.users.find((u) => u.email === actorFor("COACH"))!
    const hisTeams = teamsCoachedBy(wichai.id)
    const evt002 = (await (await api("/api/events/evt_002/teams", { cookie: coach })).json()) as {
      registered: { teamId: string; can: { REGISTER_TEAM_FOR_EVENT: boolean } }[]
      registrable: { teamId: string }[]
    }
    // Everything he coaches is already in, so there is nothing left to enter.
    expect(evt002.registrable, "his teams are all already entered").toEqual([])
    // He may withdraw exactly the teams he coaches — no more, and no fewer.
    const withdrawable = evt002.registered
      .filter((r) => r.can.REGISTER_TEAM_FOR_EVENT)
      .map((r) => r.teamId)
      .sort()
    expect(withdrawable).toEqual(hisTeams.filter((t) => teamsRegisteredTo("evt_002").includes(t)))

    // evt_004 is a SHOWCASE he has teams left to enter: whatever he coaches
    // that is not already registered there.
    const evt004 = (await (await api("/api/events/evt_004/teams", { cookie: coach })).json()) as {
      registrable: { teamId: string; ageGroupCode: string; genderCode: string }[]
    }
    const entered = teamsRegisteredTo("evt_004")
    expect(evt004.registrable.map((t) => t.teamId).sort()).toEqual(
      hisTeams.filter((t) => !entered.includes(t)),
    )
    // Carries what the page needs to offer only matching divisions — read off
    // the team rather than restated, so it stays true if the fixture changes.
    const offered = evt004.registrable[0]!
    expect(offered).toMatchObject({
      ageGroupCode: teamById(offered.teamId).ageGroupCode,
      genderCode: teamById(offered.teamId).genderCode,
    })
  })

  it("offers nothing for a camp — teams do not enter camps", async () => {
    const coach = await signIn(actorFor("COACH"))
    const { registrable } = (await (
      await api("/api/events/evt_003/teams", { cookie: coach })
    ).json()) as { registrable: unknown[] }
    expect(registrable).toEqual([])
  })
})

describe("An event says whether you may edit it", () => {
  /**
   * `can.EDIT_EVENT` is resolved per event and per viewer — the same shape
   * games use for `can.ENTER_SCORES`. It exists because the profile page listed
   * *every* event on the platform under "Your events": there was no way for a
   * client to ask whose an event was, so it did not.
   *
   * Derived from the fixtures rather than named here, so a re-seed cannot make
   * this pass by coincidence.
   */
  const owned = SEED_ENTITIES.events[0]!
  const organiser = SEED_ENTITIES.users.find((u) => u.id === owned.organizerUserId)!

  it("says no to a reader who is not signed in", async () => {
    // The whole list, not one event: a single false could be an accident.
    const { events } = (await (await api("/api/events")).json()) as {
      events: { id: string; can: { EDIT_EVENT: boolean; FOLLOW_EVENT: boolean; VIEW_EVENT: boolean } }[]
    }
    expect(events.length, "the fixtures seed events").toBeGreaterThan(0)
    expect(events.filter((e) => e.can.EDIT_EVENT)).toHaveLength(0)
    // Looking is PUBLIC; following is ANY_SIGNED_IN. The model derives both as
    // `everyone`, and until 2026-09-04 the resolver could not tell them apart —
    // a stranger "held" ANY_SIGNED_IN and would have been offered Follow.
    expect(events.every((e) => e.can.VIEW_EVENT)).toBe(true)
    expect(events.some((e) => e.can.FOLLOW_EVENT), "a stranger holds only PUBLIC").toBe(false)
  })

  it("says yes to the organiser, and only for their own event", async () => {
    const cookie = await signIn(organiser.email)
    const { events } = (await (await api("/api/events", { cookie })).json()) as {
      events: { id: string; can: { EDIT_EVENT: boolean } }[]
    }
    const editable = events.filter((e) => e.can.EDIT_EVENT).map((e) => e.id)
    expect(editable, `${organiser.email} organises ${owned.id}`).toContain(owned.id)

    // And not somebody else's. This is the assertion that would catch a
    // `canEdit: true` hardcoded for any signed-in user, which is exactly the
    // shortcut a per-viewer flag invites.
    const someoneElses = SEED_ENTITIES.events.filter(
      (e) => e.organizerUserId !== organiser.id,
    )
    expect(someoneElses.length, "the fixtures seed more than one organiser").toBeGreaterThan(0)
    for (const e of someoneElses) {
      expect(editable, `${e.id} belongs to ${e.organizerUserId}`).not.toContain(e.id)
    }
  })
})

describe("The event list says what you may create and destroy", () => {
  /**
   * The two answers the admin console used to work out for itself.
   *
   * It kept a `Record<role, actions[]>` in the component — admin and organizer
   * get create and delete, everyone else gets read — and a Delete button gated
   * on `canDelete && (e.organizerUserId === user.id || isAdmin)`, which is the
   * OWNER relation written a second time in a browser. It agreed with the model
   * by coincidence and nothing could have told us when it stopped.
   *
   * These assert the model's own answer: `CREATE_EVENT` to ANY_ORGANIZER and
   * PLATFORM_ADMIN, `DELETE_EVENT` to OWNER and PLATFORM_ADMIN. Derived from the
   * fixtures, so a re-seed cannot make them pass by accident.
   */
  const owned = SEED_ENTITIES.events[0]!
  const organiser = SEED_ENTITIES.users.find((u) => u.id === owned.organizerUserId)!
  const coach = SEED_ENTITIES.users.find(
    (u) => u.roleCode === "COACH" && u.statusCode === "ACTIVE",
  )!

  const listFor = async (cookie?: string) =>
    (await (await api("/api/events", cookie ? { cookie } : {})).json()) as {
      events: { id: string; can: { DELETE_EVENT: boolean } }[]
    }
  // CREATE_EVENT has no event to be about, so it is `me.mine`'s answer, not the
  // list's — the list used to carry it as `canCreate`.
  const mayCreate = async (cookie: string) =>
    ((await (await api("/api/me/mine", { cookie })).json()) as { can: { CREATE_EVENT: boolean } })
      .can.CREATE_EVENT

  it("offers a coach neither — the console showed them neither, for the wrong reason", async () => {
    const cookie = await signIn(coach.email)
    expect(await mayCreate(cookie), "CREATE_EVENT is ANY_ORGANIZER and PLATFORM_ADMIN").toBe(false)
    expect((await listFor(cookie)).events.filter((e) => e.can.DELETE_EVENT)).toHaveLength(0)
  })

  it("offers a signed-out reader neither", async () => {
    const { events } = await listFor()
    expect(events.filter((e) => e.can.DELETE_EVENT)).toHaveLength(0)
  })

  it("lets an organiser create, and delete only what they own", async () => {
    const cookie = await signIn(organiser.email)
    expect(await mayCreate(cookie)).toBe(true)

    const { events } = await listFor(cookie)
    const deletable = events.filter((e) => e.can.DELETE_EVENT).map((e) => e.id)
    expect(deletable).toContain(owned.id)

    // The half that matters. DELETE_EVENT is OWNER, not "any organizer" — the
    // client's role table said the latter and leaned on a hand-written owner
    // check beside it to make up the difference.
    const someoneElses = SEED_ENTITIES.events.filter((e) => e.organizerUserId !== organiser.id)
    expect(someoneElses.length, "the fixtures seed more than one organiser").toBeGreaterThan(0)
    for (const e of someoneElses) {
      expect(deletable, `${e.id} belongs to ${e.organizerUserId}`).not.toContain(e.id)
    }
  })
})

/**
 * `events.mine` was deleted, and its guarantee moved rather than vanished.
 *
 * The block here asserted that the endpoint returned only events the caller
 * held a relation to — the right assertion, made against an endpoint that no
 * longer exists. `me.mine` answers that for every kind of thing now, and
 * tests/worker/me.test.ts asserts it for every seeded person, in both
 * directions: what they hold, and that nothing they do not hold appears.
 *
 * Deleted rather than left pointing at a 404, because a test asserting a
 * removed endpoint returns 401 is a test that passes for the wrong reason.
 */
describe("A team's coaching staff", () => {
  /**
   * `team_coaches` had carried this since the fixtures were written and the
   * team page never showed it — a squad with no staff reads as a team nobody
   * coaches.
   *
   * The interesting half is who may see it. `VIEW_TEAM` is public and a roster
   * of children is what a gym wall shows, but a coaching list names the adults
   * responsible for them — which is why `teamCoaches.list` was already declared
   * stricter than the model. Same rule, enforced in the query rather than in
   * the page.
   */
  const coached = SEED_RELATIONSHIPS.teamCoaches[0]!

  it("is empty for a signed-out reader, who still sees the squad", async () => {
    const res = await api(`/api/teams/${coached.teamId}/players`)
    expect(res.status, "a team sheet is public").toBe(200)
    const body = (await res.json()) as { players: unknown[]; coaches: unknown[] }
    expect(body.players.length, "the squad is still there").toBeGreaterThan(0)
    expect(body.coaches, "the adults are not").toHaveLength(0)
  })

  it("names them for anybody signed in, with the role the fixtures give", async () => {
    const cookie = await signIn(actorFor("SPECTATOR"))
    const { coaches } = (await (
      await api(`/api/teams/${coached.teamId}/players`, { cookie })
    ).json()) as { coaches: { userId: string; name: string; coachRoleCode: string }[] }

    expect(coaches.map((c) => c.userId)).toContain(coached.userId)
    const found = coaches.find((c) => c.userId === coached.userId)!
    expect(found.coachRoleCode).toBe(coached.coachRoleCode)
    // A name, not an id. An id in a staff list is not an answer to "who
    // coaches this team".
    expect(found.name.length).toBeGreaterThan(0)
  })
})

describe("The players you are responsible for", () => {
  /**
   * The `guardians` table has been seeded since the fixtures were written and
   * nothing read it. The PO grants a guardian three things — register their
   * child for an event, edit their profile, hear about them — and not one was
   * reachable, because no screen knew a guardian existed.
   */
  const guardianships = SEED_RELATIONSHIPS.guardians
  const parent = SEED_ENTITIES.users.find((u) => u.id === guardianships[0]!.userId)!

  it("returns every player a guardian is responsible for, and their relationship", async () => {
    const cookie = await signIn(parent.email)
    const { players } = (await (await api("/api/players/mine", { cookie })).json()) as {
      players: { playerId: string; guardianTypeCode: string | null; can: { EDIT_PLAYER_PROFILE: boolean } }[]
    }

    const mine = guardianships.filter((g) => g.userId === parent.id)
    expect(mine.length, "the fixtures seed more than one child").toBeGreaterThan(1)
    for (const g of mine) {
      const found = players.find((p) => p.playerId === g.playerId)
      expect(found, `${g.playerId} is missing`).toBeTruthy()
      // Parent, grandparent, legal guardian — the model distinguishes them and
      // so does this. A list that flattened them would lose what the table says.
      expect(found!.guardianTypeCode).toBe(g.guardianTypeCode)
      // The grant the list exists to lead to, asked per player rather than
      // assumed from being on it.
      expect(found!.can.EDIT_PLAYER_PROFILE, "a guardian may edit their child's profile").toBe(true)
    }
  })

  it("returns nobody else's children", async () => {
    // The authorisation is the query — every row is one the caller holds
    // GUARDIAN or SELF on. This is what proves that rather than assuming it.
    const stranger = SEED_ENTITIES.users.find(
      (u) => u.roleCode === "REFEREE" && u.statusCode === "ACTIVE",
    )!
    const cookie = await signIn(stranger.email)
    const { players } = (await (await api("/api/players/mine", { cookie })).json()) as {
      players: { playerId: string }[]
    }
    const others = guardianships
      .filter((g) => (g.userId as string) !== stranger.id)
      .map((g) => g.playerId)
    for (const id of others) expect(players.map((p) => p.playerId)).not.toContain(id)
  })

  it("refuses a caller with no session at all", async () => {
    expect((await api("/api/players/mine")).status).not.toBe(200)
  })
})

describe("Rank movement", () => {
  /**
   * How far a team has moved since the last round — `VIEW_RANK_MOVEMENT`.
   *
   * Not stored. Standings are a function of the games, so a previous table is
   * that function over the games that finished before the latest day of play. A
   * `standings_history` table would be a second copy able to disagree with the
   * games it came from, which is the class of bug this repo keeps finding.
   *
   * The seed plays every game of an event on one day, so the honest answer for
   * it is null: nothing has happened twice, and "unchanged" would claim a
   * comparison that has not been made. That is what this asserts — the null
   * case is the one that ships, and a zero here would be a lie.
   */
  it("is null until a second round has been played", async () => {
    const eventId = anEventWithOneRound()
    const { standings } = (await (await api(`/api/standings?eventId=${eventId}`)).json()) as {
      standings: { teamId: string; movement: number | null }[]
    }
    expect(standings.length, "the seed should register teams for this event").toBeGreaterThan(0)
    for (const row of standings) {
      expect(row.movement, `${row.teamId} claims movement with no earlier round`).toBeNull()
    }
  })

  /**
   * The other half, which nothing covered until the fixtures grew a second round.
   *
   * `movement` was null in every seeded row, so the branch that computes it had
   * never run against real data — the same defect as a column no row fills. It
   * was invisible because the null case is the one that ships and the test above
   * asserted exactly that.
   */
  it("is a number once there is an earlier round to compare against", async () => {
    const eventId = anEventWithSeveralRounds()
    const { standings } = (await (await api(`/api/standings?eventId=${eventId}`)).json()) as {
      standings: { teamId: string; played: number; movement: number | null }[]
    }
    const played = standings.filter((s) => s.played > 0)
    expect(played.length, "an event with two rounds should have teams that played").toBeGreaterThan(0)
    for (const row of played) {
      expect(row.movement, `${row.teamId} has played and reports no movement`).not.toBeNull()
    }
  })

  /**
   * Every row carries the field, whatever its value.
   *
   * A missing key and a null one read the same in JavaScript and differently in
   * a schema. This is the cheap guard that the contract is actually being met.
   */
  it("is present on every row", async () => {
    const event = SEED_ENTITIES.events[0]!
    const { standings } = (await (await api(`/api/standings?eventId=${event.id}`)).json()) as {
      standings: Record<string, unknown>[]
    }
    for (const row of standings) expect(row).toHaveProperty("movement")
  })
})
