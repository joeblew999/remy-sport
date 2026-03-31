#!/usr/bin/env bun
/**
 * Fetches the OpenAPI spec from the running dev server and generates
 * TypeScript types + a typed client.
 *
 * Usage:
 *   bun scripts/generate-api-types.ts          # uses http://localhost:8787
 *   BASE_URL=https://... bun scripts/generate-api-types.ts
 */
import { execSync } from "node:child_process"
import { writeFileSync } from "node:fs"

const baseUrl = process.env.BASE_URL || "http://localhost:8787"
const specUrl = `${baseUrl}/openapi.json`
const outTypes = "src/api-client/schema.gen.d.ts"
const outClient = "src/api-client/index.gen.ts"

// 1. Fetch + save spec
console.log(`Fetching OpenAPI spec from ${specUrl}…`)
const res = await fetch(specUrl)
if (!res.ok) {
  console.error(`Failed to fetch spec: ${res.status} ${res.statusText}`)
  console.error("Is the dev server running? (mise run dev)")
  process.exit(1)
}
const spec = await res.json()
writeFileSync("src/api-client/openapi.gen.json", JSON.stringify(spec, null, 2))
console.log("Saved src/api-client/openapi.gen.json")

// 2. Generate types from the saved spec
console.log("Generating TypeScript types…")
execSync(`bun x openapi-typescript src/api-client/openapi.gen.json -o ${outTypes}`, {
  stdio: "inherit",
})

// 3. Generate the typed client wrapper
const clientCode = `// Auto-generated — do not edit. Run: mise run api:types
import createClient from "openapi-fetch"
import type { paths } from "./schema.gen.js"

/**
 * Typed API client generated from the OpenAPI spec.
 *
 * Usage:
 *   import { api } from "./api-client"
 *   const { data, error } = await api.GET("/api/events")
 */
export const api = createClient<paths>({ baseUrl: "/" })

export type { paths } from "./schema.js"
`
writeFileSync(outClient, clientCode)

console.log(`Generated ${outTypes}`)
console.log(`Generated ${outClient}`)
console.log("Done.")
