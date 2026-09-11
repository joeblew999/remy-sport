import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { stamp } from "../lib/build-stamp.ts"

/** The gate builds production before staging, so dist may contain both. Never
 * select by directory order: the resolved Worker name must match the target.
 */
export function buildConfig(directory: string, worker: string, account: string): string {
  const matches = readdirSync(directory)
    .map(name => join(directory, name, "wrangler.json"))
    .filter(path => existsSync(path))
    .filter(path => {
      const config = JSON.parse(readFileSync(path, "utf8")) as { name?: string; account_id?: string }
      return config.name === worker && config.account_id === account
    })
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one build for ${worker} in the configured account; found ${matches.length}`)
  }
  return withBuildStamp(matches[0]!)
}

/**
 * Replace the placeholder `BUILD` var with this build's real stamp.
 *
 * wrangler.toml carries a placeholder so `wrangler dev` and the worker test
 * tier have a value; only a deploy knows the commit and time. Written here
 * rather than baked in as a define because the Worker reads it from `env` —
 * a define would be a value that differs across environments without POLICY
 * or provisioning knowing, and would be absent wherever the substitution did
 * not run.
 *
 * `environment` comes from the config's own `vars.ENVIRONMENT` so this cannot
 * disagree with the deployment it is writing into. `BUILD_ID` is exported by
 * `bun run deploy`, so the stamp written here carries the same `builtAt` the
 * client bundle was built with, which is what `wait` compares against.
 */
function withBuildStamp(path: string): string {
  const config = JSON.parse(readFileSync(path, "utf8")) as {
    vars?: Record<string, unknown>
  }
  const vars = config.vars ?? {}
  const environment = typeof vars.ENVIRONMENT === "string" ? vars.ENVIRONMENT : "production"
  config.vars = { ...vars, BUILD: stamp("build", environment) }
  writeFileSync(path, JSON.stringify(config, null, 2))
  return path
}
