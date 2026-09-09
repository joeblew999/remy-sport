import { describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { editorStatus, parseEditorStatus, type ReadCommand } from "../../scripts/lib/remote-vscode.ts"
import { appStatus, cloudflareState, remoteExitCode, sameInstance, type AppStatus, type RemoteStatus } from "../../scripts/lib/remote-status.ts"
import { ensureTunnel, inspectTunnel, type TunnelApi, type TunnelSettings, type TunnelSnapshot } from "../../scripts/lib/app-tunnel.ts"
import { remoteIdentity, workspaceId } from "../../scripts/lib/remote-identity.ts"

const workspace = "a".repeat(64)
const identity = { workspace, instance: randomUUID() }
const local: AppStatus = { state: "ready", identity }
const settings: TunnelSettings = { name: "dev", hostname: "dev.example.test", zone: "example.test", service: "http://localhost:8787" }
const configured: TunnelSnapshot = {
  tunnel: { id: "test-id", name: "dev" }, connectors: [], configured: true, dnsMatches: true,
  zoneId: "zone", records: [{ id: "record", type: "CNAME", name: settings.hostname, content: "test-id.cfargotunnel.com", proxied: true }],
}
function apiMock() {
  const account = vi.fn(), zone = vi.fn()
  return { account, zone, api: { account, zone } as TunnelApi }
}

describe("VS Code status", () => {
  it("does not mistake installed service or successful inspection for connection", () => {
    expect(parseEditorStatus('{"tunnel":null,"service_installed":true}')).toEqual({ state: "absent", serviceInstalled: true })
    expect(parseEditorStatus('{"tunnel":{"tunnel":"Disconnected"},"service_installed":false}').state).toBe("disconnected")
    for (const value of ["", "{}", "not json", '{"tunnel":{"tunnel":"Connected"},"service_installed":true}', '{"tunnel":{"name":"host","tunnel":"Connected","has_editor_link":false},"service_installed":true}']) {
      expect(parseEditorStatus(value).state).toBe("unknown")
    }
  })
  it("accepts the upstream legacy status shape without inventing an identity", () => {
    expect(parseEditorStatus('{"tunnel":{"name":"host","tunnel":"Connected"},"service_installed":false}')).toEqual({ state: "connected", name: "host", serviceInstalled: false })
  })
  it("selects stable first, falls back only when missing, and reads login on stderr", () => {
    const run: ReadCommand = vi.fn((bin, args) => bin === "code" ? { code: null, out: "", missing: true }
      : args.includes("show") ? { code: 0, out: "", err: "not logged in" }
      : { code: 0, out: '{"tunnel":null,"service_installed":false}' })
    expect(editorStatus(run)).toMatchObject({ cli: "code-insiders", state: "absent", loggedIn: false })
    const broken: ReadCommand = vi.fn(() => ({ code: null, out: "secret output must not be exposed" }))
    expect(editorStatus(broken)).toMatchObject({ cli: "code", state: "unknown" })
    expect(broken).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(editorStatus(broken))).not.toContain("secret output")
  })
})

describe("app identity", () => {
  it("requires healthy dev backend, matching checkout and exact public instance", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(identity)).mockResolvedValueOnce(Response.json({ status: "ok", environment: "dev" }))
    expect(await appStatus("http://local", workspace, request)).toEqual(local)
    expect(sameInstance(local, local)).toBe(true)
    expect(sameInstance(local, { state: "ready", identity: { ...identity, instance: randomUUID() } })).toBe(false)
    expect((await appStatus("http://local", "b".repeat(64), vi.fn().mockResolvedValue(Response.json(identity)))).state).toBe("conflict")
    const production = vi.fn().mockResolvedValueOnce(Response.json(identity)).mockResolvedValueOnce(Response.json({ status: "ok", environment: "production" }))
    expect((await appStatus("http://local", workspace, production)).state).toBe("unknown")
  })
  it("never treats HTML, redirects, timeout or inaccessible sockets as success", async () => {
    expect((await appStatus("http://local", workspace, vi.fn().mockResolvedValue(new Response("<html>app</html>")))).state).toBe("conflict")
    expect((await appStatus("http://local", workspace, vi.fn().mockRejectedValue(new Error("timeout")))).state).toBe("unknown")
    expect((await appStatus("http://local", workspace, vi.fn().mockRejectedValue(Object.assign(new Error(), { code: "ECONNREFUSED" })))).state).toBe("absent")
  })
  it("publishes no path or production plugin and prevents caching", () => {
    const plugin = remoteIdentity(process.cwd())
    expect(plugin.apply).toBe("serve")
    const use = vi.fn()
    const configure = plugin.configureServer as (server: unknown) => void
    configure({ middlewares: { use } })
    const handler = use.mock.calls[0]![0]
    const headers: Record<string, string> = {}
    const end = vi.fn()
    handler({ url: "/__remy_remote?check=1", method: "GET", headers: {}, socket: {} }, { setHeader: (k: string, v: string) => { headers[k] = v }, end }, vi.fn())
    const body = JSON.parse(end.mock.calls[0]![0])
    expect(body.workspace).toBe(workspaceId(process.cwd()))
    expect(headers["Cache-Control"]).toBe("no-store")
    expect(JSON.stringify(body)).not.toContain(process.cwd())
    const next = vi.fn()
    handler({ url: "/", method: "GET" }, {}, next)
    expect(next).toHaveBeenCalledOnce()
  })
})

