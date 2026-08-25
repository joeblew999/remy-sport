/** Liveness. The one endpoint with nothing behind it. */
import { pub } from "./base"

export const get = pub.health.get.handler(async () => ({
  status: "ok" as const,
  timestamp: new Date().toISOString(),
}))
