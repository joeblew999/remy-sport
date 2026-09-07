/**
 * Regenerate src/db/auth-schema.ts from auth.config — `bun run ops auth-schema`.
 *
 * Better Auth owns its tables. The library decides what columns they have; a
 * hand-edited copy drifts silently, and the drift only shows as a query against
 * a column that is not there, which is how migration 0007 broke every sign-in.
 * tests/repo/auth-schema.test.ts fails the gate when the committed copy is not
 * what the CLI generates, and this is the one command that makes it so again —
 * after a Better Auth upgrade or a change to auth.config.ts.
 *
 * `auth`, the CLI run below, is a separate package from `better-auth`, the
 * runtime, and package.json pins both to the same exact version on purpose:
 * the schema the CLI generates has to be the one the runtime queries, and the
 * two only agree when their versions do. That is why `auth` stays a listed
 * package although nothing imports it; tests/repo/auth-schema.test.ts holds
 * the pin.
 */
import { spawnSync } from "node:child_process"

const generated = spawnSync(
  "bun",
  ["x", "auth", "generate", "--config", "src/auth.cli.ts", "--output", "src/db/auth-schema.ts", "-y"],
  { stdio: "inherit" },
)
if (generated.status === 0) console.log("auth-schema: src/db/auth-schema.ts regenerated — diff it, then commit")
process.exit(generated.status ?? 1)
