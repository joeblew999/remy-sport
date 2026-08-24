import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import { createAuth } from "../auth"
import type { AppEnv } from "../types"
import { layout } from "../views/layout"
import { dashboardPage } from "../views/dashboard"
import * as schema from "../db/schema"

type AdminUser = {
  id: string
  email: string
  name: string | null
  role?: string | null
  banned?: boolean | null
}

const dashboard = new Hono<AppEnv>()

dashboard.get("/dashboard", async (c) => {
  const user = c.get("user")
  if (!user) return c.redirect("/login")

  const db = drizzle(c.env.DB, { schema })
  const events = await db.select().from(schema.event).all()

  // The admin console is server-rendered rather than fetched, so an admin sees
  // the account list on first paint. Fetched via auth.api so it goes through
  // the plugin's own permission check — reading the `user` table directly would
  // be a second answer to "may you see this", which is the drift ADR 007 §3
  // objected to.
  const session = c.get("session")
  let accounts: Awaited<ReturnType<typeof listAccounts>> = null
  if (user.role === "admin") accounts = await listAccounts(c)

  async function listAccounts(ctx: typeof c) {
    try {
      const auth = createAuth(ctx)
      const res = await auth.api.listUsers({
        headers: ctx.req.raw.headers,
        query: { limit: 50, sortBy: "createdAt", sortDirection: "asc" },
      })
      return (res as { users: AdminUser[] }).users
    } catch {
      // An admin whose session cannot list users is a configuration problem,
      // not a reason to 500 the whole page.
      return null
    }
  }

  return c.html(
    layout(
      "Dashboard — Remy Sport",
      dashboardPage(
        user,
        events.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
        accounts,
        // Populated only while impersonating — the column migration 0003 added
        // and nothing wrote until ADR 013.
        (session as { impersonatedBy?: string | null } | null)?.impersonatedBy ?? null,
      ),
    ),
  )
})

export default dashboard
