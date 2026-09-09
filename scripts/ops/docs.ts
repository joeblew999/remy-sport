/** Independent package proof. Never runs the app's installer or deployment. */
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { once } from "node:events"
import { assertPinnedBun } from "../lib/bun-pin"

const root = resolve(import.meta.dirname, "../..")
const site = join(root, "sites/help")

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

async function command(args: string[]) {
  const child = spawn(args[0]!, args.slice(1), { cwd: site, env: childEnv(), stdio: "inherit", detached: true })
  const stop = () => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL") } catch { /* already exited */ } } }
  const timer = setTimeout(stop, 300_000)
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    const [code, signal] = await once(child, "exit")
    if (code !== 0) throw new Error(`docs: ${args.join(" ")} failed (${signal ?? code})`)
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

async function freePort() {
  const server = createServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("docs: no preview port")
  await new Promise<void>((resolveClose, reject) => server.close((err) => err ? reject(err) : resolveClose()))
  return address.port
}

async function preview(interactive: boolean) {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  // Launch the local binary directly so normal cleanup is not reported as a
  // failed package script (Bun prints exit 143 when its preview child is stopped).
  const child = spawn("node", [join(site, "node_modules/wrangler/bin/wrangler.js"), "dev", "--local", "--config", "wrangler.jsonc", "--port", String(port), "--ip", "127.0.0.1"], { cwd: site, env: childEnv(), stdio: "inherit", detached: true })
  const stop = () => { if (child.pid) { try { process.kill(-child.pid, "SIGTERM") } catch { /* already exited */ } } }
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
    for (const [path, expected] of [["/", "Remy Sport help"], ["/sign-in", "Signing in"], ["/following-a-game", "Following a game"], ["/sign-in.md", "Signing in"], ["/llms.txt", "sign-in"], ["/sitemap.xml", "help.remy.invalid"], ["/api/search", "sign-in"]]) {
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

export async function runDocs(args: string[]): Promise<number> {
  const action = args[0] ?? "check"
  if (action === "--help") {
    console.log("bun run ops docs [check|preview|clean]\ncheck installs the independent locked package, builds and verifies locally; preview keeps the verified site open; clean removes only its generated files. No deployment command.")
    return 0
  }
  if (args.length > 1 || !["check", "preview", "clean"].includes(action)) throw new Error("docs: expected check, preview or clean")
  if (assertPinnedBun()) return 1
  if (realpathSync(site) !== site) throw new Error("docs: package directory must not be a symlink")
  if (JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces) throw new Error("docs: recheck isolation before introducing a root workspace")
  const before = appSnapshot()
  try {
    if (action === "clean") {
      for (const name of ["node_modules", "dist", ".source", ".vite", ".proof", ".wrangler"]) rmSync(join(site, name), { recursive: true, force: true })
      return 0
    }
    mkdirSync(join(site, ".proof"), { recursive: true })
    rmSync(join(site, ".proof/result.json"), { force: true })
    if (!existsSync(join(site, "bun.lock"))) throw new Error("docs: committed sites/help/bun.lock is missing; refusing an unlocked install")
    await command([process.execPath, "install", "--frozen-lockfile"])
    checkInstall()
    rmSync(join(site, "dist"), { recursive: true, force: true })
    await command([process.execPath, "run", "build"])
    await command([process.execPath, "run", "package"])
    await preview(action === "preview")
    writeFileSync(join(site, ".proof/result.json"), JSON.stringify({ checkedAt: new Date().toISOString(), appFiles: Object.keys(before).length, staticChecks: "passed" }, null, 2))
    return 0
  } finally {
    const changes = changedPaths(before, appSnapshot())
    if (changes.length) {
      rmSync(join(site, ".proof/result.json"), { force: true })
      throw new Error(`docs: app changed during operation (never automatically restored):\n${changes.join("\n")}`)
    }
    console.log(`docs: ${Object.keys(before).length} app file/dependency fingerprints unchanged`)
  }
}
