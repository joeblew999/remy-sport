import { afterEach, expect, it } from "vitest"
import { createServer, type Server } from "node:net"
import { spawn, type ChildProcess } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { managedProcess, type ManagedProcess } from "../../scripts/lib/remote-process.ts"
import { readSession, serveSession } from "../../scripts/lib/remote-control.ts"
import { RemoteSession } from "../../scripts/lib/remote-session.ts"

const servers: Server[] = []
const children: ManagedProcess[] = []
const parents: ChildProcess[] = []
afterEach(async () => {
  for (const parent of parents.splice(0)) parent.kill("SIGTERM")
  await Promise.all(children.splice(0).map(child => child.stop()))
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})
async function witness(): Promise<{ port: number; started: Promise<number> }> {
  let accept!: (pid: number) => void
  const started = new Promise<number>(resolve => { accept = resolve })
  const server = createServer(socket => socket.once("data", data => { accept(Number(data.toString())); socket.end() }))
  servers.push(server)
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  return { port: (server.address() as { port: number }).port, started }
}
function fixture(port: number): string {
  return `const net = require('node:net'); const socket = net.connect(${port}, '127.0.0.1', () => socket.write(String(process.pid))); setInterval(() => {}, 1000);`
}
async function assertGone(pid: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { process.kill(pid, 0) } catch { return }
    await delay(50)
  }
  throw new Error(`Owned child ${pid} remained after cleanup`)
}

it("stop targets the selected workspace and concurrent bind cannot create a second owner", async () => {
  let stopped = false
  const server = await serveSession(() => ({ workspace: "first", phase: "ready", owned: ["app"] }), () => { stopped = true }, 0)
  servers.push(server)
  const port = (server.address() as { port: number }).port
  await expect(readSession("other", true, port)).rejects.toThrow("Another checkout")
  expect(stopped).toBe(false)
  await expect(serveSession(() => ({ workspace: "first", phase: "ready", owned: [] }), () => {}, port)).rejects.toMatchObject({ code: "EADDRINUSE" })
  expect(await readSession("first", false, port)).toMatchObject({ phase: "ready", owned: ["app"] })
  await readSession("first", true, port)
  expect(stopped).toBe(true)
})

it("managed stop terminates its child, leaving an unrelated process alive", async () => {
  const owned = await witness(), unrelated = await witness()
  const child = managedProcess(process.execPath, ["-e", fixture(owned.port)])
  const other = managedProcess(process.execPath, ["-e", fixture(unrelated.port)])
  children.push(child, other)
  const [pid, otherPid] = await Promise.all([owned.started, unrelated.started])
  await child.stop()
  await assertGone(pid)
  expect(() => process.kill(otherPid, 0)).not.toThrow()
})

it.each(["node", "bun"])("guardian cleans up if its %s parent is forcibly killed", async runtime => {
  const owned = await witness()
  const moduleUrl = new URL("../../scripts/lib/remote-process.ts", import.meta.url).href
  const source = `import { managedProcess } from ${JSON.stringify(moduleUrl)}; managedProcess(process.execPath, ['-e', ${JSON.stringify(fixture(owned.port))}]);`
  const parent = spawn(runtime === "node" ? process.execPath : "bun", runtime === "node" ? ["--input-type=module", "-e", source] : ["--eval", source], { stdio: "ignore" })
  parents.push(parent)
  const pid = await owned.started
  parent.kill("SIGKILL")
  await assertGone(pid)
})

it("cleanup force-stops an owned child that ignores graceful shutdown", async () => {
  const owned = await witness()
  const child = managedProcess(process.execPath, ["-e", `process.on('SIGTERM', () => {}); ${fixture(owned.port)}`])
  children.push(child)
  const pid = await owned.started
  await child.stop()
  await assertGone(pid)
}, 10_000)

it("partial startup failure releases previously owned children", async () => {
  const owned = await witness()
  const session = new RemoteSession()
  let pid: number | undefined
  try {
    await session.launch("app", process.execPath, ["-e", fixture(owned.port)])
    pid = await owned.started
    await session.launch("failed tunnel", process.execPath, ["-e", "process.exit(7)"])
    await session.untilStopped()
    expect(session.error?.message).toContain("failed tunnel exited (7)")
  } finally { await session.close() }
  await assertGone(pid!)
})

it("cancelling interactive preparation stops it and remains resumable", async () => {
  const owned = await witness()
  const session = new RemoteSession()
  const preparing = session.once(process.execPath, ["-e", fixture(owned.port)])
  const caught = preparing.catch(error => error)
  const pid = await owned.started
  session.stop()
  expect(await caught).toBeDefined()
  await session.close()
  expect(session.owned.size).toBe(0)
  await assertGone(pid)
})
