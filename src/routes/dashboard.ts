import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import type { AppEnv } from "../types"
import { layout } from "../views/layout"
import { dashboardPage } from "../views/dashboard"
import * as schema from "../db/schema"

const dashboard = new Hono<AppEnv>()

dashboard.get("/dashboard", async (c) => {
  const user = c.get("user")
  if (!user) return c.redirect("/login")

  const db = drizzle(c.env.DB, { schema })
  const events = await db.select().from(schema.event).all()

  return c.html(
    layout(
      "Dashboard — Remy Sport",
      dashboardPage(
        user,
        events.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
      ),
    ),
  )
})

export default dashboard
