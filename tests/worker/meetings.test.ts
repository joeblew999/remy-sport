import { env } from "cloudflare:test"
import { call } from "@orpc/server"
import { expect, it } from "vitest"
import { create, mine, respond } from "../../src/api/meetings"
import { SEED_ENTITIES } from "../../src/domain/model/entities"
import { signIn } from "./helpers"

/**
 * Meetings, against the Worker rather than against a stub.
 *
 * The rendering tier covers what a reader sees, and covers it well — fifteen
 * checks. What nothing covered was the half that decides whether a meeting is
 * private: the procedures' own policy, executed. `create` and `respond` declare
 * `requireAction`, write rows scoped to the caller, and fan a notification out
 * to the invited; a seeded query cannot exercise any of that, because it never
 * reaches the code.
 *
 * That gap was step 6 of docs/2026-09-09-13-meetings.md, half-done for a day
 * while the plan's status line still said "proposed" and the feature was live
 * in production.
 *
 * The assertions below are about *authority and scope*, not about titles:
 * whether somebody who was not invited can answer for the meeting, whether the
 * creator has to accept their own invitation, and whether "my meetings" means
 * mine. Those are the questions a stub cannot be wrong about and a database can.
 */

const request = (cookie = "") => new Request("https://remy.test/api/meetings", { headers: { Cookie: cookie } })
const as = (cookie: string) => ({ context: { env, request: request(cookie) } })

/**
 * Three seeded people, looked up rather than typed.
 *
 * The first draft hardcoded `wichai.s@bat.test` and every test failed at
 * sign-in with a 400 — the address is `wichai.s@assumption.test`. Reading them
 * from the model means a renamed fixture breaks the seed check rather than
 * five tests here.
 */
const byRole = (role: string, skip: string[] = []) =>
  SEED_ENTITIES.users.find((u) => u.roleCode === role && !skip.includes(u.email))!
const CREATOR = byRole("COACH")
const GUEST = byRole("COACH", [CREATOR.email])
const OUTSIDER = byRole("SPECTATOR")

it("the creator is already in, and the invited are only invited", async () => {
  const coach = await signIn(CREATOR.email)
  const guest = await signIn(GUEST.email)
  const guestId = GUEST.id

  const { id } = await call(create, { title: "Selection", userIds: [guestId] }, as(coach))

  // The creator does not have to accept their own invitation — "meetings I am
  // in" is one query, and a room you convened is not a request you answer.
  const forCreator = await call(mine, undefined, as(coach))
  expect(forCreator.meetings.find((mt) => mt.id === id)?.myStatusCode).toBe("ACCEPTED")

  // The guest is in it, and has not agreed to anything yet.
  const forGuest = await call(mine, undefined, as(guest))
  expect(forGuest.meetings.find((mt) => mt.id === id)?.myStatusCode).toBe("INVITED")
})

it("a meeting you are not in is not yours to answer, and not yours to see", async () => {
  const coach = await signIn(CREATOR.email)
  const guestId = GUEST.id
  const { id } = await call(create, { title: "Private", userIds: [guestId] }, as(coach))

  // Somebody with no part in it. `respond` scopes its update to the caller's
  // own row, so there is nothing to change and the answer is NOT_FOUND rather
  // than a silent success — the distinction that matters, because a silent
  // success would let anybody mark a stranger's invitation accepted.
  const stranger = await signIn(OUTSIDER.email)
  await expect(
    call(respond, { meetingId: id, statusCode: "ACCEPTED" }, as(stranger)),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })

  // And it does not appear in their list at all.
  const theirs = await call(mine, undefined, as(stranger))
  expect(theirs.meetings.map((mt) => mt.id)).not.toContain(id)
})

it("answering changes only the answerer's own standing", async () => {
  const coach = await signIn(CREATOR.email)
  const guest = await signIn(GUEST.email)
  const guestId = GUEST.id
  const { id } = await call(create, { title: "Declining", userIds: [guestId] }, as(coach))

  await call(respond, { meetingId: id, statusCode: "DECLINED" }, as(guest))

  const forGuest = await call(mine, undefined, as(guest))
  expect(forGuest.meetings.find((mt) => mt.id === id)?.myStatusCode).toBe("DECLINED")
  // The creator's own standing is untouched by somebody else's answer.
  const forCreator = await call(mine, undefined, as(coach))
  expect(forCreator.meetings.find((mt) => mt.id === id)?.myStatusCode).toBe("ACCEPTED")
})

it("a meeting with nobody but yourself in it is refused", async () => {
  const coach = await signIn(CREATOR.email)
  const coachId = CREATOR.id

  // The handler filters the caller out of the invited list, so inviting only
  // yourself leaves nobody — which is a mistake worth naming rather than a
  // room that silently has one seat.
  await expect(
    call(create, { title: "Alone", userIds: [coachId] }, as(coach)),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
})

/**
 * Not covered here, and named rather than left as a silence: the **fan-out**.
 *
 * `create` calls `notify` with `users: [...]` and `targets: []` — addressed
 * rather than broadcast, because a meeting is the thing being announced and no
 * relation can derive who was invited. Every test above exercises that path
 * (a throw in `notify` would fail `create`), but none asserts *who* it reached.
 *
 * Doing so needs `audience`, which is module-private in `src/api/push.ts`, or
 * the RFC 8291 subscriber machinery in `./push.test.ts`. Exporting an internal
 * to test it, or duplicating that machinery here, both cost more than the
 * assertion is worth today — and `push.test.ts` covers the broadcast path, so
 * what is untested is specifically `users:` with an empty `targets`.
 *
 * If a meeting invitation ever reaches the wrong person, this is the gap it
 * came through.
 */
