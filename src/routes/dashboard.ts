import { Hono } from "hono"
import type { AppEnv } from "../types"
import { layout } from "../views/layout"
import { dashboardPage } from "../views/dashboard"

const dashboard = new Hono<AppEnv>()

dashboard.get("/dashboard", async (c) => {
  const user = c.get("user")
  if (!user) return c.redirect("/login")

  return c.html(layout("Dashboard — Remy Sport", dashboardPage(user)))
})

export default dashboard
