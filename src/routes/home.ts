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
      .then(data => {
        if (!data || data.error) return
        const el = document.getElementById('version-info')
        const c = data.current || data
        let html = '<strong>v' + c.app + '</strong> · ' + c.git.commit + ' · ' + c.git.branch
        if (c.url) html += '<br><a href="' + c.url + '" class="link link-hover">' + c.url + '</a>'

        // App deploy history
        if (data.history && data.history.length > 0) {
          html += '<details class="mt-3 text-left"><summary class="cursor-pointer">Deploy history (' + data.history.length + ')</summary><ul class="mt-1 space-y-1">'
          data.history.forEach(h => {
            html += '<li>' + h.git.commit + ' · v' + h.app + ' · ' + h.git.branch + '</li>'
          })
          html += '</ul></details>'
        }

        // CF worker versions with preview links
        if (data.cf_versions && data.cf_versions.length > 0) {
          html += '<details class="mt-2 text-left"><summary class="cursor-pointer">CF versions (' + data.cf_versions.length + ')</summary><ul class="mt-1 space-y-1">'
          data.cf_versions.forEach(v => {
            const label = '#' + v.number + ' · ' + v.id.slice(0, 8) + ' · ' + v.source + ' · ' + new Date(v.created).toLocaleDateString()
            if (v.url) {
              html += '<li><a href="' + v.url + '" class="link link-hover">' + label + '</a></li>'
            } else {
              html += '<li>' + label + '</li>'
            }
          })
          html += '</ul></details>'
        }

        el.innerHTML = html
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
