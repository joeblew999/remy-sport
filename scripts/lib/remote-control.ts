import { createServer, createConnection, type Server } from "node:net"

// An OS-owned listener serializes startup and disappears after a crash. Raw TCP
// (not HTTP) keeps browser pages from issuing local stop requests. No PID files.
export const CONTROL_PORT = 8789
export interface SessionStatus { workspace: string; phase: string; owned: string[] }
export async function readSession(workspace: string, stop = false, port = CONTROL_PORT): Promise<SessionStatus | null> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port })
    let buffer = ""
    socket.setTimeout(3000, () => socket.destroy(new Error("Remote supervisor did not respond.")))
    socket.on("connect", () => socket.write(JSON.stringify({ protocol: "remy-remote-v1", workspace, action: stop ? "stop" : "status" }) + "\n"))
    socket.on("data", data => {
      buffer += data.toString()
      if (buffer.length > 8192) { socket.destroy(new Error("Invalid supervisor response.")); return }
      if (!buffer.includes("\n")) return
      try {
        const response = JSON.parse(buffer.split("\n")[0]!)
        if (response.workspace !== workspace) throw new Error("Another checkout owns remote port 8789; leave its session running.")
        if (typeof response.phase !== "string" || !Array.isArray(response.owned)) throw new Error("Invalid supervisor response.")
        resolve(response)
        socket.end()
      } catch (error) { socket.destroy(); reject(error) }
    })
    socket.on("error", error => (error as NodeJS.ErrnoException).code === "ECONNREFUSED" ? resolve(null) : reject(error))
    socket.on("end", () => { if (!buffer.includes("\n")) reject(new Error("Remote supervisor closed without a status response.")) })
  })
}
export async function serveSession(status: () => SessionStatus, stop: () => void, port = CONTROL_PORT): Promise<Server> {
  const server = createServer(socket => {
    let buffer = ""
    socket.setTimeout(3000, () => socket.destroy())
    socket.on("error", () => {})
    socket.on("data", data => {
      buffer += data.toString()
      if (buffer.length > 8192) { socket.destroy(); return }
      if (!buffer.includes("\n")) return
      try {
        const request = JSON.parse(buffer.split("\n")[0]!)
        if (request.protocol !== "remy-remote-v1" || !["status", "stop"].includes(request.action)) { socket.destroy(); return }
        const current = status()
        socket.end(JSON.stringify(current) + "\n")
        if (request.workspace === current.workspace && request.action === "stop") stop()
      } catch { socket.destroy() }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve() })
  })
  return server
}
