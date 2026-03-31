import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// user:manage — admin only
const NON_ADMINS = [ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

test.describe.serial("User management — admin only", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("admin CAN list all users", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.get("/api/users")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.users.length).toBeGreaterThanOrEqual(6)
  })

  test("admin CAN get single user", async ({ request }) => {
    await signIn(request, ADMIN)
    const list = await request.get("/api/users")
    const { users } = await list.json()
    const res = await request.get(`/api/users/${users[0].id}`)
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).id).toBe(users[0].id)
  })

  test("admin CAN update user role", async ({ request }) => {
    await signIn(request, ADMIN)
    const list = await request.get("/api/users")
    const { users } = await list.json()
    const spectator = users.find((u: any) => u.email === SPECTATOR.email)

    const res = await request.put(`/api/users/${spectator.id}`, {
      data: { banned: true, banReason: "Test ban" },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).banned).toBe(true)

    // Unban
    const unban = await request.put(`/api/users/${spectator.id}`, {
      data: { banned: false },
    })
    expect(unban.ok()).toBeTruthy()
  })

  for (const actor of NON_ADMINS) {
    test(`${actor.role} CANNOT list users (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.get("/api/users")
      expect(res.status()).toBe(403)
    })
  }

  for (const actor of NON_ADMINS) {
    test(`${actor.role} CANNOT update users (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.put("/api/users/some-id", {
        data: { role: "admin" },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401 on list", async ({ request }) => {
    const res = await request.get("/api/users")
    expect(res.status()).toBe(401)
  })

  test("unauthenticated user gets 401 on update", async ({ request }) => {
    const res = await request.put("/api/users/some-id", {
      data: { role: "admin" },
    })
    expect(res.status()).toBe(401)
  })
})
