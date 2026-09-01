/** Liveness, and which deployment answered. */
import { z } from "zod"
import { infrastructure, pub } from "./base"
import { ENVIRONMENTS, environmentOf } from "../environment"

export const get = pub
  .use(
    infrastructure(
      "liveness — it reports whether the Worker can reach D1, plus which environment it is, and names nobody",
    ),
  )
  .route({ method: "GET", path: "/health", summary: "System health check" })
  .output(
    z.object({
      status: z.literal("ok"),
      timestamp: z.string(),
      /**
       * Which environment this is, so a caller can stop guessing.
       *
       * `scripts/smoke.ts` used to classify the deployment by hostname: a
       * `TUNNEL_HOSTNAME` match meant the tunnel, localhost meant local,
       * anything else meant production. That was already the second version of
       * the same mistake — the first sniffed a "dev-" prefix and would have
       * classified a real deployment at `dev-remy-staging` as dev, silently
       * skipping every deployment-safety check.
       *
       * Guessing cannot survive a third environment. Staging is a public
       * hostname running a deployment whose checks differ from production's,
       * because the policy table gives it the seed route and seeded sign-in on
       * purpose — so a smoke run that inferred "not the tunnel, therefore
       * production" would fail it for a rule that is no longer true.
       *
       * So the deployment says what it is. Not a disclosure: the hostname
       * already reveals as much, and this names nothing about anybody.
       */
      environment: z.enum(ENVIRONMENTS),
    }),
  )
  .handler(async ({ context }) => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
    // Resolved through the same fail-safe as everything else: unset or
    // unrecognised is production.
    environment: environmentOf(context.env),
  }))
