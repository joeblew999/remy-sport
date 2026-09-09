import { DEV_ORIGIN } from "../../src/environment.ts"
import { isDeepStrictEqual } from "node:util"

export interface TunnelSettings { name: string; hostname: string; zone: string; service: string }
export function tunnelSettings(env = process.env): TunnelSettings {
  const required = (key: string) => {
    const value = env[key]
    if (!value) throw new Error(`${key} is missing. Activate mise for this checkout and rerun the command.`)
    return value
  }
  return { name: required("TUNNEL_NAME"), hostname: required("TUNNEL_HOSTNAME"), zone: required("TUNNEL_ZONE"), service: DEV_ORIGIN }
}
export interface Tunnel { id: string; name: string; status?: string }
// The /connections endpoint returns Client records with a `conns` array.
// https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/subresources/connections/methods/get/
export interface Connector { id?: string; conns: Array<{ is_pending_reconnect?: boolean }> }
interface Dns { id: string; type: string; name: string; content: string; proxied: boolean }
export interface TunnelSnapshot {
  tunnel: Tunnel | null
  connectors: Connector[]
  configured: boolean
  dnsMatches: boolean
  zoneId: string
  records: Dns[]
}
export interface TunnelApi {
  account<T>(path: string, init?: RequestInit): Promise<T>
  zone<T>(path: string, init?: RequestInit): Promise<T>
}
// Lazy so status/help on a fresh checkout does not load Wrangler or install it.
export async function cloudflareTunnelApi(signal?: AbortSignal): Promise<TunnelApi> {
  const cf = await import("./cloudflare.ts")
  const deadline = () => signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000)
  return {
    account: async <T>(path: string, init?: RequestInit) => cf.apiResult<T>(await cf.accountApi(path, { ...init, signal: deadline() }), `Tunnel account request ${init?.method ?? "GET"}`),
    zone: async <T>(path: string, init?: RequestInit) => cf.apiResult<T>(await cf.zoneApi(path, { ...init, signal: deadline() }), `Tunnel DNS request ${init?.method ?? "GET"}`),
  }
}
function ingress(s: TunnelSettings) {
  return [{ hostname: s.hostname, service: s.service }, { service: "http_status:404" }]
}
export async function inspectTunnel(api: TunnelApi, s: TunnelSettings): Promise<TunnelSnapshot> {
  const tunnels = await api.account<Tunnel[]>(`/cfd_tunnel?name=${encodeURIComponent(s.name)}&is_deleted=false`)
  if (!Array.isArray(tunnels) || tunnels.some(t => typeof t.id !== "string" || !t.id || t.name !== s.name)) throw new Error("Cloudflare returned an unsupported tunnel listing.")
  if (tunnels.length > 1) throw new Error("Several tunnels share the configured name; refusing an ambiguous target.")
  const tunnel = tunnels[0] ?? null
  const zones = await api.zone<Array<{ id: string }>>(`?name=${encodeURIComponent(s.zone)}`)
  if (!Array.isArray(zones) || zones.length !== 1 || typeof zones[0]?.id !== "string") throw new Error("The configured Cloudflare zone could not be uniquely resolved.")
  const zoneId = zones[0]!.id
  const records = await api.zone<Dns[]>(`/${zoneId}/dns_records?name=${encodeURIComponent(s.hostname)}`)
  if (!Array.isArray(records) || records.some(r => typeof r.id !== "string" || r.name !== s.hostname)) throw new Error("Cloudflare returned an unsupported DNS listing.")
  const connectors = tunnel ? await api.account<Connector[]>(`/cfd_tunnel/${tunnel.id}/connections`) : []
  if (!Array.isArray(connectors) || connectors.some(c => !Array.isArray(c.conns))) throw new Error("Cloudflare connector state is unknown: expected Client records with conns arrays.")
  const configuration = tunnel ? await api.account<{ config: { ingress?: unknown } }>(`/cfd_tunnel/${tunnel.id}/configurations`) : null
  return {
    tunnel, connectors, zoneId, records,
    configured: isDeepStrictEqual(configuration?.config?.ingress, ingress(s)),
    dnsMatches: !!tunnel && records.length === 1 && records[0]!.type === "CNAME" && records[0]!.content === `${tunnel.id}.cfargotunnel.com` && records[0]!.proxied,
  }
}
export function activeConnectors(snapshot: TunnelSnapshot): boolean {
  return connectorCount(snapshot) > 0
}
export function connectorCount(snapshot: TunnelSnapshot): number {
  return snapshot.connectors.filter(c => c.conns.length > 0).length
}
/** Only provision after the caller has excluded an active connector on another host. */
export async function ensureTunnel(api: TunnelApi, s: TunnelSettings, snapshot: TunnelSnapshot): Promise<Tunnel> {
  if (activeConnectors(snapshot)) {
    if (!snapshot.configured || !snapshot.dnsMatches) throw new Error("An active app tunnel has different configuration; leave its host untouched.")
    return snapshot.tunnel!
  }
  // Never repoint somebody else's existing DNS record, even if our tunnel is absent.
  const ownRecord = snapshot.tunnel && snapshot.records.length === 1 && snapshot.records[0]!.type === "CNAME" && snapshot.records[0]!.content === `${snapshot.tunnel.id}.cfargotunnel.com`
  if (snapshot.records.length && !snapshot.dnsMatches && !ownRecord) throw new Error("The dev hostname already has a different DNS record. Refusing to repoint it.")
  const tunnel = snapshot.tunnel ?? await api.account<Tunnel>("/cfd_tunnel", { method: "POST", body: JSON.stringify({ name: s.name, config_src: "cloudflare" }) })
  if (!snapshot.configured) await api.account(`/cfd_tunnel/${tunnel.id}/configurations`, { method: "PUT", body: JSON.stringify({ config: { ingress: ingress(s) } }) })
  if (!snapshot.dnsMatches) await api.zone(`/${snapshot.zoneId}/dns_records${ownRecord ? `/${snapshot.records[0]!.id}` : ""}`, { method: ownRecord ? "PUT" : "POST", body: JSON.stringify({ type: "CNAME", name: s.hostname, content: `${tunnel.id}.cfargotunnel.com`, proxied: true }) })
  return tunnel
}
export async function tunnelRunToken(api: TunnelApi, id: string): Promise<string> {
  const token = await api.account<string>(`/cfd_tunnel/${id}/token`)
  if (typeof token !== "string" || !token) throw new Error("Cloudflare did not supply a tunnel credential.")
  return token
}
