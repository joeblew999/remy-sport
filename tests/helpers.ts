import { expect } from "@playwright/test"

// ── Seed actors (matches src/routes/seed.ts) ────────────────────────────────

export const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" } as const
export const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" } as const
export const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" } as const
export const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" } as const
export const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" } as const
export const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" } as const

export type Actor = typeof ADMIN

export const ALL_ACTORS = [ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE] as const

// ── Helpers ─────────────────────────────────────────────────────────────────

export async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

export async function seed(request: any) {
  await request.post("/api/seed")
}
