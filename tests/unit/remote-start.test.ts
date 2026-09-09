import { beforeEach, afterEach, expect, it, vi } from "vitest"

const f = vi.hoisted(() => ({
  app: true, editor: true, loggedIn: true, connector: true, publicMatches: true, raceApp: false,
  calls: [] as string[], failLogin: false, wired: true,
}))
vi.mock("../../scripts/lib/remote-vscode.ts", () => ({
  editorStatus: () => ({ cli: "code", state: f.editor ? "connected" : "absent", serviceInstalled: false, loggedIn: f.loggedIn }),
  readCommand: () => ({ code: 0, out: "available" }),
}))
vi.mock("../../scripts/lib/remote-control.ts", () => ({
  readSession: vi.fn(async () => null),
  serveSession: vi.fn(async () => ({ close: (done: () => void) => done() })),
}))
vi.mock("../../scripts/lib/remote-status.ts", () => ({
  appStatus: async (origin: string) => ({ state: origin.startsWith("https") ? (f.publicMatches ? "ready" : "conflict") : f.app ? "ready" : "absent" }),
  sameInstance: (a: { state: string }, b: { state: string }) => a.state === "ready" && b.state === "ready",
  inspectRemote: async () => ({ ready: f.app && f.editor && f.connector, links: {} }),
  printRemote: () => { f.calls.push("report") },
  remoteExitCode: (s: { ready: boolean }) => s.ready ? 0 : 1,
  remoteIdentityWired: () => f.wired,
}))
vi.mock("../../scripts/lib/app-tunnel.ts", () => ({
  tunnelSettings: () => ({ name: "dev", hostname: "dev.example.test", service: "http://localhost:8787" }),
  cloudflareTunnelApi: async () => ({}),
  inspectTunnel: async () => ({ active: f.connector, configured: true, dnsMatches: true }),
  activeConnectors: (s: { active: boolean }) => s.active,
  connectorCount: (s: { active: boolean }) => s.active ? 1 : 0,
  ensureTunnel: async () => { f.calls.push("provision"); return { id: "id" } },
  tunnelRunToken: async () => "private-provider-token",
}))
vi.mock("../../scripts/lib/remote-process.ts", () => ({
  managedProcess: (bin: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => {
    const command = [bin, ...args].join(" ")
    f.calls.push(command)
    let oneShot = false
    if (command.includes("user login")) { f.loggedIn = !f.failLogin; oneShot = true }
    if (command === "bun run setup") { if (f.raceApp) f.app = true; oneShot = true }
    if (command === "bun run dev") f.app = true
    if (command.startsWith("code tunnel --name")) f.editor = true
    if (command === "cloudflared tunnel run") {
      expect(args).not.toContain("private-provider-token")
      expect(options.env?.TUNNEL_TOKEN).toBe("private-provider-token")
      f.connector = true
    }
    return { done: oneShot ? Promise.resolve(0) : new Promise(() => {}), stop: async () => { f.calls.push(`stop owned ${command}`) } }
  },
}))
vi.mock("../../scripts/lib/remote-access.ts", () => ({
  remoteAccess: async (action: string) => { f.calls.push(`access ${action}`) },
}))
import { RemoteSession } from "../../scripts/lib/remote-session.ts"
import { runRemote } from "../../scripts/ops/remote.ts"
import { readSession } from "../../scripts/lib/remote-control.ts"

beforeEach(() => {
  Object.assign(f, { app: true, editor: true, loggedIn: true, connector: true, publicMatches: true, raceApp: false, calls: [], failLogin: false, wired: true })
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(RemoteSession.prototype, "pause").mockImplementation(async function(this: RemoteSession) { this.stop() })
})
afterEach(() => { vi.restoreAllMocks(); vi.mocked(readSession).mockResolvedValue(null) })

it("reuses all running services without setup, provisioning or stopping them", async () => {
  expect(await runRemote([], false)).toBe(0)
  expect(f.calls).toEqual(["access enable", "report", "access disable"])
})
it("one invocation signs in then starts the app and BOTH tunnels before reporting ready", async () => {
  Object.assign(f, { app: false, editor: false, loggedIn: false, connector: false })
  expect(await runRemote([], true)).toBe(0)
  expect(f.calls[0]).toBe("code tunnel user login --provider github")
  expect(f.calls).toContain("bun run setup")
  expect(f.calls).toContain("bun run dev")
  expect(f.calls.some(c => c.startsWith("code tunnel --name"))).toBe(true)
  expect(f.calls).toContain("cloudflared tunnel run")
  expect(f.calls.indexOf("report")).toBeGreaterThan(f.calls.indexOf("cloudflared tunnel run"))
  expect(f.calls).toContain("stop owned bun run dev")
  expect(f.calls).toContain("stop owned cloudflared tunnel run")
})
it("does not migrate a running app while starting missing tunnels", async () => {
  Object.assign(f, { editor: false, connector: false })
  expect(await runRemote([], true)).toBe(0)
  expect(f.calls).not.toContain("bun run setup")
  expect(f.calls).not.toContain("stop owned bun run dev")
})
it("reuses an app that appeared while setup ran", async () => {
  Object.assign(f, { app: false, connector: false, raceApp: true })
  expect(await runRemote([], false)).toBe(0)
  expect(f.calls).toContain("bun run setup")
  expect(f.calls).not.toContain("bun run dev")
})
it("requires completed login and stops before provisioning on cancellation or noninteractive first use", async () => {
  Object.assign(f, { loggedIn: false, editor: false, connector: false })
  expect(await runRemote([], false)).toBe(2)
  expect(f.calls).toEqual([])
  f.failLogin = true
  expect(await runRemote([], true)).toBe(2)
  expect(f.calls).not.toContain("provision")
  expect(f.calls).not.toContain("bun run setup")
})
it("an active tunnel pointing elsewhere is refused before any writes", async () => {
  f.publicMatches = false
  expect(await runRemote([], true)).toBe(2)
  expect(f.calls).toEqual([])
})
/**
 * The paused state, as committed on 2026-09-09: the identity plugin is not in
 * the dev configuration, so startup refuses before it binds, prepares or
 * provisions anything. Status and stop are not gated by it.
 */
it("refuses startup while the dev configuration lacks the identity plugin, touching nothing", async () => {
  f.wired = false
  expect(await runRemote([], true)).toBe(2)
  expect(f.calls).toEqual([])
  // Stop answers the supervisor once, then finds it gone.
  vi.mocked(readSession).mockResolvedValueOnce({ workspace: "existing", phase: "ready", owned: ["app"] })
  expect(await runRemote(["stop"], true)).toBe(0)
})
it("a second invocation reports the existing supervisor without duplicating startup", async () => {
  vi.mocked(readSession).mockResolvedValue({ workspace: "existing", phase: "ready", owned: ["app"] })
  expect(await runRemote([], false)).toBe(0)
  expect(f.calls).toEqual(["report"])
})
