import { DEV_ORIGIN } from "../../src/environment.ts"
import { ACCESS_PATH, IDENTITY_PATH, parseIdentity } from "./remote-identity.ts"

/** Authenticated loopback-only lease; the ephemeral key is never printed or saved. */
export async function remoteAccess(action: "enable" | "disable", owner: string, workspace: string, request: typeof fetch = fetch): Promise<void> {
  const identityResponse = await request(`${DEV_ORIGIN}${IDENTITY_PATH}`, { signal: AbortSignal.timeout(5000), redirect: "error" })
  const raw = await identityResponse.json() as { accessKey?: string }
  const identity = parseIdentity(raw)
  if (!identityResponse.ok || identity?.workspace !== workspace || typeof raw.accessKey !== "string") throw new Error("The local app did not provide this checkout's remote access control. It was left unchanged.")
  const response = await request(`${DEV_ORIGIN}${ACCESS_PATH}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Remy-Access-Key": raw.accessKey },
    body: JSON.stringify({ action, owner }), signal: AbortSignal.timeout(5000), redirect: "error",
  })
  if (!response.ok) throw new Error(`Local app access ${action} failed (HTTP ${response.status}); another session may own it.`)
}
