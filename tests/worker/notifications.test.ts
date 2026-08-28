/**
 * The reader-facing half: following things, registering a browser, and muting.
 *
 * Driven over real HTTP against the real Worker with a real session, because
 * what these tests are actually about is authorisation and identity — that a
 * stranger cannot register a device, that one reader cannot see another's, and
 * that "my devices" means mine. Calling the handlers directly would assert none
 * of that.
 *
 * The encryption and audience rules are proved separately, in ./push.test.ts.
 */

import { describe, expect, it } from "vitest"
import { actorFor, api, post, signIn } from "./helpers"
import { NO_SUCH_TEAM, gamesFor } from "../helpers/fixtures"

const SPECTATOR = actorFor("SPECTATOR")
const COACH = actorFor("COACH")

/** A syntactically real subscription. Nothing here ever sends to it. */
const fakeSubscription = (name: string) => ({
  endpoint: `https://push.test/${name}`,
  expirationTime: null,
  keys: {
    // 65 bytes base64url — the shape `subscribe()` returns. Not a usable point;
    // these tests never encrypt to it.
    p256dh: "BEbLLycOKgkyxcAiLcEqqcqXQBcNr0nsDMqCLTZtT2eD3AQ1eZKGGSb2AZlDLPZeQ4YCyYyJDeRhL1CFvpQ4Yzo",
    auth: "Zm9vYmFyYmF6cXV1eDEyMw",
  },
})

describe("The VAPID public key", () => {
  it("is served to anyone, because the browser needs it before signing in", async () => {
    const res = await api("/api/push/key")
    expect(res.status).toBe(200)
    const { publicKey } = (await res.json()) as { publicKey: string | null }
    // Configured in vitest.config.ts. A null here would mean push is off and
    // every test below is passing vacuously.
    expect(publicKey).toBeTruthy()
  })
})

describe("Registering a browser for push", () => {
  it("refuses a stranger", async () => {
    const res = await post("/api/push/subscribe", {
      subscription: fakeSubscription("stranger"),
      label: "Nobody's phone",
    })
    expect(res.status).toBe(401)
  })

  it("registers a signed-in reader's browser, and lists it back", async () => {
    const cookie = await signIn(SPECTATOR)
    const res = await post(
      "/api/push/subscribe",
      { subscription: fakeSubscription("spectator-1"), label: "Safari on iPhone", locale: "th" },
      cookie,
    )
    expect(res.status).toBe(200)

    const list = await api("/api/push/devices", { cookie })
    const { devices } = (await list.json()) as { devices: { label: string }[] }
    expect(devices.map((d) => d.label)).toContain("Safari on iPhone")
  })

  it("keeps one row when the same browser subscribes twice", async () => {
    const cookie = await signIn(SPECTATOR)
    const subscription = fakeSubscription("spectator-repeat")

    await post("/api/push/subscribe", { subscription, label: "First" }, cookie)
    await post("/api/push/subscribe", { subscription, label: "Renamed" }, cookie)

    const list = await api("/api/push/devices", { cookie })
    const { devices } = (await list.json()) as { devices: { label: string }[] }
    // Signing in again on one phone must not double every notification it gets.
    expect(devices.filter((d) => d.label === "Renamed")).toHaveLength(1)
    expect(devices.filter((d) => d.label === "First")).toHaveLength(0)
  })

  it("shows a reader only their own devices", async () => {
    const spectator = await signIn(SPECTATOR)
    await post(
      "/api/push/subscribe",
      { subscription: fakeSubscription("private-to-spectator"), label: "Spectator phone" },
      spectator,
    )

    const coach = await signIn(COACH)
    const list = await api("/api/push/devices", { cookie: coach })
    const { devices } = (await list.json()) as { devices: { label: string }[] }
    expect(devices.map((d) => d.label)).not.toContain("Spectator phone")
  })

  it("forgets a browser on unsubscribe", async () => {
    const cookie = await signIn(SPECTATOR)
    const subscription = fakeSubscription("spectator-leaving")
    await post("/api/push/subscribe", { subscription, label: "Leaving" }, cookie)

    const res = await post("/api/push/unsubscribe", { endpoint: subscription.endpoint }, cookie)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { removed: number }).removed).toBe(1)

    const list = await api("/api/push/devices", { cookie })
    const { devices } = (await list.json()) as { devices: { label: string }[] }
    expect(devices.map((d) => d.label)).not.toContain("Leaving")
  })
})

