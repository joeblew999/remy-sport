import { afterEach, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { request as httpRequest } from "node:http"
import { createServer, type ViteDevServer } from "vite"
import { remoteIdentity, IDENTITY_PATH, ACCESS_PATH, workspaceId } from "../../scripts/lib/remote-identity.ts"
import { remoteAccess } from "../../scripts/lib/remote-access.ts"

let server: ViteDevServer | undefined
afterEach(async () => { await server?.close(); server = undefined })
it("the real Vite stack keeps the tunnel closed until a local lease, and closes it after expiry", async () => {
  const host = "dev.example.test"
  server = await createServer({
    configFile: false, root: process.cwd(), logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
    plugins: [remoteIdentity(process.cwd(), host, 400), {
      name: "fixture-backend", enforce: "pre", configureServer(s) {
        s.middlewares.use((_req, res) => { res.end("private app content") })
      },
    }],
  })
  await server.listen()
  const port = (server.httpServer!.address() as { port: number }).port
  const origin = `http://127.0.0.1:${port}`
  // A real reverse proxy supplies Host. Fetch implementations may override it.
  const remote = (path: string, options: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
    const req = httpRequest(`${origin}${path}`, { method: options.method, headers: { Host: host, ...options.headers as Record<string, string> } }, res => {
      let body = ""
      res.on("data", chunk => { body += chunk })
      res.on("end", () => resolve(new Response(body, { status: res.statusCode })))
    })
    req.on("error", reject)
    req.end(options.body)
  })
  expect((await remote("/private")).status).toBe(403)
  const publicIdentity = await (await remote(IDENTITY_PATH)).json() as Record<string, unknown>
  expect(publicIdentity.remoteAccess).toBe(false)
  expect(publicIdentity).not.toHaveProperty("accessKey")
  const forwardedIdentity = await (await fetch(`${origin}${IDENTITY_PATH}`, { headers: { "X-Forwarded-Proto": "https" } })).json() as Record<string, unknown>
  expect(forwardedIdentity).not.toHaveProperty("accessKey")
  expect((await fetch(`${origin}/private`)).status).toBe(200)
  const localIdentity = await (await fetch(`${origin}${IDENTITY_PATH}`)).json() as { accessKey: string }
  const owner = randomUUID()
  const command = { method: "POST", headers: { "X-Remy-Access-Key": localIdentity.accessKey, "Content-Type": "application/json" }, body: JSON.stringify({ owner, action: "enable" }) }
  expect((await remote(ACCESS_PATH, command)).status).toBe(403)
  expect((await fetch(`${origin}${ACCESS_PATH}`, { ...command, headers: { ...command.headers, Origin: origin } })).status).toBe(403)
  const request = ((url, init) => fetch(String(url).replace("http://localhost:8787", origin), init)) as typeof fetch
  await remoteAccess("enable", owner, workspaceId(process.cwd()), request)
  expect(await (await remote("/private")).text()).toBe("private app content")
  await expect(remoteAccess("disable", randomUUID(), workspaceId(process.cwd()), request)).rejects.toThrow("409")
  await remoteAccess("disable", owner, workspaceId(process.cwd()), request)
  expect((await remote("/private")).status).toBe(403)
  await remoteAccess("enable", owner, workspaceId(process.cwd()), request)
  await new Promise(resolve => setTimeout(resolve, 500))
  expect((await remote("/private")).status).toBe(403)
  expect((await fetch(`${origin}/private`)).status).toBe(200)
})
