/**
 * `bun run build`, with one question asked first: is a deploy using dist/?
 *
 * The build empties `dist/` and writes it again, and a deploy publishes from
 * `dist/client`. Running one during the other leaves the deploy publishing a
 * directory that is being rewritten underneath it — or, if the timing is kind,
 * publishing half of it. On 2026-09-10 a standalone `bun run build` was one of
 * four ways a deploy was corrupted from the same tree in a single session.
 *
 * A wrapper rather than a package.json one-liner, because the guard has to run
 * before Vite does and package scripts have nowhere to put a reason. The deploy
 * invokes Vite directly and is exempt anyway; this is the path a person takes.
 */
import { spawnSync } from "node:child_process"
import { refuseWhileDeploying } from "./lib/deploy-lock.ts"

refuseWhileDeploying("build")

const result = spawnSync(
  "bun",
  ["x", "vite", "build", "--config", "src/web/vite.config.ts", ...process.argv.slice(2)],
  { stdio: "inherit" },
)
process.exit(result.status ?? 1)
