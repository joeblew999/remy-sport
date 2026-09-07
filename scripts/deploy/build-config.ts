import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

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
  return matches[0]!
}
