/**
 * Regenerate src/db/auth-schema.ts from auth.config — `bun run ops auth-schema`.
 *
 * Better Auth owns its tables. The library decides what columns they have; a
 * hand-edited copy drifts silently, and the drift only shows as a query against
 * a column that is not there, which is how migration 0007 broke every sign-in.
 * tests/repo/auth-schema.test.ts fails the gate when the committed copy is not
 * what the CLI generates, and this is the one command that makes it so again —
 * after a Better Auth upgrade or a change to auth.config.ts.
 */
const generated = Bun.spawnSync(
  ["bun", "x", "auth", "generate", "--config", "src/auth.cli.ts", "--output", "src/db/auth-schema.ts", "-y"],
  { stdout: "inherit", stderr: "inherit" },
)
if (generated.exitCode === 0) console.log("auth-schema: src/db/auth-schema.ts regenerated — diff it, then commit")
process.exit(generated.exitCode ?? 1)
