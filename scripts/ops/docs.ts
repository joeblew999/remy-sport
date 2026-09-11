/** Independent package proof. Never runs the app's installer or deployment. */
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { spawn, execFileSync } from "node:child_process"
import { createServer } from "node:net"
import { once } from "node:events"
import { fnoxGet, namedEnvironment, normalisedEnvironmentArgs } from "../lib/cloudflare"
import { helpTarget, writeHelpTarget, releaseHelp } from "./docs-release"
import { assertPinnedBun } from "../lib/bun-pin"
import { createApiClient } from "../../src/api-client.ts"

const root = resolve(import.meta.dirname, "../..")
const site = join(root, "sites/help")
const toolSite = join(root, "sites/help-tools")
const editorSite = join(root, "sites/help-editor")

/** Capture bytes, not Git status: the app already has unrelated uncommitted work. */
export function appSnapshot(base = root): Record<string, string> {
  const out: Record<string, string> = {}
  function walk(file: string, manifestsOnly = false) {
    if (!existsSync(file)) return
    const stat = lstatSync(file)
    if (stat.isSymbolicLink()) {
      out[relative(base, file)] = realpathSync(file)
    } else if (stat.isDirectory()) {
      for (const name of readdirSync(file).sort()) walk(join(file, name), manifestsOnly)
    } else if (!manifestsOnly || file.endsWith("/package.json") || file.endsWith("/.package-lock.json")) {
      out[relative(base, file)] = createHash("sha256").update(readFileSync(file)).digest("hex")
    }
  }
  for (const name of ["package.json", "bun.lock", "bunfig.toml", "mise.toml", "wrangler.toml", "tsconfig.json", "vitest.config.ts", "src", "dist"]) walk(join(base, name))
  walk(join(base, "node_modules"), true)
  return out
}

export function changedPaths(before: Record<string, string>, after: Record<string, string>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]).sort()
}

// Do not hand the docs builder app credentials, deployment overrides or NODE_PATH.
function childEnv(): NodeJS.ProcessEnv {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, SYSTEMROOT: process.env.SYSTEMROOT }
  // The app augments ProcessEnv with required app bindings; this child deliberately has none.
  return { ...env, CI: "1", NO_COLOR: "1", WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: join(site, ".proof/wrangler"), WRANGLER_CACHE_DIR: join(site, ".proof/cache") } as unknown as NodeJS.ProcessEnv
}

async function command(args: string[], cwd = site, explicitEnv: Record<string, string> = {}) {
  const child = spawn(args[0]!, args.slice(1), { cwd, env: { ...childEnv(), ...explicitEnv }, stdio: "inherit", detached: true })
  const stop = () => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL") } catch { /* already exited */ } } }
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; stop() }, 300_000)
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    const [code, signal] = await once(child, "exit")
    if (code !== 0) throw new Error(`docs: ${args.join(" ")} failed (${timedOut ? "timed out after 300 seconds" : signal ?? code})`)
  } finally {
    clearTimeout(timer)
    stop()
    process.removeListener("SIGINT", stop)
    process.removeListener("SIGTERM", stop)
  }
}

function checkInstall() {
  const manifest = JSON.parse(readFileSync(join(site, "package.json"), "utf8"))
  const req = createRequire(join(site, "package.json"))
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    const local = join(site, "node_modules", name)
    if (!existsSync(join(local, "package.json")) || !realpathSync(local).startsWith(site + "/node_modules/")) throw new Error(`docs: dependency is not installed locally: ${name}`)
  }
  // Several packages intentionally have no root export (or are CLI-only).
  for (const name of ["react", "react-dom", "vite", "fumapress", "fumadocs-core/source", "fumadocs-mdx/config", "fumadocs-ui/mdx", "@base-ui/react", "@tailwindcss/vite"]) {
    const resolved = req.resolve(name)
    if (!realpathSync(resolved).startsWith(site + "/node_modules/")) throw new Error(`docs: dependency resolved outside package: ${name}`)
  }
}

function checkAuxInstall(dir: string) {
  if (realpathSync(dir) !== dir) throw new Error("docs: auxiliary package must not be a symlink")
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
  if (manifest.workspaces) throw new Error("docs: auxiliary package must be independent")
  const req = createRequire(join(dir, "package.json"))
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    const local = join(dir, "node_modules", name)
    if (!existsSync(join(local, "package.json")) || !realpathSync(local).startsWith(dir + "/node_modules/")) throw new Error(`docs: auxiliary dependency escaped: ${name}`)
  }
  const representative = dir === toolSite ? "@modelcontextprotocol/sdk/server/mcp.js" : "@fumadocs-editor/core/sync"
  if (!realpathSync(req.resolve(representative)).startsWith(dir + "/node_modules/")) throw new Error("docs: auxiliary module resolved outside package")
}

