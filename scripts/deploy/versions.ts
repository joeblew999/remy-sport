/**
 * The build stamp for ONE environment, written before that environment's publish.
 *
 * `src/index.ts` bundles this file and serves it at `/api/versions`, so whatever
 * is written here is what that deployment will report about itself for as long
 * as it is live. That makes it a stamp, not a record: it describes the artifact
 * being built, and the only honest answer to "what is live where" is to ask each
 * environment, which `mise run ops versions` does.
 *
 * ## Why it names its environment
 *
 * The url used to be `requireEnv("CF_DEPLOY_URL")`, which mise derives to
 * PRODUCTION. Nothing passed --env, so a staging deploy stamped production's
 * hostname into the artifact and staging's own /api/versions answered
 * `https://remy.ubuntusoftware.net`. Measured 2026-09-02: staging served
 * d411075 while claiming to be production, and the committed file claimed
 * production was 07420e2 when it was really 22 commits behind at b63532f.
 *
 * That is the same failure mise.toml already describes for CF_D1_NAME —
 * "it cannot express three environments, and the failure is never an error —
 * every caller quietly does the right thing to the wrong one". The smoke step
 * was taught about --env in d14852e; this one was missed.
 *
 * `resolveTarget` with its default `explicit` rule is the guard: there is no
 * ambient fallback any more, so this cannot stamp an environment nobody named.
 *
 * ## Why there is no history array
 *
 * There was one, and it was wrong. It kept the last twenty deploys, but with a
 * single `current` shared by every environment, whichever deployed last
 * overwrote it — so it recorded staging deploys as production and drifted from
 * reality without ever failing. Git already holds this correctly, and
 * Cloudflare holds its own version list in `cf_versions` below.
 *
 * Env vars (from mise.toml [env]):
 *   GITHUB_REPO_URL — GitHub repo URL (for commit links)
 *   CF_WORKER_NAME  — CF worker name (for preview URLs)
 *   CF_SUBDOMAIN    — CF account subdomain (for preview URLs)
 */

import { execSync } from "child_process"
import { wrangler, resolveTarget, originOf, workerName } from "../lib/cloudflare"
import { writeFileSync } from "fs"
import https from "https"

const run = (cmd: string) => execSync(cmd, { encoding: "utf-8" }).trim()

// Names must match mise.toml [env]. Fail loudly rather than writing
// "undefined" into versions.json, which the GUI renders as a broken link.
function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`versions.ts: missing required env var ${name} (expected from mise.toml [env])`)
    process.exit(1)
  }
  return v
}

// Explicit --env, no ambient fallback: an unnamed environment resolving to
// production is precisely the bug this file carried.
/**
 * dev is handled before `resolveTarget`, which refuses it on purpose — dev
 * "provisions nothing on the account", so it is not a deploy target and has no
 * [[routes]] to take an origin from.
 *
 * It still needs a stamp. The committed versions.json is what `mise run 1-dev`
 * bundles and serves, so with a deploy's stamp left in it the local server
 * reports whichever environment was published last — which is how the file came
 * to sit in git saying "staging" while describing a laptop.
 */
const argv = process.argv.slice(2)
const at = argv.indexOf("--env")
const IS_DEV = (at !== -1 ? argv[at + 1] : undefined) === "dev"

const ENVIRONMENT = IS_DEV ? "dev" : resolveTarget(argv).environment
const DEPLOYED_URL = IS_DEV
  ? (process.env.DEV_URL ?? "http://localhost:8787")
  : originOf(resolveTarget(argv))
const GITHUB_REPO = requireEnv("GITHUB_REPO_URL")
const WORKER_NAME = requireEnv("CF_WORKER_NAME")
const CF_SUBDOMAIN = requireEnv("CF_SUBDOMAIN")

// --- Current version from git ---

const shortSha = run("git rev-parse --short HEAD")
const fullSha = run("git rev-parse HEAD")

const current = {
  _generated: new Date().toISOString(),
  app: require("../../package.json").version,
  // Which environment this artifact was built for. Without it a reader of
  // /api/versions cannot tell staging from production, and neither could this
  // file's own url.
  environment: ENVIRONMENT,
  url: DEPLOYED_URL,
  git: {
    commit: shortSha,
    branch: run("git branch --show-current"),
    tag: run("git describe --tags --always 2>/dev/null || echo none"),
    github: `${GITHUB_REPO}/commit/${fullSha}`,
  },
}

// --- Health-check helper ---

function checkHealth(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    https
      .get(`${url}/api/health`, { timeout: 5000 }, (res) => resolve(res.statusCode === 200))
      .on("error", () => resolve(false))
      .on("timeout", function (this: any) {
        this.destroy()
        resolve(false)
      })
  })
}

// --- Cloudflare Worker versions with health-checked preview URLs ---

let cf_versions: any[] = []
try {
  // Through the module, so this gets the same credential and the same pinned
  // account as everything else — it used to shell out to `bunx wrangler`
  // directly with 2>/dev/null, which is its own client and its own silence.
  // Sliced from the first `[` because wrangler prints a banner alongside the
  // JSON, exactly as the D1 listing does.
  const listed = wrangler(["versions", "list", "--json"])
  const start = listed.out.indexOf("[")
  if (listed.code !== 0 || start === -1) throw new Error("versions list unavailable")
  const raw = JSON.parse(listed.out.slice(start))
  cf_versions = await Promise.all(
    raw.map(async (v: any) => {
      const previewId = v.id.split("-")[0]
      const previewUrl = v.metadata.has_preview
        ? `https://${previewId}-${WORKER_NAME}.${CF_SUBDOMAIN}.workers.dev`
        : null
      const healthy = previewUrl ? await checkHealth(previewUrl) : false
      return {
        id: v.id,
        number: v.number,
        created: v.metadata.created_on,
        source: v.annotations?.["workers/triggered_by"] || v.metadata.source,
        url: healthy ? previewUrl : null,
      }
    })
  )
} catch {}

// --- Write output ---

writeFileSync("versions.json", JSON.stringify({ current, cf_versions }, null, 2) + "\n")
console.log(
  `versions.json stamped for ${current.environment} — v${current.app} · ${shortSha} · ${current.git.branch}\n` +
    `  ${DEPLOYED_URL} reports this ${IS_DEV ? "after the next restart" : "once it is published"}`,
)
