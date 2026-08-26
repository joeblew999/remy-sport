/** Liveness. The one endpoint with nothing behind it. */
import { z } from "zod"
import { pub } from "./base"

export const get = pub
  .route({ method: "GET", path: "/health", summary: "System health check" })
  .output(z.object({ status: z.literal("ok"), timestamp: z.string() }))
  .handler(async () => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
  }))
