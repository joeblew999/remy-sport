import { Hono } from "hono"
import type { AppEnv } from "../types"
import { layout } from "../views/layout"
import { homePage } from "../views/home"

const home = new Hono<AppEnv>()

home.get("/", (c) => {
  return c.html(layout("Remy Sport", homePage(c.get("user"))))
})

// Versions endpoint — serves versions.json for the GUI
home.get("/api/versions", async (c) => {
  try {
    const versions = await import("../../versions.json")
    return c.json(versions.default ?? versions)
  } catch {
    return c.json({ error: "versions.json not found — run: task versions" }, 404)
  }
})

export default home
