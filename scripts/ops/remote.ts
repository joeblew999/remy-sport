import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { DEV_ORIGIN } from "../../src/environment.ts"
import { activeConnectors, connectorCount, cloudflareTunnelApi, ensureTunnel, inspectTunnel, tunnelRunToken, tunnelSettings } from "../lib/app-tunnel.ts"
import { workspaceId } from "../lib/remote-identity.ts"
import { appStatus, inspectRemote, printRemote, remoteExitCode, remoteIdentityWired, sameInstance } from "../lib/remote-status.ts"
import { editorStatus, readCommand } from "../lib/remote-vscode.ts"
import { readSession, serveSession } from "../lib/remote-control.ts"
import { RemoteSession } from "../lib/remote-session.ts"
import { remoteAccess } from "../lib/remote-access.ts"

const root = resolve(import.meta.dirname, "../..")
const help = `bun run ops remote [status [--json]|stop]
Starts/reuses the app on 8787, the VS Code editor/agents tunnel and the Cloudflare app tunnel.
Keep this command running on the host. Ctrl-C or stop cleans up only processes it started.
First use guides VS Code account sign-in and license acceptance in this terminal.
Status is read-only: exit 0 = services ready, 1 = not ready, 2 = inspection failed.
Browser sign-in and live reload require a separate walkthrough. No background service is installed.
Startup is paused while the dev configuration lacks the remote identity plugin
(docs/2026-09-08-03-remote-development.md); status and stop work, README.md has the manual steps.
`
async function main(args: string[], interactive: boolean): Promise<number> {
  const workspace = workspaceId(root)
  if (args[0] === "status") {
    const status = await inspectRemote(root)
    if (args.includes("--json")) console.log(JSON.stringify(status, null, 2))
    else printRemote(status)
    return remoteExitCode(status)
  }
  if (!["darwin", "linux"].includes(process.platform)) throw new Error("Remote process supervision currently supports macOS and Linux. Windows lifecycle support is not verified.")
  if (args[0] === "stop") {
    const session = await readSession(workspace, true)
    if (!session) { console.log("remote: no owned session is running; existing app/tunnels were left alone."); return 0 }
    const deadline = Date.now() + 15_000
    while (await readSession(workspace)) {
      if (Date.now() > deadline) throw new Error("Remote cleanup has not finished; do not kill unrelated processes.")
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    console.log("remote: owned processes stopped; reused app/tunnels left running.")
    return 0
  }
  // Before binding, preparing or provisioning anything: a started app could
  // never prove it is this checkout's, and the hostname could never be gated.
  if (!remoteIdentityWired(root)) throw new Error("Remote startup is paused: src/web/vite.config.ts does not carry the remote identity plugin. status and stop work; README.md has the manual steps, and docs/2026-09-08-03-remote-development.md says how to resume.")
  const existing = await readSession(workspace)
  if (existing) {
    console.log(`remote: this checkout already has a session (${existing.phase}); no duplicate processes started.`)
    const status = await inspectRemote(root)
    printRemote(status)
    return remoteExitCode(status)
  }
  const session = new RemoteSession()
  const accessOwner = randomUUID()
  let accessEnabled = false
  // Bind before login, preparation or provisioning. The OS arbitrates races.
  const control = await serveSession(() => ({ workspace, phase: session.phase, owned: [...session.owned.keys()] }), session.stop)
  process.on("SIGINT", session.stop)
  process.on("SIGTERM", session.stop)
  try {
    const settings = tunnelSettings()
    const editor = editorStatus()
    if (!editor.cli) throw new Error(editor.reason)
    if (editor.state === "unknown" || editor.loggedIn === null) throw new Error(editor.reason ?? "Could not inspect VS Code login; check the installed CLI.")
    if (readCommand("cloudflared", ["--version"]).code !== 0) throw new Error("cloudflared is unavailable. Complete mise install for this checkout and rerun this command.")
    let local = await appStatus(DEV_ORIGIN, workspace)
    if (!["ready", "absent"].includes(local.state)) throw new Error(local.reason)
    if (!existsSync(resolve(root, "node_modules/wrangler/package.json"))) {
      if (local.state === "ready") throw new Error("Dependencies are missing while a shared app is running. Restore this checkout's setup deliberately; remote startup will not modify that running app.")
      await session.once("bun", ["scripts/lib/prepare.ts", "dependencies"])
    }
    const api = await cloudflareTunnelApi(session.abort.signal)
    let snapshot = await inspectTunnel(api, settings)
    if (connectorCount(snapshot) > 1) throw new Error("The dev hostname has multiple connectors. Refusing ambiguous host ownership.")
    if (activeConnectors(snapshot)) {
      const publicApp = await appStatus(`https://${settings.hostname}`, workspace)
      if (!sameInstance(local, publicApp)) throw new Error("The dev hostname has an active connector on an unverified host. Leave that host running; this command will not join or repoint it.")
      if (!snapshot.configured || !snapshot.dnsMatches) throw new Error("The active dev tunnel has different ingress/DNS. It was left unchanged.")
    }
    if (editor.loggedIn === false) {
      session.phase = "signing in"
      if (!interactive) throw new Error("First-time VS Code sign-in needs an interactive terminal. Run bun run ops remote in the host's VS Code terminal; it will continue after sign-in.")
      console.log("remote: sign in to VS Code's tunnel provider; startup continues afterwards.")
      await session.once(editor.cli, ["tunnel", "user", "login", "--provider", "github"], true)
      if (editorStatus().loggedIn !== true) throw new Error("VS Code sign-in did not complete. Rerun the remote command to resume.")
    }
    if (local.state === "absent") {
      session.phase = "preparing"
      await session.once("bun", ["run", "setup"])
      // Preparation may be slow. Never start over a server launched meanwhile.
      local = await appStatus(DEV_ORIGIN, workspace)
      if (local.state === "absent") {
        await session.launch("app", "bun", ["run", "dev"])
        await session.waitFor("the app", async () => (await appStatus(DEV_ORIGIN, workspace)).state === "ready")
      } else if (local.state !== "ready") throw new Error(local.reason)
    } else console.log("remote: reusing the app; no installation or database migration runs against it.")
    session.phase = "starting tunnels"
    const currentEditor = editorStatus()
    if (currentEditor.state !== "connected") {
      if (currentEditor.state !== "absent" || currentEditor.serviceInstalled) throw new Error("An existing VS Code tunnel/service is disconnected. Restore it from its owner; this command will not restart a shared service.")
      if (!interactive) throw new Error("Starting a new VS Code tunnel may require license acceptance. Run bun run ops remote in an interactive host terminal.")
      await session.launch("VS Code tunnel", editor.cli, ["tunnel", "--name", `remy-${workspace.slice(0, 12)}`, "--no-sleep"], { interactive: true })
      await session.waitFor("the VS Code tunnel", async () => editorStatus().state === "connected", 180_000)
    }
    // Recheck after login/setup so a connector started elsewhere is not missed.
    snapshot = await inspectTunnel(api, settings)
    if (connectorCount(snapshot) > 1) throw new Error("Multiple connectors became active; refusing ambiguous host ownership.")
    local = await appStatus(DEV_ORIGIN, workspace)
    if (activeConnectors(snapshot)) {
      if (!sameInstance(local, await appStatus(`https://${settings.hostname}`, workspace))) throw new Error("Another connector became active during startup. It was left untouched.")
      if (!snapshot.configured || !snapshot.dnsMatches) throw new Error("Active tunnel configuration changed during startup.")
    } else {
      const tunnel = await ensureTunnel(api, settings, snapshot)
      const credential = await tunnelRunToken(api, tunnel.id)
      // Credential stays in child environment, never argv, files or logs.
      await session.launch("Cloudflare tunnel", "cloudflared", ["tunnel", "run"], { env: { ...process.env, TUNNEL_TOKEN: credential } })
    }
    await session.waitFor("both tunnels and the public app", async () => {
      await remoteAccess("enable", accessOwner, workspace)
      accessEnabled = true
      return (await inspectRemote(root, session.abort.signal)).ready
    }, 120_000)
    const ready = await inspectRemote(root, session.abort.signal)
    if (!ready.ready) throw new Error("Remote readiness changed during verification. Run remote status for details.")
    session.phase = "ready"
    printRemote(ready)
    console.log("remote: keep this host command running; Ctrl-C stops only the processes listed as owned.")
    console.log(`  owned: ${[...session.owned.keys()].join(", ") || "none (everything was reused)"}`)
    // Supervise child exits immediately and recheck reused services periodically.
    while (!session.abort.signal.aborted) {
      await session.pause(15_000)
      if (!session.abort.signal.aborted) {
        await remoteAccess("enable", accessOwner, workspace)
        if (!(await inspectRemote(root, session.abort.signal)).ready) throw new Error("A remote service lost readiness. Reused processes were left alone; run remote status for details.")
      }
    }
    if (session.error) throw session.error
    return 0
  } catch (error) {
    if (session.abort.signal.aborted && !session.error) return 0
    throw session.error ?? error
  } finally {
    try {
      if (accessEnabled) {
        try { await remoteAccess("disable", accessOwner, workspace) }
        catch (error) { if ((await appStatus(DEV_ORIGIN, workspace)).state !== "absent") throw error }
      }
    }
    finally {
      try { await session.close() }
      finally {
        await new Promise<void>(resolve => control.close(() => resolve()))
        process.off("SIGINT", session.stop)
        process.off("SIGTERM", session.stop)
      }
    }
  }
}
export async function runRemote(rawArgs: string[], interactive = !!process.stdin.isTTY): Promise<number> {
  const args = rawArgs.filter(x => x !== "--")
  if (args.includes("--help") || args.includes("-h")) { console.log(help); return 0 }
  if (args.length > 2 || (args.length && !["status", "stop"].includes(args[0]!)) || (args.length === 2 && (args[0] !== "status" || args[1] !== "--json"))) {
    console.error(help); return 1
  }
  try { return await main(args, interactive) }
  catch (error) { console.error(`remote: ${error instanceof Error ? error.message : "failed"}`); return 2 }
}
if (import.meta.main) process.exitCode = await runRemote(process.argv.slice(2))
