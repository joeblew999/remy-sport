/**
 * The Cloudflare dev tunnel: a fixed HTTPS name for the dev server.
 *
 *   bun run ops tunnel               provision what is missing: tunnel, ingress, DNS
 *   bun run ops tunnel status        read-only: configured, and is a connector up
 *   bun run ops tunnel -- --run      provision, then run the connector beside `bun run dev`
 *
 * Inspection never provisions or saves credentials; the run token goes to
 * cloudflared through its environment and nowhere else.
 *
 * Two ways the local app can be ready. With the remote identity plugin in the
 * dev configuration (paused — docs/2026-09-08-03-remote-development.md) the
 * app proves it is this checkout's, the public hostname is compared instance
 * for instance, and access through the hostname is a lease this command holds
 * and releases. Without it — the state since the plugin left the shared
 * configuration — the dev server's health check is the whole answer, the
 * hostname is open while the connector runs, as it always was before the gate
 * existed, and an already-active connector cannot be told apart from ours, so
 * it is left alone.
 */
import { resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { activeConnectors, connectorCount, cloudflareTunnelApi, ensureTunnel, inspectTunnel, tunnelRunToken, tunnelSettings } from "../lib/app-tunnel.ts"
import { appStatus, devHealth, sameInstance } from "../lib/remote-status.ts"
import { workspaceId } from "../lib/remote-identity.ts"
import { RemoteSession } from "../lib/remote-session.ts"
import { remoteAccess } from "../lib/remote-access.ts"

const args = process.argv.slice(2).filter(x => x !== "--")
if (args.includes("--help") || args.includes("-h")) {
  console.log("bun run ops tunnel [status|--run]\nStatus is read-only. No arguments provisions missing dev tunnel configuration.\n--run starts the connector once this checkout's dev server answers its health check.\nbun run ops remote (startup) is paused; its status and stop work.")
  process.exit(0)
}
if (args.length > 1 || (args.length && !["status", "--run"].includes(args[0]!))) { console.error("Usage: bun run ops tunnel [status|--run]"); process.exit(1) }
const session = new RemoteSession()
const workspace = workspaceId(resolve(import.meta.dirname, "../.."))
const accessOwner = randomUUID()
let accessEnabled = false
process.on("SIGINT", session.stop)
process.on("SIGTERM", session.stop)
try {
  const settings = tunnelSettings()
  const api = await cloudflareTunnelApi(session.abort.signal)
  const snapshot = await inspectTunnel(api, settings)
  if (args[0] === "status") {
    console.log(JSON.stringify({ tunnel: snapshot.tunnel, connectors: snapshot.connectors.length, configured: snapshot.configured, dnsMatches: snapshot.dnsMatches }, null, 2))
    process.exitCode = activeConnectors(snapshot) && snapshot.configured && snapshot.dnsMatches ? 0 : 1
  } else {
    if (connectorCount(snapshot) > 1) throw new Error("Multiple connectors serve the app hostname; refusing ambiguous host ownership.")
    const local = await appStatus(settings.service, workspace)
    // The gate is there when the app answers with this checkout's identity;
    // otherwise a healthy dev server is as much as can be known.
    const gated = local.state === "ready"
    const serving = gated || await devHealth(settings.service)
    if (activeConnectors(snapshot)) {
      if (!gated) throw new Error("A connector already serves the hostname, and without the remote identity plugin this checkout's app cannot be proven to be the one behind it. Stop that connector first, or resume the remote plan.")
      if (!sameInstance(local, await appStatus(`https://${settings.hostname}`, workspace))) throw new Error("An active app tunnel belongs to an unverified host; it was left unchanged.")
      if (!snapshot.configured || !snapshot.dnsMatches) throw new Error("Active tunnel configuration differs; it was left unchanged.")
      console.log("tunnel: reusing the existing connector; nothing started or changed.")
    } else {
      if (args[0] === "--run" && !serving) throw new Error(`Nothing healthy answers at ${settings.service}. Start the dev server first: bun run dev`)
      const tunnel = await ensureTunnel(api, settings, snapshot)
      console.log(`tunnel: configured https://${settings.hostname}`)
      if (args[0] === "--run") {
        const credential = await tunnelRunToken(api, tunnel.id)
        await session.launch("Cloudflare tunnel", "cloudflared", ["tunnel", "run"], { env: { ...process.env, TUNNEL_TOKEN: credential } })
      }
    }
    if (args[0] === "--run") {
      if (gated) {
        await session.waitFor("the public app", async () => {
          await remoteAccess("enable", accessOwner, workspace)
          accessEnabled = true
          const publicApp = await appStatus(`https://${settings.hostname}`, workspace)
          return publicApp.state === "ready" && sameInstance(await appStatus(settings.service, workspace), publicApp)
        })
        console.log(`tunnel: ready https://${settings.hostname}; Ctrl-C closes this session's remote app access.`)
      } else {
        await session.waitFor("the public app", () => devHealth(`https://${settings.hostname}`))
        console.log(`tunnel: ready https://${settings.hostname} — open to anyone with the address while this runs (no remote identity plugin, so no access lease). Ctrl-C stops the connector.`)
      }
      while (!session.abort.signal.aborted) {
        await session.pause(15_000)
        if (!session.abort.signal.aborted && gated) await remoteAccess("enable", accessOwner, workspace)
      }
      if (session.error) throw session.error
    }
  }
} catch (error) {
  if (!session.abort.signal.aborted || session.error) {
    console.error(`tunnel: ${session.error?.message ?? (error instanceof Error ? error.message : "failed")}`)
    process.exitCode = 2
  }
} finally {
  try { if (accessEnabled) await remoteAccess("disable", accessOwner, workspace) }
  finally { await session.close() }
}