async function freePort(preferred = 0) {
  const server = createServer()
  server.listen(preferred, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("docs: no preview port")
  await new Promise<void>((resolveClose, reject) => server.close((err) => err ? reject(err) : resolveClose()))
  return address.port
}

async function ensureLocalApp() {
  const ready = async () => {
    try {
      const health = await createApiClient("http://127.0.0.1:8787").health.get()
      if (health.environment !== "dev") throw new Error("docs: local app is not the dev environment")
      return true
    } catch (error) {
      if ((error as Error).message.includes("not the dev")) throw error
      return false
    }
  }
  if (await ready()) return undefined
  await freePort(8787) // refuse to replace an unrelated listener
  console.log("docs: starting the app with its documented bun run dev command")
  const child = spawn(process.execPath, ["run", "dev"], { cwd: root, env: process.env, stdio: "inherit", detached: true })
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw new Error("docs: app dev command exited")
    if (await ready()) return child
    await new Promise(r => setTimeout(r, 300))
  }
  if (child.pid) process.kill(-child.pid, "SIGTERM")
  throw new Error("docs: app did not become ready")
}

// Recover our exact local development process even if its terminal was closed.
// Never stop the main app or a different process using the same port.
async function stopDev() {
  const expected = [`node ${join(site, "node_modules/wrangler/bin/wrangler.js")} dev --local --config ${join(toolSite, ".proof/dev-wrangler.json")} --port 8792 --ip 127.0.0.1`, `node ${join(site, "node_modules/fumapress/cli.js")} dev --port 8791 --host 127.0.0.1`, `node ${join(toolSite, "server.mjs")} http://127.0.0.1:8791 8792`, `node ${join(editorSite, "node_modules/@fumadocs-editor/studio/dist/cli.js")} --config fumadocs-studio.config.ts --no-open`]
  const lines = execFileSync("ps", ["-ax", "-o", "pid=,command="], { encoding: "utf8" }).split("\n")
  for (const line of lines) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/)
    if (!match || !expected.includes(match[2]!)) continue
    const pid = Number(match[1])
    try { process.kill(pid, "SIGTERM") } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") continue // supervisor already stopped this child
      throw error
    }
    for (let attempt = 0; attempt < 50; attempt++) {
      try { process.kill(pid, 0) } catch { break }
      await new Promise((r) => setTimeout(r, 100))
    }
    console.log("docs: stopped previous help development server")
  }
}

