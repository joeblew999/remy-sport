// Auto-generated — do not edit. Run: mise run api:types
import createClient from "openapi-fetch"
import type { paths } from "./schema.js"

/**
 * Typed API client generated from the OpenAPI spec.
 *
 * Usage:
 *   import { api } from "./api-client"
 *   const { data, error } = await api.GET("/api/events")
 */
export const api = createClient<paths>({ baseUrl: "/" })

export type { paths } from "./schema.js"
