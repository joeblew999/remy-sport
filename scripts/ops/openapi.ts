import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { OpenAPIGenerator } from "@orpc/openapi"
import { router } from "../../src/api/index.ts"
import { SCHEMA_CONVERTERS, SPEC_OPTIONS, withDomainTags } from "../../src/api/openapi.ts"
import { policyOf } from "../../src/api/base.ts"

/**
 * The published OpenAPI document, generated from the router.
 *
 * **No server, and no fetch.** The generator is called directly, on the same
 * `router` the Worker serves and the same options object `src/api/openapi.ts`
 * hands its handler — so the committed snapshot and the deployed
 * `/api/openapi.json` are one description, not two that happen to agree.
 *
 * Fetching a deployment's spec would have been easier and wrong: the check
 * would then pass whenever the file matched whatever was last deployed, which
 * is a check reporting the state of a deploy rather than the state of the
 * tree. `tests/repo/manifest.test.ts` makes that mistake today and is on the
 * plan's follow-up list because of it.
 *
 *   bun run ops openapi            print the document
 *   bun run ops openapi --write    write sites/help/schema/openapi.json
 *   bun run ops openapi --check    fail on drift
 */

const ROOT = resolve(import.meta.dirname, "../..")
export const SCHEMA_FILE = resolve(ROOT, "sites/help/schema/openapi.json")

/**
 * What the help site publishes: everything a reader outside this repo can call.
 *
 * The dev endpoints and the infrastructure ones are dropped. They are not
 * secrets — the deployed `/api/doc` shows them, which is the point, so whoever
 * is on call can see `dev.outbox` on staging — but a published reference that
 * lists a seed route reads as an invitation, and on production those
 * operations answer 404 anyway.
 *
 * The audience comes from the **policy**, which is the thing that already
 * decides whether the endpoint exists at all — `dev(capability)` and
 * `infrastructure(why)` both mark a procedure as not a domain object, and
 * `tests/repo/authz.test.ts` proves every procedure carries a mark. So nothing
 * can join this router without declaring which side of this line it is on, and
 * no tag has to be remembered.
 *
 * The domain tag is the other half and is added over the finished document by
 * `withDomainTags` — see src/api/openapi.ts for why that belongs to generation
 * rather than to the builder.
 */
export async function generate(audience: "public" | "internal" = "public") {
  const generator = new OpenAPIGenerator({ schemaConverters: SCHEMA_CONVERTERS })
  return withDomainTags(await generator.generate(router, {
    ...SPEC_OPTIONS,
    ...(audience === "public"
      ? {
          exclude: (procedure: unknown) => {
            const middlewares = ((procedure as { "~orpc"?: { middlewares?: unknown[] } })["~orpc"]
              ?.middlewares ?? []) as unknown[]
            return middlewares.map(policyOf).some((policy) => policy?.kind === "infrastructure")
          },
        }
      : {}),
  }))
}

const argv = process.argv.slice(2)
const audience = argv.includes("--internal") ? "internal" : "public"
const document = JSON.stringify(await generate(audience), null, 2) + "\n"

if (argv.includes("--write")) {
  writeFileSync(SCHEMA_FILE, document)
  console.log(`openapi: wrote sites/help/schema/openapi.json (${audience})`)
} else if (argv.includes("--check")) {
  const committed = readFileSync(SCHEMA_FILE, "utf8")
  if (committed !== document) {
    console.error(
      "openapi: sites/help/schema/openapi.json is not what the router describes.\n\n" +
        "  The snapshot is generated, never edited by hand. Run:\n" +
        "    bun run ops openapi --write\n\n" +
        "  and read the diff — it is the contract changing, which is worth a look\n" +
        "  before it reaches anyone reading the published reference.",
    )
    process.exit(1)
  }
  console.log("openapi: the published schema matches the router")
} else {
  console.log(document)
}