describe("Following", () => {
  it("refuses a stranger", async () => {
    const res = await post("/api/follow", { objectTypeCode: "TEAM", objectId: "team_001" })
    expect(res.status).toBe(401)
  })

  it("follows a real team and reports it back", async () => {
    const cookie = await signIn(SPECTATOR)
    const res = await post("/api/follow", { objectTypeCode: "TEAM", objectId: "team_001" }, cookie)
    expect(res.status).toBe(201)

    const mine = await api("/api/follow", { cookie })
    const { following } = (await mine.json()) as { following: { objectId: string }[] }
    expect(following.map((f) => f.objectId)).toContain("team_001")
  })

  it("404s on an object that does not exist", async () => {
    const cookie = await signIn(SPECTATOR)
    const res = await post(
      "/api/follow",
      { objectTypeCode: "TEAM", objectId: "team_does_not_exist" },
      cookie,
    )
    // `subscription.objectId` points at six tables and so can carry no foreign
    // key. Without this check the table fills with rows referring to nothing.
    expect(res.status).toBe(404)
  })

  it("is idempotent — following twice is still following once", async () => {
    const cookie = await signIn(SPECTATOR)
    await post("/api/follow", { objectTypeCode: "EVENT", objectId: "evt_001" }, cookie)
    const again = await post("/api/follow", { objectTypeCode: "EVENT", objectId: "evt_001" }, cookie)
    expect(again.status).toBe(201)

    const mine = await api("/api/follow", { cookie })
    const { following } = (await mine.json()) as { following: { objectId: string }[] }
    expect(following.filter((f) => f.objectId === "evt_001")).toHaveLength(1)
  })

  it("unfollows", async () => {
    const cookie = await signIn(SPECTATOR)
    await post("/api/follow", { objectTypeCode: "TEAM", objectId: "team_002" }, cookie)

    const res = await api("/api/follow", {
      method: "DELETE",
      body: JSON.stringify({ objectTypeCode: "TEAM", objectId: "team_002" }),
      cookie,
    })
    expect(res.status).toBe(200)

    const mine = await api("/api/follow", { cookie })
    const { following } = (await mine.json()) as { following: { objectId: string }[] }
    expect(following.map((f) => f.objectId)).not.toContain("team_002")
  })

  it("shows a reader only what they themselves follow", async () => {
    const spectator = await signIn(SPECTATOR)
    await post("/api/follow", { objectTypeCode: "TEAM", objectId: "team_001" }, spectator)

    const coach = await signIn(COACH)
    const mine = await api("/api/follow", { cookie: coach })
    const { following } = (await mine.json()) as { following: { objectId: string }[] }
    expect(following.map((f) => f.objectId)).not.toContain("team_001")
  })
})

describe("Muting a kind of notification", () => {
  it("records a mute and reports it", async () => {
    const cookie = await signIn(SPECTATOR)
    const put = await api("/api/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ notificationTypeCode: "SCORE_UPDATE", isEnabled: false }),
      cookie,
    })
    expect(put.status).toBe(200)

    const mine = await api("/api/follow", { cookie })
    const { muted } = (await mine.json()) as { muted: string[] }
    expect(muted).toContain("SCORE_UPDATE")
  })

  it("unmutes without leaving a duplicate row", async () => {
    const cookie = await signIn(SPECTATOR)
    const set = (isEnabled: boolean) =>
      api("/api/notification-preferences", {
        method: "PUT",
        body: JSON.stringify({ notificationTypeCode: "MATCH_END", isEnabled }),
        cookie,
      })

    await set(false)
    await set(true)

    const mine = await api("/api/follow", { cookie })
    const { muted } = (await mine.json()) as { muted: string[] }
    expect(muted).not.toContain("MATCH_END")
  })

  it("refuses a type the model does not have", async () => {
    const cookie = await signIn(SPECTATOR)
    const res = await api("/api/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ notificationTypeCode: "NOT_A_REAL_TYPE", isEnabled: false }),
      cookie,
    })
    expect(res.status).toBe(400)
  })
})

describe("What the following list actually says", () => {
  it("names the thing followed, not just its type", async () => {
    const cookie = await signIn(SPECTATOR)
    await post("/api/follow", { objectTypeCode: "TEAM", objectId: "team_001" }, cookie)
    await post("/api/follow", { objectTypeCode: "EVENT", objectId: "evt_001" }, cookie)

    const mine = await api("/api/follow", { cookie })
    const { following } = (await mine.json()) as {
      following: { objectId: string; name: string; names: Record<string, string> }[]
    }

    // The whole point: a reader following three teams must not see
    // "Team, Team, Team". Every row carries the object's own name, in every
    // language the model has it in.
    const team = following.find((f) => f.objectId === "team_001")!
    expect(team.name).toBeTruthy()
    expect(team.names.en).toBeTruthy()
    expect(team.names.th).toBeTruthy()

    const event = following.find((f) => f.objectId === "evt_001")!
    expect(event.name).toBeTruthy()
    expect(event.name).not.toBe(team.name)
  })
})

