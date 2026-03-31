import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"
import { ownedBy } from "../middleware/owned-by"

const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreatePlayerSchema = z.object({
  name: z.string().min(1),
  position: z.string().optional(),
})

const UpdatePlayerSchema = z.object({
  name: z.string().min(1).optional(),
  position: z.string().optional(),
})

const ErrorSchema = z.object({ error: z.string() })

function serializePlayer(row: typeof schema.playerProfile.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const players = new OpenAPIHono<AppEnv>()

// ── GET /api/players — public, list all player profiles ────────────────────

const listPlayersRoute = createRoute({
  method: "get",
  path: "/api/players",
  responses: {
    200: {
      description: "List all player profiles",
      content: { "application/json": { schema: z.object({ players: z.array(PlayerSchema) }) } },
    },
  },
})

players.openapi(listPlayersRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.playerProfile).all()
  return c.json({ players: rows.map(serializePlayer) })
})

// ── GET /api/players/:id — public, get single player ──────────────────────

const getPlayerRoute = createRoute({
  method: "get",
  path: "/api/players/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Player profile details",
      content: { "application/json": { schema: PlayerSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
})

players.openapi(getPlayerRoute, async (c) => {
  const { id } = c.req.valid("param")
  const db = drizzle(c.env.DB, { schema })
  const row = await db.select().from(schema.playerProfile).where(eq(schema.playerProfile.id, id)).get()
  if (!row) return c.json({ error: "Not found" }, 404)
  return c.json(serializePlayer(row), 200)
})

// ── POST /api/players — requires player:create ────────────────────────────

const createPlayerRoute = createRoute({
  method: "post",
  path: "/api/players",
  request: {
    body: { content: { "application/json": { schema: CreatePlayerSchema } } },
  },
  responses: {
    201: {
      description: "Player profile created",
      content: { "application/json": { schema: PlayerSchema } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [
    requirePermission("player", "create"),
  ] as const,
})

players.openapi(createPlayerRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof CreatePlayerSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()

  const row = {
    id,
    name: body.name,
    position: body.position ?? null,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.playerProfile).values(row)

  return c.json(
    {
      ...row,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    201,
  )
})

// ── PUT /api/players/:id — requires player:update + ownership ─────────────

const updatePlayerRoute = createRoute({
  method: "put",
  path: "/api/players/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: UpdatePlayerSchema } } },
  },
  responses: {
    200: {
      description: "Player profile updated",
      content: { "application/json": { schema: PlayerSchema } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [
    requirePermission("player", "update"),
    ownedBy(schema.playerProfile, "id"),
  ] as const,
})

players.openapi(updatePlayerRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const body = c.req.valid("json" as never) as z.infer<typeof UpdatePlayerSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()

  await db
    .update(schema.playerProfile)
    .set({ ...body, updatedAt: now })
    .where(eq(schema.playerProfile.id, id))

  const updated = await db.select().from(schema.playerProfile).where(eq(schema.playerProfile.id, id)).get()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(serializePlayer(updated), 200)
})

export default players