async function preview(interactive: boolean, live = false, author = false) {
  const port = await freePort(interactive ? 8791 : 0)
  const url = `http://127.0.0.1:${port}`
  // Launch the local binary directly so normal cleanup is not reported as a
  // failed package script (Bun prints exit 143 when its preview child is stopped).
  const serverArgs = live
    ? [join(site, "node_modules/fumapress/cli.js"), "dev", "--port", String(port), "--host", "127.0.0.1"]
    : [join(site, "node_modules/wrangler/bin/wrangler.js"), "dev", "--local", "--config", "wrangler.jsonc", "--port", String(port), "--ip", "127.0.0.1"]
  const child = spawn("node", serverArgs, { cwd: site, env: childEnv(), stdio: "inherit", detached: !live })
  let companion: ReturnType<typeof spawn> | undefined
  let editor: ReturnType<typeof spawn> | undefined
  const stop = () => { editor?.kill("SIGTERM"); companion?.kill("SIGTERM"); if (child.pid) { try { if (live) child.kill("SIGTERM"); else process.kill(-child.pid, "SIGTERM") } catch { /* already exited */ } } }
  const onSignal = () => stop()
  process.once("SIGINT", onSignal)
  process.once("SIGTERM", onSignal)
  try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error("docs: preview exited before readiness")
      try { ready = (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok } catch { /* startup */ }
      if (ready) break
      await new Promise((r) => setTimeout(r, 200))
    }
    if (!ready) throw new Error("docs: preview did not become ready")
    if (interactive) {
      await freePort(8792)
      {
        const config = join(toolSite, ".proof/dev-wrangler.json")
        mkdirSync(join(toolSite, ".proof"), { recursive: true })
        const target = helpTarget("dev")
        writeFileSync(config, JSON.stringify({ name: "remy-help-local", main: join(toolSite, "worker.mjs"), compatibility_date: "2026-09-09", compatibility_flags: ["nodejs_compat"], workers_dev: false, vars: { ENVIRONMENT: "dev", HELP_ORIGIN: target.origin, APP_ORIGIN: target.appOrigin, VITE_ORIGIN: url } }))
        companion = spawn("node", [join(site, "node_modules/wrangler/bin/wrangler.js"), "dev", "--local", "--config", config, "--port", "8792", "--ip", "127.0.0.1"], { cwd: toolSite, env: childEnv(), stdio: "inherit" })
      }
      let toolsReady = false
      for (let attempt = 0; attempt < 50; attempt++) {
        if (companion.exitCode !== null) throw new Error("docs: tools server exited")
        try { toolsReady = (await fetch("http://127.0.0.1:8792/health", { signal: AbortSignal.timeout(1000) })).ok } catch { /* starting */ }
        if (toolsReady) break
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (!toolsReady) throw new Error("docs: tools server did not become ready")
    }
    if (author) {
      await freePort(8793)
      editor = spawn("node", [join(editorSite, "node_modules/@fumadocs-editor/studio/dist/cli.js"), "--config", "fumadocs-studio.config.ts", "--no-open"], { cwd: editorSite, env: childEnv(), stdio: "inherit" })
      let editorReady = false
      for (let attempt = 0; attempt < 100; attempt++) {
        if (editor.exitCode !== null) throw new Error("docs: editor exited before readiness")
        try { editorReady = (await fetch("http://127.0.0.1:8793")).ok } catch { /* starting */ }
        if (editorReady) break
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      if (!editorReady) throw new Error("docs: editor did not become ready")
      console.log("docs: Studio ready at http://127.0.0.1:8793; changes save to public help content only")
    }
    if (live) {
      const response = await fetch(url)
      if (!response.headers.get("x-robots-tag")?.includes("noindex")) throw new Error("docs: dev missing noindex")
      for (const path of ["/en.md", "/en.md", "/en/sign-in.md", "/api/search"]) {
        const result = await fetch(url + path, { signal: AbortSignal.timeout(5000) })
        if (!result.ok) throw new Error(`docs: live endpoint failed ${path}: ${result.status}`)
      }
      await command(["node", "worker-check.mjs", "http://127.0.0.1:8792", "dev"], toolSite)
      console.log(`docs: live development ready at ${url}; edits update through Vite; Ctrl-C stops it`)
      await once(child, "exit")
      return
    }
    await command([process.execPath, "run", "audit", url])
    await command(["node", "check.mjs", url], toolSite)
    await command(["node", "application-check.mjs", url], toolSite)
    await command([process.execPath, "install", "--frozen-lockfile"], editorSite)
    checkAuxInstall(editorSite)
    await command(["node", "check.mjs"], editorSite)
    for (const [path, expected] of [["/en", "Remy Sport help"], ["/en/sign-in", "Signing in"], ["/en/following-a-game", "Following a game"], ["/en/sign-in.md", "Signing in"], ["/llms.txt", "sign-in"], ["/sitemap.xml", "help.remy.invalid"], ["/api/search", "sign-in"]]) {
      const response = await fetch(url + path, { signal: AbortSignal.timeout(5000) })
      const body = await response.text()
      if (!response.ok || !body.includes(expected!)) throw new Error(`docs: failed response check ${path}: ${response.status}`)
      if (!response.headers.get("x-robots-tag")?.includes("noindex")) throw new Error(`docs: missing noindex ${path}`)
    }
    if ((await fetch(url + "/not-a-page")).status !== 404) throw new Error("docs: missing page did not return 404")
    console.log(`docs: static HTML, Markdown, search, sitemap, headers and 404 passed at ${url}`)
    if (interactive) {
      console.log(`docs: preview ready at ${url}; Ctrl-C stops its process group`)
      await once(child, "exit")
    }
  } finally {
    stop()
    if (child.exitCode === null && child.signalCode === null) await once(child, "exit")
    process.removeListener("SIGINT", onSignal)
    process.removeListener("SIGTERM", onSignal)
  }
}

export async function runDocs(rawArgs: string[]): Promise<number> {
  /**
   * `--env=staging` normalised to `--env staging` before anything reads it.
   *
   * The checks below are positional — `environmentAt !== 1` and `length !== 3`
   * — so they cannot be made to accept both spellings in place. Normalising
   * once keeps that strictness and removes the trap: this function read only
   * `--env `, so `docs check --env=staging` set `remote` to false and ran a
   * **local** check while the caller believed they had asked about staging.
   * No error, and the output of a local check looks like the output of a
   * remote one.
   */
  const args = normalisedEnvironmentArgs(rawArgs)
  const action = args[0] ?? "check"
  const environmentAt = args.indexOf("--env")
  const environment = environmentAt >= 0 ? namedEnvironment(args) : undefined
  const remote = ["deploy", "status", "rollback", "gemini"].includes(action) || (action === "check" && environmentAt >= 0)
  if (remote && (args.length !== 3 || environmentAt !== 1 || !["staging", "production"].includes(environment ?? ""))) throw new Error("docs remote actions require --env staging|production")
  if (action === "--help") {
    console.log("bun run ops docs [dev|author|stop|check|preview|lock|clean|discover]\nauthor starts Studio alongside help and MCP; dev installs and starts Vite live updates at http://127.0.0.1:8791; check installs the independent locked packages, builds and verifies locally; preview keeps the verified site open; stop stops help development, MCP and Studio; clean removes only the three help packages’ generated files. lock updates their independent lockfiles after manifest edits. Remote: docs check|deploy|status|rollback|gemini --env staging|production. Help-only; never deploys the app.\ndiscover [app-origin] [public-help-origin] verifies the live public API and optional public crawlability without starting or stopping servers.")
    return 0
  }
  if (!remote && ((args.length > 1 && action !== "discover") || !["dev", "author", "stop", "check", "preview", "lock", "clean", "discover"].includes(action))) throw new Error("docs: expected dev, author, stop, check, preview, lock or clean")
  if (assertPinnedBun()) return 1
  for (const dir of [site, toolSite, editorSite]) {
    if (realpathSync(dir) !== dir) throw new Error("docs: package directory must not be a symlink")
  }
  if (JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces) throw new Error("docs: recheck isolation before introducing a root workspace")
  // App startup is an explicit use of its own workflow. Fingerprint the docs
  // operation after startup, including generated app files.
  const ownedApp = ["dev", "author"].includes(action) ? await ensureLocalApp() : undefined
  const before = appSnapshot()
  try {
    if (action === "gemini") {
      const key = process.env.GEMINI_API_KEY || fnoxGet("GEMINI_API_KEY")
      if (!key) throw new Error("docs: real Gemini verification needs GEMINI_API_KEY in the environment or the existing fnox keychain; no model test was run")
      await command(["node", "gemini-check.mjs", helpTarget(environment!).origin], toolSite, { GEMINI_API_KEY: key })
      return 0
    }
    if (remote && ["status", "rollback"].includes(action)) {
      await command([process.execPath, "install", "--frozen-lockfile"], toolSite)
      checkAuxInstall(toolSite)
      await releaseHelp(action, environment!, command, childEnv())
      return 0
    }
    if (action === "discover") {
      if (args.length > 3) throw new Error("docs discover [app-origin] [public-help-origin]")
      await command([process.execPath, "install", "--frozen-lockfile"], toolSite)
      checkAuxInstall(toolSite)
      await command(["node", "discover.mjs", ...args.slice(1)], toolSite)
      return 0
    }
    await stopDev()
    writeHelpTarget(helpTarget("dev"))
    if (action === "stop") return 0
    if (action === "clean") {
      for (const dir of [site, toolSite, editorSite]) {
        for (const name of ["node_modules", "dist", ".source", ".vite", ".proof", ".wrangler"]) rmSync(join(dir, name), { recursive: true, force: true })
      }
      return 0
    }
    mkdirSync(join(site, ".proof"), { recursive: true })
    rmSync(join(site, ".proof/result.json"), { force: true })
    if (action === "lock") {
      await command([process.execPath, "install"])
      checkInstall()
      await command([process.execPath, "install"], toolSite)
      await command([process.execPath, "install"], editorSite)
      checkAuxInstall(toolSite)
      checkAuxInstall(editorSite)
      return 0
    }
    if (!existsSync(join(site, "bun.lock"))) throw new Error("docs: committed sites/help/bun.lock is missing; refusing an unlocked install")
    await command([process.execPath, "install", "--frozen-lockfile"])
    checkInstall()
    await command([process.execPath, "install", "--frozen-lockfile"], toolSite)
    checkAuxInstall(toolSite)
    await command(["node", "scripts/fonts.mjs"])
    if (remote) {
      await releaseHelp(action, environment!, command, childEnv())
      return 0
    }
    if (action === "dev" || action === "author") {
      if (action === "author") {
        await command([process.execPath, "install", "--frozen-lockfile"], editorSite)
        checkAuxInstall(editorSite)
      }
      await preview(true, true, action === "author")
      return 0
    }
    rmSync(join(site, "dist"), { recursive: true, force: true })
    await command([process.execPath, "run", "build"])
    await command([process.execPath, "run", "package"])
    await preview(action === "preview")
    writeFileSync(join(site, ".proof/result.json"), JSON.stringify({ checkedAt: new Date().toISOString(), appFiles: Object.keys(before).length, staticChecks: "passed" }, null, 2))
    return 0
  } finally {
    if (ownedApp?.pid) { try { process.kill(-ownedApp.pid, "SIGTERM") } catch {} }
    const changes = changedPaths(before, appSnapshot())
    if (changes.length) {
      rmSync(join(site, ".proof/result.json"), { force: true })
      throw new Error(`docs: app changed during operation (never automatically restored):\n${changes.join("\n")}`)
    }
    console.log(`docs: ${Object.keys(before).length} app file/dependency fingerprints unchanged`)
  }
}
