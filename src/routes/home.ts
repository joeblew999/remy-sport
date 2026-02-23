import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import type { AppEnv } from "../types"
import { layout } from "../views/layout"

const home = new OpenAPIHono<AppEnv>()

home.get("/", (c) => {
  const user = c.get("user")
  return c.html(layout("Remy Sport", `
  <div class="text-center max-w-xl px-8">
    <h1 class="text-5xl font-bold mb-2">Remy Sport</h1>
    <p class="text-base-content/60 text-lg mb-8">Sports platform for basketball</p>
    ${
      user
        ? `<div class="card bg-base-100 shadow mb-6">
             <div class="card-body py-3">
               <p>Signed in as <strong>${user.name || user.email}</strong></p>
             </div>
           </div>
           <div class="flex gap-4 justify-center">
             <a href="/api/auth/sign-out" class="btn btn-outline">Sign Out</a>
           </div>`
        : `<div class="flex gap-4 justify-center">
             <a href="/login" class="btn btn-primary">Sign In</a>
             <a href="/login?mode=signup" class="btn btn-outline">Create Account</a>
           </div>`
    }
    <div id="version-info" class="mt-12 text-xs text-base-content/40"></div>
  </div>
  <script>
    fetch('/api/versions')
      .then(r => r.ok ? r.json() : null)
      .then(v => {
        if (!v || v.error) return
        const el = document.getElementById('version-info')
        const link = v.url ? '<a href="' + v.url + '" class="link link-hover">' + v.url + '</a>' : ''
        el.innerHTML = 'v' + v.app + ' · ' + v.git.commit + ' · ' + v.git.branch + (link ? '<br>' + link : '')
      })
      .catch(() => {})
  </script>`))
})

const healthRoute = createRoute({
  method: "get",
  path: "/api/health",
  responses: {
    200: {
      description: "System health check",
      content: {
        "application/json": {
          schema: z.object({
            status: z.literal("ok"),
            timestamp: z.string(),
          }),
        },
      },
    },
  },
})

home.openapi(healthRoute, (c) => {
  return c.json({ status: "ok" as const, timestamp: new Date().toISOString() })
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
