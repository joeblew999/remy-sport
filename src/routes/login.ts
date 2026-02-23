import { Hono } from "hono"
import type { AppEnv } from "../types"
import { layout } from "../views/layout"
import { loginPage } from "../views/login"

const login = new Hono<AppEnv>()

login.get("/login", (c) => {
  if (c.get("user")) return c.redirect("/")
  return c.html(layout("Sign In — Remy Sport", loginPage()))
})

export default login
