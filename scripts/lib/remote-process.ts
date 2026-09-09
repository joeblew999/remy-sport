import { spawn, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"

export interface ManagedProcess {
  done: Promise<number>
  stop(): Promise<void>
}
/**
 * An IPC guardian owns each process group. If the supervisor is SIGKILLed,
 * disconnect still reaches the guardian, which terminates only its own group.
 * No saved PIDs, provider tokens in files, or machine-wide tunnel kill commands.
 */
export function managedProcess(bin: string, args: string[], options: { env?: NodeJS.ProcessEnv; interactive?: boolean } = {}): ManagedProcess {
  const guardian = spawn(process.execPath, [fileURLToPath(import.meta.url), "--guard"], {
    stdio: [options.interactive ? "inherit" : "ignore", "inherit", "inherit", "ipc"],
  })
  const done = new Promise<number>((resolve, reject) => {
    guardian.once("error", reject)
    guardian.once("exit", code => resolve(code ?? 1))
  })
  guardian.send({ bin, args, env: options.env ?? process.env, interactive: !!options.interactive })
  return {
    done,
    async stop() {
      if (guardian.connected) guardian.send({ stop: true })
      await done
    },
  }
}

async function guard(): Promise<void> {
  let child: ChildProcess | undefined
  let stopping = false
  let initialized = false
  let killTimer: ReturnType<typeof setTimeout> | undefined
  const signalGroup = (signal: NodeJS.Signals) => {
    if (!child?.pid) return
    try { process.kill(-child.pid, signal) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") process.exitCode = 1
    }
  }
  const stop = () => {
    if (stopping) return
    stopping = true
    if (!child) { process.exit(0); return }
    signalGroup("SIGTERM")
    killTimer = setTimeout(() => signalGroup("SIGKILL"), 5000)
  }
  process.on("disconnect", stop)
  process.on("SIGTERM", stop)
  process.on("SIGINT", stop)
  process.on("message", (message: unknown) => {
    const m = message as { stop?: boolean; bin: string; args: string[]; env: NodeJS.ProcessEnv; interactive: boolean }
    if (m.stop) { stop(); return }
    if (initialized || stopping) return
    initialized = true
    child = spawn(m.bin, m.args, { detached: true, stdio: [m.interactive ? "inherit" : "ignore", "inherit", "inherit"], env: m.env })
    child.once("error", () => { console.error(`remote: could not start ${m.bin}`); process.exit(1) })
    child.once("exit", code => {
      // Kill descendants before releasing the group, even if its leader failed.
      signalGroup("SIGKILL")
      if (killTimer) clearTimeout(killTimer)
      process.exit(stopping ? 0 : (code ?? 1))
    })
  })
  // A parent that dies before the first message must not leave a guardian.
  if (!process.connected) stop()
}
if (process.argv[2] === "--guard") void guard()
