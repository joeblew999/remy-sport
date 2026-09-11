import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * What a build is: the commit, branch, time and environment it came from.
 *
 * One definition, two readers — src/web/vite.config.ts bakes it into the SPA
 * as `__BUILD__`, and scripts/deploy/build-config.ts writes it into the
 * generated Worker config as `vars.BUILD`. It lives here rather than in the
 * Vite config because the deploy script cannot import that file without
 * pulling the whole plugin graph, and a second copy of these six fields is
 * exactly how the two would drift.
 *
 * The Worker deliberately does NOT read a compile-time constant for this. See
 * src/build.d.ts for why that distinction is load-bearing.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

const git = (args: string): string => {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

export interface BuildStamp {
  commit: string
  branch: string
  builtAt: string
  environment: string
  app: string
  github: string | null
}

export function stamp(command: "build" | "serve", environment: string): BuildStamp {
  const commit = git("rev-parse --short HEAD")
  const repo = process.env.GITHUB_REPO_URL
  return {
    commit,
    branch: git("branch --show-current"),
    // `bun run deploy` exports BUILD_ID so the build and the config it deploys
    // report the same instant — that value is what `wait` compares against.
    builtAt: process.env.BUILD_ID ?? new Date().toISOString(),
    environment,
    app: (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }).version,
    github: repo && commit ? `${repo}/commit/${git("rev-parse HEAD")}` : null,
  }
}
