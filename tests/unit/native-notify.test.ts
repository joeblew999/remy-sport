import { describe, it, expect } from "bun:test"
import { changedScores, scoreBody, type LiveGame } from "../../src/web/lib/native-notify"

/**
 * Score notifications in the native app, where there is no push.
 *
 * `changedScores` is pure so this can assert the *decision* without a webview:
 * which games are news, given what was seen last poll. The trigger is a
 * 10-second poll rather than a socket — there is no Durable Object and no
 * WebSocket in this repo, whatever the plan said — so getting "what changed"
 * right is the whole correctness of the feature.
 */

const game = (over: Partial<LiveGame> = {}): LiveGame => ({
  id: "gam_001",
  homeTeam: "Assumption",
  awayTeam: "Bangkok Christian",
  homeScore: 10,
  awayScore: 8,
  ...over,
})

describe("changedScores", () => {
  it("says nothing about a game it is seeing for the first time", () => {
    // Opening the app mid-tournament would otherwise fire one notification per
    // live game at once — noise about something the reader is looking at.
    const { games, seen } = changedScores(new Map(), [game()])
    expect(games).toEqual([])
    // But it is remembered, so the next change is news.
    expect(seen.get("gam_001")).toBe("10-8")
  })

  it("reports a game whose score moved", () => {
    const before = new Map([["gam_001", "10-8"]])
    const { games } = changedScores(before, [game({ homeScore: 12 })])
    expect(games.map((g) => g.id)).toEqual(["gam_001"])
  })

  it("stays quiet when the poll returns the same score", () => {
    // The common case: the poll runs every 10s and most of them change nothing.
    const before = new Map([["gam_001", "10-8"]])
    expect(changedScores(before, [game()]).games).toEqual([])
  })

  it("ignores a fixture with no score rather than reading it as nil–nil", () => {
    // Null is "not played yet". A scheduled game must not announce 0–0, and
    // must not be remembered as having done so.
    const { games, seen } = changedScores(new Map(), [
      game({ homeScore: null, awayScore: null }),
    ])
    expect(games).toEqual([])
    expect(seen.has("gam_001")).toBe(false)
  })

  it("does not announce a game that only just gained a score", () => {
    // 0–0 → first basket. The game was skipped while unscored, so it has no
    // previous value and this is a first sighting, not a change.
    const before = changedScores(new Map(), [game({ homeScore: null, awayScore: null })]).seen
    expect(changedScores(before, [game({ homeScore: 2, awayScore: 0 })]).games).toEqual([])
  })

  it("reports several games in one poll", () => {
    const before = new Map([
      ["gam_001", "10-8"],
      ["gam_002", "4-4"],
      ["gam_003", "0-0"],
    ])
    const now = [
      game({ id: "gam_001", homeScore: 12 }),
      game({ id: "gam_002", homeScore: 4, awayScore: 6 }),
      game({ id: "gam_003", homeScore: 0, awayScore: 0 }),
    ]
    expect(changedScores(before, now).games.map((g) => g.id)).toEqual(["gam_001", "gam_002"])
  })

  it("forgets a game that dropped out of the live list", () => {
    // `seen` is rebuilt from the current poll, so a finished game does not
    // accumulate. Otherwise the map grows for the life of the app run.
    const before = new Map([["gam_old", "50-48"], ["gam_001", "10-8"]])
    const { seen } = changedScores(before, [game()])
    expect([...seen.keys()]).toEqual(["gam_001"])
  })
})

describe("scoreBody — the same payload the server sends", () => {
  it("is a PushBody with the server's tag scheme", () => {
    const body = scoreBody(game({ eventName: "Bangkok Schools League" }))
    // `announce()` in src/api/games.ts sends `score:<gameId>` so a second
    // update replaces the first. A native card that stacked would be a
    // different experience for the same event.
    expect(body.tag).toBe("score:gam_001")
    expect(body.url).toBe("#/games/gam_001")
    expect(body.title).toContain("10")
    expect(body.title).toContain("8")
    expect(body.body).toContain("Bangkok Schools League")
  })

  it("does not render a dangling preposition when the event is unknown", () => {
    // The body template is "Live at {event}". `games.list` does not return the
    // event name — the caller resolves it — so an unresolved one must not
    // produce "Live at ".
    const body = scoreBody(game({ eventName: null }))
    expect(body.body.trim()).not.toMatch(/\bat$/)
    expect(body.body.length).toBeGreaterThan(0)
  })
})
