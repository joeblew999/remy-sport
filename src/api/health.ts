/** Liveness. The one endpoint with nothing behind it. */
import { z } from "zod"
import { infrastructure, pub } from "./base"

export const get = pub
  .use(infrastructure("liveness — it reports whether the Worker can reach D1, and names nothing"))
  .route({ method: "GET", path: "/health", summary: "System health check" })
  .output(z.object({ status: z.literal("ok"), timestamp: z.string() }))
  .handler(async () => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
  }))
