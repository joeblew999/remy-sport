import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { DEV_ORIGIN } from "../../src/environment.ts"
import { IDENTITY_PATH, parseIdentity, workspaceId, type DevIdentity } from "./remote-identity.ts"
import { editorStatus, readCommand, type EditorStatus } from "./remote-vscode.ts"
import { activeConnectors, connectorCount, cloudflareTunnelApi, inspectTunnel, tunnelSettings, type TunnelSettings, type TunnelSnapshot } from "./app-tunnel.ts"

export interface AppStatus { state: "ready" | "closed" | "absent" | "unknown" | "conflict"; identity?: DevIdentity; reason?: string; httpStatus?: number }
export async function appStatus(origin: string, workspace: string, request: typeof fetch = fetch): Promise<AppStatus> {
  try {
    const response = await request(`${origin}${IDENTITY_PATH}?check=${Date.now()}`, { signal: AbortSignal.timeout(5000), redirect: "error" })
    if (!response.ok) {
      const blockedHost = response.status === 403 && (await response.text()).includes("Blocked request. This host")
      return { state: "unknown", httpStatus: response.status, reason: blockedHost
        ? "Vite rejected the tunnel hostname. The shared dev configuration must allow the configured host before remote access can be verified."
        : `The app address returned HTTP ${response.status}; host identity could not be verified.` }
    }
    const identity = parseIdentity(await response.json().catch(() => null))
    if (!response.ok || !identity) return { state: "conflict", reason: "The address answers, but not with this checkout's remote identity: a dev server without the remote identity plugin (paused — docs/2026-09-08-03-remote-development.md), or something else on the port. It was left alone." }
    if (identity.workspace !== workspace) return { state: "conflict", reason: "The address serves another checkout." }
    if (!(await devHealth(origin, request))) return { state: "unknown", reason: "The dev server answers, but its backend health check failed or is not development." }
    return { state: origin.startsWith("https:") && identity.remoteAccess === false ? "closed" : "ready", identity }
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code
    return code === "ECONNREFUSED" || code === "ConnectionRefused" ? { state: "absent" }
      : { state: "unknown", reason: "The app could not be checked (network, certificate, redirect or timeout)." }
  }
}
/** The dev server's own word, no identity needed: the health check is ok and says dev. */
export async function devHealth(origin: string, request: typeof fetch = fetch): Promise<boolean> {
  try {
    const health = await request(`${origin}/api/health`, { signal: AbortSignal.timeout(5000), redirect: "error" })
    const body = await health.json().catch(() => null) as { status?: string; environment?: string } | null
    return health.ok && body?.status === "ok" && body.environment === "dev"
  } catch {
    return false
  }
}
/**
 * Whether the dev configuration carries the remote identity plugin.
 *
 * Read off the source rather than probed, because the question comes before
 * the app is started: a plain `bun run dev` never answers with an identity,
 * and remote startup would wait on one for nothing. The plugin left the
 * shared configuration after the 2026-09-08 incident;
 * docs/2026-09-08-03-remote-development.md says how it comes back.
 */
