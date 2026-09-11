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
       * `scripts/deploy/smoke.ts` used to classify the deployment by hostname: a
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

/**
 * What this Worker is: the build stamp vite.config.ts baked in (src/build.d.ts).
 *
 * Read by the SPA's build stamp, by `bun run ops versions`, and by the deploy
 * while it waits for the edge to serve the build it just published. `url` is
 * where this deployment thinks it lives — the same variable every emailed link
 * is built from.
 *
 * The `current` wrapper is load-bearing, not decoration: three callers reach
 * through it (`d.current._generated`, `d.current.git.commit`, and the stamp
 * table in scripts/ops/versions.ts), so the shape is preserved exactly as the
 * Hono route served it.
 */
export const versions = pub
  .use(
    infrastructure(
      "build metadata — the commit, branch and time this Worker was built from, plus its own URL; it names nobody",
    ),
  )
  .route({ method: "GET", path: "/versions", summary: "Which build this deployment is running" })
  .output(
    z.object({
      current: z.object({
        _generated: z.string(),
        app: z.string(),
        environment: z.string(),
        url: z.string(),
        git: z.object({
          commit: z.string(),
          branch: z.string(),
          github: z.string().nullable(),
        }),
      }),
    }),
  )
  .handler(async ({ context }) => {
    // A var, never the SPA's `__BUILD__` define — see src/build.d.ts. Absent
    // is possible (a deployment provisioned before this var existed), and the
    // honest answer there is "unknown", not a 500: this endpoint is what the
    // deploy polls to find out whether the edge has caught up, so it has to
    // answer even when it has nothing to report.
    const build = context.env.BUILD
    return {
      current: {
        _generated: build?.builtAt ?? "",
        app: build?.app ?? "unknown",
        environment: build?.environment ?? "unknown",
        url: context.env.BETTER_AUTH_URL,
        git: {
          commit: build?.commit ?? "unknown",
          branch: build?.branch ?? "unknown",
          // TOML has no null, so the var carries "". The published shape keeps
          // null, which is what the field meant before it was a var.
          github: build?.github || null,
        },
      },
    }
  })
