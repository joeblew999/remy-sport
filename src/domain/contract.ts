/**
 * The API contract: every operation's method, path, input and output.
 *
 * This is the seam. It names what the API is without knowing how it is served,
 * so both sides can depend on it without depending on each other:
 *
 *   src/api/*        implements it   (needs D1, sessions, drizzle)
 *   src/web/lib/*    calls it        (needs a browser)
 *
 * That matters concretely. When the SPA imported the *server router* type, it
 * dragged `src/types.ts` and therefore Cloudflare's Worker globals into the
 * browser's typecheck, which silently replaced the DOM's `Response` and broke
 * unrelated files. A contract has no server in it, so there is nothing to leak.
 *
 * It is also the single definition the whole stack derives from: oRPC builds
 * the handlers, the OpenAPI document, and the client's types from this object.
 */

import { oc } from "@orpc/contract"
import type { OpenAPIV3_1 } from "openapi-types"
import { z } from "zod"
import {
  CreateEventInput,
  CreateTeamInput,
  EventSchema,
  ReferenceSchema,
  TeamSchema,
  UpdateEventInput,
  UpdateTeamInput,
} from "./api"

const IdInput = z.object({ id: z.string() })

/**
 * Marks an operation as requiring a session, in the published document.
 *
 * The security schemes are declared once on the document (src/index.ts); this
 * says which operations demand them. Written as a route option rather than
 * remembered per handler, so a protected operation cannot be documented as
 * public — which is what an integrator reads before calling it.
 */
const authed = {
  spec: (operation: OpenAPIV3_1.OperationObject): OpenAPIV3_1.OperationObject => ({
    ...operation,
    security: [{ Session: [] }, { ApiKey: [] }],
    responses: {
      ...operation.responses,
      401: { description: "Not signed in" },
      403: { description: "Signed in, but not permitted" },
    },
  }),
}

export const contract = {
  events: {
    list: oc
      .route({ method: "GET", path: "/events", summary: "List all events" })
      .output(z.object({ events: z.array(EventSchema) })),
    get: oc
      .route({ method: "GET", path: "/events/{id}", summary: "Get one event" })
      .input(IdInput)
      .output(EventSchema),
    create: oc
      .route({ method: "POST", path: "/events", summary: "Create an event", successStatus: 201, ...authed })
      .input(CreateEventInput)
      .output(EventSchema),
    update: oc
      .route({ method: "PUT", path: "/events/{id}", summary: "Update an event", ...authed })
      .input(IdInput.extend(UpdateEventInput.shape))
      .output(EventSchema),
    delete: oc
      .route({ method: "DELETE", path: "/events/{id}", summary: "Delete an event", ...authed })
      .input(IdInput)
      .output(z.object({ deleted: z.boolean() })),
  },
  teams: {
    list: oc
      .route({ method: "GET", path: "/teams", summary: "List all teams" })
      .output(z.object({ teams: z.array(TeamSchema) })),
    get: oc
      .route({ method: "GET", path: "/teams/{id}", summary: "Get one team" })
      .input(IdInput)
      .output(TeamSchema),
    create: oc
      .route({ method: "POST", path: "/teams", summary: "Create a team", successStatus: 201, ...authed })
      .input(CreateTeamInput)
      .output(TeamSchema),
    update: oc
      .route({ method: "PUT", path: "/teams/{id}", summary: "Update a team", ...authed })
      .input(IdInput.extend(UpdateTeamInput.shape))
      .output(TeamSchema),
    delete: oc
      .route({ method: "DELETE", path: "/teams/{id}", summary: "Delete a team", ...authed })
      .input(IdInput)
      .output(z.object({ deleted: z.string() })),
  },
  health: {
    get: oc
      .route({ method: "GET", path: "/health", summary: "System health check" })
      .output(z.object({ status: z.literal("ok"), timestamp: z.string() })),
  },
  reference: {
    list: oc
      .route({
        method: "GET",
        path: "/reference",
        summary: "Controlled vocabularies, as the Product Owner defines them",
      })
      .output(ReferenceSchema),
  },
}

export type Contract = typeof contract
