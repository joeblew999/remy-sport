/**
 * Generate versions.json with git history and Cloudflare Worker versions.
 *
 * Env vars (from mise.toml [env]):
 *   CF_DEPLOY_URL   — production worker URL
 *   GITHUB_REPO_URL — GitHub repo URL (for commit links)
 *   CF_WORKER_NAME  — CF worker name (for preview URLs)
 *   CF_SUBDOMAIN    — CF account subdomain (for preview URLs)
 */

import { execSync } from "child_process"
import { wrangler } from "./cloudflare"
import { readFileSync, writeFileSync } from "fs"
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

const DEPLOYED_URL = requireEnv("CF_DEPLOY_URL")
const GITHUB_REPO = requireEnv("GITHUB_REPO_URL")
const WORKER_NAME = requireEnv("CF_WORKER_NAME")
const CF_SUBDOMAIN = requireEnv("CF_SUBDOMAIN")

// --- Current version from git ---

const shortSha = run("git rev-parse --short HEAD")
const fullSha = run("git rev-parse HEAD")

const current = {
  _generated: new Date().toISOString(),
  app: require("../package.json").version,
  url: DEPLOYED_URL,
  git: {
    commit: shortSha,
    branch: run("git branch --show-current"),
    tag: run("git describe --tags --always 2>/dev/null || echo none"),
    github: `${GITHUB_REPO}/commit/${fullSha}`,
  },
}

// --- History: append previous current, dedupe, keep last 20 ---

let history: any[] = []
try {
  const prev = JSON.parse(readFileSync("versions.json", "utf-8"))
  history = prev.history || []
  if (history[0]?.git?.commit !== current.git.commit) {
    history.unshift(prev.current || { app: prev.app, git: prev.git, url: prev.url })
  }
} catch {}
history = history.filter((h: any) => h.git?.commit !== current.git.commit)
history = history.slice(0, 20)

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

writeFileSync("versions.json", JSON.stringify({ current, history, cf_versions }, null, 2) + "\n")
console.log(`versions.json updated — v${current.app} · ${shortSha} · ${current.git.branch}`)
