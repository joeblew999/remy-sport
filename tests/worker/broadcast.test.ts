import { describe, expect, it } from "vitest"
import { actorFor, api, signIn } from "./helpers"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/domain/model/entities"

/**
 * Who may broadcast a game, and how anyone finds out that somebody is.
 *
 * Both halves exist because of one fact about the relay: Cloudflare does not
 * support broadcast discovery, so `announced()` yields nothing there and no
 * client can ask what is live. The app has to answer it, which means the app
 * has to be told — and being told is a write, which needs a permission.
 */

/** The referee the fixtures put on a game, and the game they are on. */
const refereedGame = SEED_RELATIONSHIPS.gameReferees[0]!
const refereeEmail = SEED_ENTITIES.users.find((u) => u.id === refereedGame.userId)!.email

const broadcast = (gameId: string, cookie?: string) =>
  api(`/api/games/${gameId}/broadcast`, { method: "PUT", body: JSON.stringify({ id: gameId }), cookie })

const stop = (gameId: string, cookie: string) =>
  api(`/api/games/${gameId}/broadcast`, { method: "DELETE", body: JSON.stringify({ id: gameId }), cookie })

const gameById = async (gameId: string, cookie?: string) => {
  const res = await api(`/api/games/${gameId}`, { cookie })
  return (await res.json()) as { isBroadcasting: boolean; canBroadcast: boolean }
}

describe("Who may broadcast a game", () => {
  it("refuses a stranger", async () => {
    expect((await broadcast(refereedGame.gameId)).status).toBe(401)
  })

  it("refuses a signed-in person with no relation to the game", async () => {
    // A spectator holds no relation to this game, which is the whole point of
    // granting BROADCAST_GAME to relations rather than to a role.
    const cookie = await signIn(actorFor("SPECTATOR"))
    expect((await broadcast(refereedGame.gameId, cookie)).status).toBe(403)
  })

  it("allows the referee assigned to that game", async () => {
    const cookie = await signIn(refereeEmail)
    expect((await broadcast(refereedGame.gameId, cookie)).status).toBe(200)
  })

  it("does not let that referee broadcast a game they are not on", async () => {
    // The failure the model exists to prevent: ENTER_SCORES was once granted to
    // ANY_REFEREE, the platform role, so every referee could score every game.
    const theirs = new Set(
      SEED_RELATIONSHIPS.gameReferees
        .filter((r) => r.userId === refereedGame.userId)
        .map((r) => r.gameId),
    )
    const other = SEED_ENTITIES.games.find((g) => !theirs.has(g.id as never))!
    const cookie = await signIn(refereeEmail)
    expect((await broadcast(other.id, cookie)).status).toBe(403)
  })
})

describe("Knowing that somebody is broadcasting", () => {
  it("is false until somebody says otherwise, and true once they do", async () => {
    const cookie = await signIn(refereeEmail)
    // Explicitly, rather than assuming a clean slate: these tests share one
    // database and an earlier one announces a broadcast on this same game.
    await stop(refereedGame.gameId, cookie)
    const before = await gameById(refereedGame.gameId)
    expect(before.isBroadcasting, "nothing is being broadcast after a stop").toBe(false)

    expect((await broadcast(refereedGame.gameId, cookie)).status).toBe(200)
    expect((await gameById(refereedGame.gameId)).isBroadcasting).toBe(true)

    expect((await stop(refereedGame.gameId, cookie)).status).toBe(200)
    expect((await gameById(refereedGame.gameId)).isBroadcasting).toBe(false)
  })

  it("is public — a viewer needs no account to find a game to watch", async () => {
    const cookie = await signIn(refereeEmail)
    await broadcast(refereedGame.gameId, cookie)
    // No cookie: watching is VIEW_LIVE_STREAM, which the model grants to PUBLIC.
    expect((await gameById(refereedGame.gameId)).isBroadcasting).toBe(true)
  })

  it("survives the same publisher announcing twice, as one broadcast", async () => {
    // The heartbeat. A publisher refreshes every 20 seconds and must not create
    // a second row each time — one row per game is also Cloudflare's own rule,
    // since their relay allows a single publisher per path.
    const cookie = await signIn(refereeEmail)
    await broadcast(refereedGame.gameId, cookie)
    await broadcast(refereedGame.gameId, cookie)
    await broadcast(refereedGame.gameId, cookie)
    expect((await gameById(refereedGame.gameId)).isBroadcasting).toBe(true)

    // One stop ends it. If the refreshes had inserted rows, this would not.
    await stop(refereedGame.gameId, cookie)
    expect((await gameById(refereedGame.gameId)).isBroadcasting).toBe(false)
  })

  it("tells the referee they may broadcast, and a spectator that they may not", async () => {
    // What the Live page renders its buttons from. A Watch link on a game
    // nobody is broadcasting, or a Broadcast button for somebody who will be
    // refused, are both worse than no button.
    const ref = await gameById(refereedGame.gameId, await signIn(refereeEmail))
    expect(ref.canBroadcast).toBe(true)

    const spectator = await gameById(refereedGame.gameId, await signIn(actorFor("SPECTATOR")))
    expect(spectator.canBroadcast).toBe(false)
  })
})
