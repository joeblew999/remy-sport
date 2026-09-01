/**
 * The dev server: one port, always current, seeded, reachable from a phone.
 *
 *   mise run dev            start it
 *   mise run dev -- stop    stop it and everything it started
 *   mise run dev -- restart both, in order
 *   mise run dev -- ensure  start only if it is not already up
 *   mise run dev -- watch   re-run the fast gate on every save
 *
 * It was fifty-three lines of shell in mise.toml plus twelve more for stopping,
 * and `scripts/dev.ts` was something else entirely — the .dev.vars generator —
 * so the one command a developer runs every day matched no script at all.
 *
 * ## Why three processes
 *
 * `wrangler dev` serves the Worker and the built SPA; `vite build --watch`
 * rebuilds that SPA on save; `cloudflared` publishes it on a fixed HTTPS name.
 * The tunnel is not a luxury: iOS Safari with HTTPS-Only refuses a plain
 * `http://192.168.x.x`, which is the wall this started at, and `tunnel:quick`
 * mints a random name per run so a link dies the moment the server restarts.
 *
 * Every child is killed on the way out — normal exit, Ctrl-C, or SIGTERM.
 * Orphaned watchers are how two vite processes end up writing `dist/web`, which
 * is a race with a whole e2e suite behind it.
 */

import { DEV_ORIGIN, DEV_PORT } from "../src/environment"
import { local } from "./lib/prepare"

import { existsSync, appendFileSync, readFileSync, mkdirSync, openSync } from "fs"

const PORT = DEV_PORT
const LOCAL = DEV_ORIGIN
const HOSTNAME = process.env.TUNNEL_HOSTNAME ?? ""

/** The LAN address, so a phone on the same wifi can reach this. */
function lanAddress(): string | null {
  for (const iface of ["en0", "en1"]) {
    const got = Bun.spawnSync(["ipconfig", "getifaddr", iface], { stdout: "pipe", stderr: "ignore" })
    const ip = got.stdout.toString().trim()
    if (ip) return ip
  }
  return null
}

/**
 * The tunnel's run token, from the environment or fnox, creating the tunnel
 * first if it does not exist yet.
 *
 * Absent is fine and common: a machine with no Cloudflare token gets a local
 * server and a LAN address, and is told what it is missing rather than failing.
 */
function tunnelToken(): string | null {
  const fromEnv = process.env.TUNNEL_RUN_TOKEN?.trim()
  if (fromEnv) return fromEnv
  const read = () => {
    const got = Bun.spawnSync(["fnox", "get", "TUNNEL_RUN_TOKEN"], { stdout: "pipe", stderr: "ignore" })
    return got.exitCode === 0 ? got.stdout.toString().trim() || null : null
  }
  const stored = read()
  if (stored) return stored
  const made = Bun.spawnSync(["bun", "scripts/ops/tunnel.ts"], { stdout: "ignore", stderr: "ignore" })
  return made.exitCode === 0 ? read() : null
}

/**
 * Processes this checkout started, matched by command and scoped by working
 * directory.
 *
 * Scoped because the config paths are relative, so a bare pattern matches any
 * checkout of this repo on the machine — the same reason `web:build` scopes its
 * watcher check by `lsof` cwd.
 */
const PATTERNS = [
  "wrangler dev",
  "vite build --config src/web/vite.config.ts --watch",
  "cloudflared tunnel run",
]

function ours(): number[] {
  const root = process.cwd()
  const pids: number[] = []
  for (const pattern of PATTERNS) {
    const found = Bun.spawnSync(["pgrep", "-f", pattern], { stdout: "pipe", stderr: "ignore" })
    for (const line of found.stdout.toString().split("\n")) {
      const pid = Number(line.trim())
      if (!pid) continue
      const cwd = Bun.spawnSync(["lsof", "-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
        stdout: "pipe",
        stderr: "ignore",
      })
        .stdout.toString()
        .split("\n")
        .find((l) => l.startsWith("n"))
        ?.slice(1)
      if (cwd && (cwd === root || cwd.startsWith(root + "/"))) pids.push(pid)
    }
  }
  return pids
}

function stop(): void {
  const pids = ours()
  for (const pid of pids) {
    try {
      process.kill(pid)
    } catch {
      // Already gone between pgrep and here, which is the desired state anyway.
    }
  }
  console.log(pids.length ? `dev: stopped ${pids.length} process(es)` : "dev: nothing running here")
}

async function reachable(): Promise<boolean> {
  return fetch(`${LOCAL}/api/health`, { signal: AbortSignal.timeout(1_000) })
    .then((r) => r.ok)
    .catch(() => false)
}

/**
 * Starting the server, and this function IS the order.
 *
 * It was sixty lines of spawning and polling with the sequence described in a
 * comment above it — the one form nothing can check. The detail moved into the
 * named steps below; what is left reads top to bottom as what happens.
 */
/**
 * The sequence, as data, so `mise run dev -- --order` prints exactly what runs.
 * Each line says why it is where it is; nearly all of them are "the next step
 * needs what this one produced".
 */
const START: Array<{ name: string; why: string }> = [
  { name: "prepare", why: "deps, bundle, schema, fixtures — `bun scripts/lib/prepare.ts --order`" },
  { name: "tunnel", why: "before the server: the Worker reads TUNNEL_HOSTNAME from .dev.vars at boot" },
  { name: "watcher", why: "vite rebuilds dist/web on every save" },
  { name: "server", why: "wrangler serves the Worker and that bundle on :8787" },
  { name: "wait", why: "poll /api/health — nothing below works until it answers" },
  { name: "seed", why: "POST /api/seed, which needs the server from the step above" },
  { name: "announce", why: "the three URLs, once there is something behind them" },
]