describe("A team's schedule comes from the games table", () => {
  it("returns that team's games, from both ends of the fixture", async () => {
    const all = await api("/api/games")
    const { games } = (await all.json()) as {
      games: { id: string; homeTeamId: string; awayTeamId: string }[]
    }
    // Pick a team that plays away somewhere, so the filter is doing more than
    // matching one column.
    const away = games.find((g) => g.awayTeamId)!
    const teamId = away.awayTeamId

    const res = await api(`/api/games?teamId=${teamId}`)
    expect(res.status).toBe(200)
    const { games: theirs } = (await res.json()) as {
      games: { homeTeamId: string; awayTeamId: string }[]
    }

    // The count the fixtures say, not a number typed here.
    expect(theirs).toHaveLength(gamesFor(teamId).length)
    // Every returned game involves them.
    for (const g of theirs) {
      expect([g.homeTeamId, g.awayTeamId]).toContain(teamId)
    }
    // Including the away fixture we picked — a filter on `homeTeamId` alone
    // would drop half a team's season and nobody would notice from the page.
    expect(theirs.some((g) => g.awayTeamId === teamId)).toBe(true)

    // And it genuinely filters rather than ignoring the parameter: a team that
    // does not exist has no fixtures, not everybody's. Asserted with an unknown
    // id because every seeded team now plays — which is the point of the
    // fixtures having grown.
    const idle = await api(`/api/games?teamId=${NO_SUCH_TEAM}`)
    const { games: none } = (await idle.json()) as { games: unknown[] }
    expect(none).toHaveLength(0)

    // And it is a real subset: this team's games are fewer than all of them.
    expect(theirs.length).toBeLessThan(games.length)
  })
})

describe("One row per browser, enforced by the database", () => {
  it("moves a browser to whoever signed in on it last", async () => {
    const subscription = fakeSubscription("shared-laptop")

    const spectator = await signIn(SPECTATOR)
    await post("/api/push/subscribe", { subscription, label: "The laptop" }, spectator)

    // Somebody else signs in on the same browser. Its endpoint is unchanged —
    // it belongs to the browser, not the account — so the row must move rather
    // than duplicate. The old shape branched on "does this user already have
    // this address", so it silently created a second row here and the previous
    // owner kept receiving notifications on a machine they had signed out of.
    const coach = await signIn(COACH)
    await post("/api/push/subscribe", { subscription, label: "The laptop" }, coach)

    const theirs = await api("/api/push/devices", { cookie: coach })
    expect(((await theirs.json()) as { devices: unknown[] }).devices).toHaveLength(1)

    const formerly = await api("/api/push/devices", { cookie: spectator })
    const { devices } = (await formerly.json()) as { devices: { label: string }[] }
    expect(devices.map((d) => d.label)).not.toContain("The laptop")
  })

  it("refuses to forget a browser on someone else's say-so", async () => {
    const subscription = fakeSubscription("not-yours")
    const spectator = await signIn(SPECTATOR)
    await post("/api/push/subscribe", { subscription, label: "Mine" }, spectator)

    // Knowing an endpoint must not be enough to switch off someone's
    // notifications — the delete is scoped to the caller as well.
    const coach = await signIn(COACH)
    const res = await post("/api/push/unsubscribe", { endpoint: subscription.endpoint }, coach)
    expect(((await res.json()) as { removed: number }).removed).toBe(0)

    const mine = await api("/api/push/devices", { cookie: spectator })
    const { devices } = (await mine.json()) as { devices: { label: string }[] }
    expect(devices.map((d) => d.label)).toContain("Mine")
  })
})

describe("Following is governed by the model, not by this file", () => {
  it("refuses an object type the model has no FOLLOW action for", async () => {
    const cookie = await signIn(SPECTATOR)
    // ORG is a real OBJECT_TYPE, and there is no FOLLOW_ORG. Storing the row
    // anyway would leave a subscription that notifies nobody and a Follow
    // button that silently does nothing.
    const res = await post("/api/follow", { objectTypeCode: "ORG", objectId: "org_001" }, cookie)
    expect(res.status).toBe(400)
  })

  it("still allows the three the model does define", async () => {
    const cookie = await signIn(SPECTATOR)
    for (const [objectTypeCode, objectId] of [
      ["TEAM", "team_001"],
      ["EVENT", "evt_001"],
      ["PLAYER", "ply_001"],
    ] as const) {
      const res = await post("/api/follow", { objectTypeCode, objectId }, cookie)
      expect(res.status, `${objectTypeCode} should be followable`).toBe(201)
    }
  })
})
