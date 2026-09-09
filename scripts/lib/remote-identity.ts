import { createHash, randomUUID } from "node:crypto"
import { realpathSync } from "node:fs"
import type { IncomingMessage } from "node:http"
import type { Socket } from "node:net"
import type { Plugin } from "vite"

export const IDENTITY_PATH = "/__remy_remote"
export const ACCESS_PATH = `${IDENTITY_PATH}/access`
export function workspaceId(root: string): string {
  return createHash("sha256").update(realpathSync(root)).digest("hex")
}
export interface DevIdentity { workspace: string; instance: string; remoteAccess?: boolean }
export function parseIdentity(value: unknown): DevIdentity | null {
  const v = value as Partial<DevIdentity> | null
  return v && typeof v.workspace === "string" && /^[a-f0-9]{64}$/.test(v.workspace) && typeof v.instance === "string" && /^[a-f0-9-]{36}$/.test(v.instance)
    ? { workspace: v.workspace, instance: v.instance, ...(typeof v.remoteAccess === "boolean" ? { remoteAccess: v.remoteAccess } : {}) } : null
}
function forwarded(req: IncomingMessage): boolean {
  return Object.keys(req.headers).some(h => h.startsWith("cf-") || h.startsWith("x-forwarded-"))
}
function localControl(req: IncomingMessage): boolean {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")
    && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host ?? "")
    && !req.headers.origin && !forwarded(req)
}

/**
 * Dev only. The exact tunnel host passes Vite's HTTP/WebSocket host checks, but
 * this gate keeps the app closed until a local CLI session obtains a lease.
 * Identity and liveness remain readable to verify an existing connector safely.
 * Expiry closes access even after a supervisor crash; no consent flag is saved.
 */
export function remoteIdentity(root: string, hostname?: string, leaseMs = 45_000): Plugin {
  if (hostname && !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname)) throw new Error("Invalid dev tunnel hostname")
  return {
    name: "remy:remote-identity",
    apply: "serve",
    enforce: "pre",
    config: () => hostname ? { server: { allowedHosts: [hostname] } } : {},
    configureServer(server) {
      const identity: DevIdentity = { workspace: workspaceId(root), instance: randomUUID() }
      const accessKey = randomUUID()
      let owner: string | undefined
      let timer: ReturnType<typeof setTimeout> | undefined
      const sockets = new Set<Socket>()
      const track = (socket: Socket) => {
        if (sockets.has(socket)) return
        sockets.add(socket)
        socket.once("close", () => sockets.delete(socket))
      }
      const closeAccess = () => {
        owner = undefined
        clearTimeout(timer)
        for (const socket of sockets) socket.destroy()
        sockets.clear()
      }
      const remoteRequest = (req: IncomingMessage) => !!hostname && (req.headers.host?.split(":")[0] === hostname || forwarded(req))
      server.httpServer?.prependListener("upgrade", (req, socket) => {
        if (!remoteRequest(req)) return
        if (!owner) { socket.destroy(); return }
        track(socket as Socket)
      })
      server.httpServer?.once("close", closeAccess)
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0]
        const json = (code: number, body: unknown) => {
          res.statusCode = code
          res.setHeader("Cache-Control", "no-store")
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify(body))
        }
        if (path === IDENTITY_PATH) {
          if (req.method !== "GET") { json(405, {}); return }
          json(200, { ...identity, remoteAccess: !!owner, ...(localControl(req) ? { accessKey } : {}) })
          return
        }
        if (path === ACCESS_PATH) {
          if (req.method !== "POST" || !localControl(req) || req.headers["x-remy-access-key"] !== accessKey) { json(403, {}); return }
          let body = ""
          req.on("data", chunk => { body += chunk; if (body.length > 512) req.destroy() })
          req.on("end", () => {
            try {
              const command = JSON.parse(body)
              if (!/^[a-f0-9-]{36}$/.test(command.owner ?? "") || !["enable", "disable"].includes(command.action)) { json(400, {}); return }
              if (owner && owner !== command.owner) { json(409, { error: "Another remote session owns app access." }); return }
              if (command.action === "disable") closeAccess()
              else {
                owner = command.owner
                clearTimeout(timer)
                timer = setTimeout(closeAccess, leaseMs)
                timer.unref()
              }
              json(200, { enabled: !!owner })
            } catch { json(400, {}) }
          })
          return
        }
        if (remoteRequest(req) && path !== "/api/health") {
          if (!owner) { json(403, { error: "Remote app access is closed. Start bun run ops remote on the development host." }); return }
          track(req.socket)
        }
        next()
      })
    },
  }
}
