import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { CORSPlugin } from "@orpc/server/plugins"
import { router } from "./index"
import { telemetryInterceptor } from "./telemetry"

/**
 * The REST surface: the API, its specification, and its reference page.
 *
 * `/api/openapi.json` is generated from the same router that serves the
 * requests, so the document cannot describe an endpoint that does not exist,
 * and `/api/doc` renders it. The plugin states the prefix as `servers`, which
 * lets the paths in the document match the paths in the router.
 *
 * Here rather than in src/index.ts so the dispatch has no route strings of its
 * own, and so a generator can build the same document without a server — the
 * options are the contract, and two callers of one object cannot drift.
 *
 * Security schemes are declared once; `authedRoute` in ./base.ts says which
 * operations demand them.
 */

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
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specPath: "/openapi.json",
      docsPath: "/doc",
      docsTitle: "Remy Sport API",
      specGenerateOptions: {
        info: { version: "0.1.0", title: "Remy Sport API" },
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
             * When something serves MCP it is `@orpc/ai-sdk` over this same
             * router, filtered by tag, through an MCP adapter — never a
             * hand-written tool list, which would be a second description of
             * the API that could disagree with this one. Rate limiting for
             * that surface is `@orpc/cloudflare`'s limiter as a handler plugin.
             * Neither is built.
             */
            ApiKey: {
              type: "apiKey",
              in: "header",
              name: "x-api-key",
              description: "Better Auth API key (integrations, MCP)",
            },
          },
        },
      },
    }),
  ],
})