async function start(): Promise<void> {
  const kids: { kill: () => void }[] = []
  reapOnExit(kids)

  local()
  const ip = lanAddress()
  const tunnel = startTunnel(kids)
  startWatcher(kids)
  const server = startServer(kids, ip)
  await untilReachable()
  await seedLocal()
  announce(ip, tunnel)

  await server.exited
}

/** Kill every child on the way out — a stray watcher is a second writer of dist/web. */
function reapOnExit(kids: { kill: () => void }[]): void {
  const reap = () => {
    for (const c of kids) {
      try {
        c.kill()
      } catch {
        /* already gone */
      }
    }
  }
  process.on("exit", reap)
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      reap()
      process.exit(signal === "SIGINT" ? 130 : 143)
    })
  }
}

/**
 * Step 2, and it must precede the server: the Worker reads TUNNEL_HOSTNAME from
 * .dev.vars at boot to trust that origin, and will not pick it up afterwards —
 * it would serve the tunnel and refuse its own sign-in.
 */
function startTunnel(kids: { kill: () => void }[]): boolean {
  const token = tunnelToken()
  if (!token) {
    console.log("  (no tunnel — needs CLOUDFLARE_API_TOKEN with Cloudflare Tunnel:Edit)")
    return false
  }
  const vars = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf-8") : ""
  if (!/^TUNNEL_HOSTNAME=/m.test(vars)) appendFileSync(".dev.vars", `TUNNEL_HOSTNAME=${HOSTNAME}\n`)
  kids.push(Bun.spawn(["cloudflared", "tunnel", "run", "--token", token], { stdout: "ignore", stderr: "ignore" }))
  return true
}

function startWatcher(kids: { kill: () => void }[]): void {
  kids.push(
    Bun.spawn(["bun", "x", "vite", "build", "--config", "src/web/vite.config.ts", "--watch", "--logLevel", "warn"], {
      stdout: "inherit",
      stderr: "inherit",
    }),
  )
}

/**
 * `--host` is explicit and must stay so: without it wrangler simulates the
 * production [[routes]] custom domain locally. check-conventions enforces it.
 */
function startServer(kids: { kill: () => void }[], ip: string | null) {
  const server = Bun.spawn(
    ["bun", "x", "wrangler", "dev", "--ip", "0.0.0.0", "--host", ip ?? "localhost", "--port", String(PORT)],
    { stdout: "inherit", stderr: "inherit" },
  )
  kids.push(server)
  return server
}

async function untilReachable(): Promise<void> {
  for (let i = 0; i < 40 && !(await reachable()); i++) await Bun.sleep(1_000)
}

async function seedLocal(): Promise<void> {
  const ok = await fetch(`${LOCAL}/api/seed`, { method: "POST" })
    .then((r) => r.ok)
    .catch(() => false)
  console.log(ok ? "  seeded" : "  seed failed")
}

function announce(ip: string | null, tunnel: boolean): void {
  console.log(`\n  http://localhost:${PORT}            this machine`)
  if (ip) console.log(`  http://${ip}:${PORT}      same wifi`)
  console.log(
    tunnel
      ? `  https://${HOSTNAME}   fixed URL, works anywhere`
      : "  (no tunnel — 'mise run ops tunnel' once for a fixed public URL)",
  )
  console.log(`  #/login                          twelve seeded people, one click`)
  console.log(`  rebuilds on save — reload to see changes\n`)
}

/**
 * Up, starting it only if it is not already.
 *
 * Idempotent, and the reason nothing should ever `pkill`: starting things by
 * hand is what produced a day of measuring stale bundles — a half-replaced
 * server, or two racing for the port, and the thing on screen was not the thing
 * on disk. Detached with its output in .wrangler/dev.log so a caller that only
 * needs a server can carry on.
 */
async function ensure(): Promise<void> {
  if (await reachable()) return console.log(`dev: already serving on ${LOCAL}`)
  console.log("dev: starting...")
  mkdirSync(".wrangler", { recursive: true })
  // A real file descriptor: Bun.spawn takes an fd for stdio, and the detached
  // child outlives this process, so a writer owned by it would not survive.
  const log = openSync(".wrangler/dev.log", "a")
  Bun.spawn(["bun", "scripts/dev.ts", "start"], { stdout: log, stderr: log, stdin: "ignore" }).unref()
  for (let i = 0; i < 120; i++) {
    if (await reachable()) return console.log(`dev: serving on ${LOCAL}`)
    await Bun.sleep(500)
  }
  console.error("dev: never became reachable — see .wrangler/dev.log")
  process.exit(1)
}

const [action = "start"] = process.argv.slice(2)

if (process.argv.includes("--order")) {
  console.log("\nmise run dev\n")
  START.forEach((s, i) => console.log(`  ${i + 1}. ${s.name.padEnd(9)} ${s.why}`))
  console.log("")
  process.exit(0)
}

if (action === "stop") {
  stop()
} else if (action === "restart") {
  stop()
  // Wait for the port to actually free before rebinding it.
  for (let i = 0; i < 20 && (await reachable()); i++) await Bun.sleep(250)
  await start()
} else if (action === "watch") {
  // The fast gate on every save. The point is the seconds, not the watching: a
  // check you have to ask for gets run at the end of a change.
  Bun.spawnSync(["bun", "scripts/lib/watch.ts"], { stdout: "inherit", stderr: "inherit" })
} else if (action === "ensure") {
  await ensure()
} else if (action === "start") {
  await start()
} else {
  console.error(`dev: unknown action "${action}" — start | stop | restart | ensure | watch`)
  process.exit(1)
}