describe("Cloudflare coordination", () => {
  it("inspection uses only reads and does not retrieve or store a token", async () => {
    const { api, account, zone } = apiMock()
    account.mockResolvedValueOnce([configured.tunnel]).mockResolvedValueOnce([]).mockResolvedValueOnce({ config: { ingress: [{ hostname: settings.hostname, service: settings.service }, { service: "http_status:404" }] } })
    zone.mockResolvedValueOnce([{ id: "zone" }]).mockResolvedValueOnce(configured.records)
    expect(await inspectTunnel(api, settings)).toMatchObject({ configured: true, dnsMatches: true })
    expect([...account.mock.calls, ...zone.mock.calls].every(call => call.length === 1)).toBe(true)
    expect(account.mock.calls.some(call => call[0].includes("token"))).toBe(false)
  })
  it("a matching configuration causes no writes", async () => {
    const { api, account, zone } = apiMock()
    await ensureTunnel(api, settings, configured)
    expect(account).not.toHaveBeenCalled()
    expect(zone).not.toHaveBeenCalled()
  })
  it("unknown connector response shapes cannot be mistaken for an unused tunnel", async () => {
    const { api, account, zone } = apiMock()
    account.mockResolvedValueOnce([configured.tunnel]).mockResolvedValueOnce([{ id: "connector", connections: [] }])
    zone.mockResolvedValueOnce([{ id: "zone" }]).mockResolvedValueOnce(configured.records)
    await expect(inspectTunnel(api, settings)).rejects.toThrow("conns arrays")
    expect([...account.mock.calls, ...zone.mock.calls].every(call => call.length === 1)).toBe(true)
  })
  it("provisions only missing configuration and refuses unrelated DNS", async () => {
    const { api, account, zone } = apiMock()
    account.mockResolvedValueOnce(configured.tunnel)
    await ensureTunnel(api, settings, { ...configured, tunnel: null, configured: false, dnsMatches: false, records: [] })
    expect(account.mock.calls.map(call => call[1]?.method)).toEqual(["POST", "PUT"])
    expect(zone.mock.calls[0]![1].method).toBe("POST")
    account.mockClear(); zone.mockClear()
    await expect(ensureTunnel(api, settings, { ...configured, dnsMatches: false, records: [{ ...configured.records[0]!, content: "other.example.test" }] })).rejects.toThrow("Refusing to repoint")
    expect(account).not.toHaveBeenCalled()
    expect(zone).not.toHaveBeenCalled()
  })
  it("an active connector on an unverified host is a conflict even with valid DNS", async () => {
    const active = { ...configured, connectors: [{ id: "connector", conns: [{ is_pending_reconnect: false }] }] }
    expect(cloudflareState(active, local, { state: "absent" }).state).toBe("conflict")
    expect(cloudflareState(active, local, local).state).toBe("ready")
    expect(cloudflareState({ ...active, connectors: [...active.connectors, { id: "second", conns: [{}] }] }, local, local).state).toBe("conflict")
    const { api, account } = apiMock()
    await expect(ensureTunnel(api, settings, { ...active, configured: false })).rejects.toThrow("active app tunnel")
    expect(account).not.toHaveBeenCalled()
  })
  it("distinguishes not ready from failed inspection", () => {
    const status = { ready: false, editor: { state: "absent" }, app: local, publicApp: local, cloudflare: { state: "absent" } } as RemoteStatus
    expect(remoteExitCode(status)).toBe(1)
    expect(remoteExitCode({ ...status, publicApp: { state: "unknown" } })).toBe(2)
    expect(remoteExitCode({ ...status, ready: true })).toBe(0)
  })
})