export function remoteIdentityWired(root: string): boolean {
  try {
    return /^import .* from "[^"]*remote-identity(\.ts)?"/m.test(readFileSync(resolve(root, "src/web/vite.config.ts"), "utf8"))
  } catch {
    return false
  }
}
export function sameInstance(local: AppStatus, remote: AppStatus): boolean {
  return local.state === "ready" && ["ready", "closed"].includes(remote.state) && !!local.identity && local.identity.instance === remote.identity?.instance
}
export interface RemoteStatus {
  schema: 1
  workspace: string
  editor: EditorStatus
  app: AppStatus
  publicApp: AppStatus
  cloudflare: { state: "ready" | "absent" | "conflict" | "unknown"; reason?: string; connectors?: number; configured?: boolean; dnsMatches?: boolean }
  tools: { cloudflared: boolean }
  ready: boolean
  browserVerification: "not-checked"
  links: { editor?: string; agents: string; app?: string }
}
export function remoteExitCode(status: RemoteStatus): number {
  if (status.ready) return 0
  return [status.editor, status.app, status.publicApp, status.cloudflare].some(x => x.state === "unknown") ? 2 : 1
}
export function cloudflareState(snapshot: TunnelSnapshot, local: AppStatus, remote: AppStatus): RemoteStatus["cloudflare"] {
  if (!snapshot.tunnel) return { state: "absent", connectors: 0 }
  if (connectorCount(snapshot) > 1) return { state: "conflict", reason: "Multiple app connectors can route to different hosts; refusing ambiguous ownership.", connectors: connectorCount(snapshot) }
  if (activeConnectors(snapshot) && !sameInstance(local, remote)) return { state: "conflict", reason: "An active connector does not prove this host serves the dev hostname. Leave it untouched.", connectors: connectorCount(snapshot) }
  if (!snapshot.configured || !snapshot.dnsMatches) return { state: "conflict", reason: "Tunnel ingress or DNS does not match the project's dev configuration.", configured: snapshot.configured, dnsMatches: snapshot.dnsMatches, connectors: connectorCount(snapshot) }
  return { state: activeConnectors(snapshot) && sameInstance(local, remote) ? "ready" : "absent", connectors: connectorCount(snapshot) }
}
export async function inspectRemote(root: string, signal?: AbortSignal): Promise<RemoteStatus> {
  const workspace = workspaceId(root)
  const editor = editorStatus()
  let settings: TunnelSettings | undefined
  let snapshot: TunnelSnapshot | undefined
  let cfError: string | undefined
  try {
    settings = tunnelSettings()
    snapshot = await inspectTunnel(await cloudflareTunnelApi(signal), settings)
  } catch (error) {
    cfError = error instanceof Error ? error.message : "Cloudflare inspection failed."
  }
  const [app, publicApp] = await Promise.all([
    appStatus(DEV_ORIGIN, workspace),
    settings ? appStatus(`https://${settings.hostname}`, workspace) : Promise.resolve<AppStatus>({ state: "unknown", reason: "Tunnel settings are unavailable." }),
  ])
  const cloudflare = snapshot ? cloudflareState(snapshot, app, publicApp) : { state: "unknown" as const, reason: cfError }
  return {
    schema: 1, workspace, editor, app, publicApp, cloudflare,
    tools: { cloudflared: readCommand("cloudflared", ["--version"]).code === 0 },
    ready: editor.state === "connected" && app.state === "ready" && publicApp.state === "ready" && cloudflare.state === "ready" && sameInstance(app, publicApp),
    browserVerification: "not-checked",
    links: {
      ...(editor.state === "connected" && editor.name ? { editor: `https://${editor.cli === "code-insiders" ? "insiders." : ""}vscode.dev/tunnel/${encodeURIComponent(editor.name)}${root.split("/").map(encodeURIComponent).join("/")}` } : {}),
      agents: "https://insiders.vscode.dev/agents",
      ...(settings ? { app: `https://${settings.hostname}` } : {}),
    },
  }
}
export function printRemote(status: RemoteStatus): void {
  console.log(`remote: ${status.ready ? "services ready" : "not ready"}`)
  for (const [label, item] of [["App on 8787", status.app], ["VS Code tunnel", status.editor], ["Cloudflare tunnel", status.cloudflare], ["Public app", status.publicApp]] as const) {
    console.log(`  ${label}: ${item.state}${item.reason ? ` — ${item.reason}` : ""}`)
  }
  console.log(`  VS Code CLI: ${status.editor.cli ?? "missing"}; tunnel login: ${status.editor.loggedIn ?? "unknown"}; service installed: ${status.editor.serviceInstalled ?? "unknown"}`)
  for (const [label, url] of Object.entries(status.links)) console.log(`  ${label}: ${url}`)
  console.log("  Browser sign-in, agent provider access and live reload require a browser walkthrough; health checks do not verify them.")
}
