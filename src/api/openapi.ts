import type { OpenAPI } from "@orpc/openapi"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { CORSPlugin } from "@orpc/server/plugins"
import { router } from "./index"
import { policyOf } from "./base"
import { permits } from "../environment"
import type { Bindings } from "../types"
import { telemetryInterceptor } from "./telemetry"
import { APP_VERSION } from "./version"

/**
 * The REST surface: the API, its specification, and its reference page.
 *
 * `/api/openapi.json` is generated from the same router that serves the
 * requests, so the document cannot describe an endpoint that does not exist,
 * and `/api/doc` renders it. The plugin states the prefix as `servers`, which
 * lets the paths in the document match the paths in the router.
 *
 * Here rather than in src/index.ts so the dispatch has no route strings of its
 * own, and so `scripts/ops/openapi.ts` can build the same document without a
 * server. **The generator calls the spec generator directly — it does not
 * fetch a deployment.** Fetching would make the committed snapshot agree with
 * whatever was last deployed rather than with this tree, which is a check
 * reporting the state of a deploy instead of the state of the code.
 *
 * Security schemes are declared once; `authedRoute` in ./base.ts says which
 * operations demand them.
 */

/**
 * Tag every operation with its first path segment — `events`, `games`, `dev`.
 *
 * At generation time, over the finished document, because that is where the
 * fact lives: a builder cannot know its own router key (`dev("seedRoute")` has
 * no idea it will be mounted at `dev.seed`), and writing the tag onto each
 * procedure would put it somewhere a person has to remember — which is how
 * eight hand-kept tags come back.
 *
 * So a new router key is tagged the moment it exists, and nothing in
 * `src/api/` is touched to make that true. The audience split is the other
 * half and comes from the policy, not from here: two facts, each read from the
 * thing that actually owns it.
 */
export function withDomainTags(document: OpenAPI.Document): OpenAPI.Document {
  for (const [path, operations] of Object.entries(document.paths ?? {})) {
    const domain = path.split("/").filter(Boolean)[0]
    if (!domain) continue
    for (const operation of Object.values(operations ?? {})) {
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) continue
      const op = operation as { tags?: string[] }
      op.tags = [...new Set([...(op.tags ?? []), domain])]
    }
  }
  return document
}

/**
 * Which procedures a document leaves out, per the environment asking.
 *
 * A deployment passes its own `env` and gets a document describing what it
 * mounts: production withholds every `dev` capability and publishes none,
 * staging grants `seedRoute` and `devSessionRoutes` and publishes those two.
 * The generator passes none and gets the published set.
 *
 * Production was serving all seven dev operations, with schemas, while
 * answering 404 to each. The 404s were right; advertising an internal surface
 * to whoever fetched the document was not.
 *
 * Plain infrastructure — health, the beacon, unsubscribe — stays out of both:
 * reachable, but not an API anyone is meant to build against.
 */
export function excludeInternal(env?: Bindings) {
  return (procedure: unknown) => {
    const middlewares = ((procedure as { "~orpc"?: { middlewares?: unknown[] } })["~orpc"]
      ?.middlewares ?? []) as unknown[]
    const policy = middlewares.map(policyOf).find((p) => p?.kind === "infrastructure")
    if (!policy || policy.kind !== "infrastructure") return false
    // A dev endpoint this deployment actually mounts is worth describing to
    // whoever is on call; one it withholds does not exist here.
    if (env && policy.capability) return !permits(env, policy.capability)
    return true
  }
}

/** How Zod schemas become JSON Schema. One list, both consumers. */
export const SCHEMA_CONVERTERS = [new ZodToJsonSchemaConverter()]

/** What the document says about itself, and how a caller authenticates. */
export const SPEC_OPTIONS = {
  // Read from package.json rather than pinned, so a published reference says
  // which release it describes instead of "0.1.0" forever.
  info: { version: APP_VERSION, title: "Remy Sport API" },
  components: {
    securitySchemes: {
      Session: {
        type: "http",
        scheme: "bearer",
        description: "Better Auth session token (browser)",
      },
      /**
       * The integration surface, and where an agent one would attach.
       *
       * When something serves MCP it is `@orpc/ai-sdk` over this same router,
       * filtered by tag, through an MCP adapter — never a hand-written tool
       * list, which would be a second description of the API that could
       * disagree with this one. Rate limiting for that surface is
       * `@orpc/cloudflare`'s limiter as a handler plugin. Neither is built.
       */
      ApiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Better Auth API key (integrations, MCP)",
      },
    },
  },
} as const

/**
 * CORS, on this handler only.
 *
 * `/api` is for external clients with their own credentials, so it is open.
 * `origin: "*"` with `credentials: true` is rejected by browsers, so
 * credentials are deliberately absent — the GUI is served from this same origin
 * and needs no CORS at all. The SPA's transport, `/rpc`, gets none: it is
 * same-origin, and granting CORS there would undo the CSRF plugin that guards
 * it, since the header check only works while a cross-site page cannot
 * preflight.
 */
export const openApiHandler = new OpenAPIHandler(router, {
  interceptors: [telemetryInterceptor] as never,
  plugins: [
    new CORSPlugin({ origin: "*" }),
    new OpenAPIReferencePlugin({
      schemaConverters: SCHEMA_CONVERTERS,
      specPath: "/openapi.json",
      docsPath: "/doc",
      docsTitle: "Remy Sport API",
      /**
       * A function, not a value, so the document can depend on the request.
       *
       * The plugin hands the interceptor options through, and `context.env` is
       * how this deployment knows which `dev` capabilities it mounts.
       */
      specGenerateOptions: (options: { context?: { env?: Bindings } }) => ({
        ...SPEC_OPTIONS,
        exclude: excludeInternal(options.context?.env),
      }),
    }),
  ],
})
