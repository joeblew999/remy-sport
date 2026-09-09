import { setTimeout as delay } from "node:timers/promises"
import { managedProcess, type ManagedProcess } from "./remote-process.ts"

export class RemoteSession {
  readonly abort = new AbortController()
  phase = "checking"
  readonly owned = new Map<string, ManagedProcess>()
  private closing = false
  private failure: Error | undefined
  stop = () => this.abort.abort()

  async launch(label: string, bin: string, args: string[], options: { env?: NodeJS.ProcessEnv; interactive?: boolean } = {}): Promise<void> {
    this.abort.signal.throwIfAborted()
    const child = managedProcess(bin, args, options)
    this.owned.set(label, child)
    child.done.then(code => {
      if (!this.closing) {
        this.failure = new Error(`${label} exited (${code}). Remote services are no longer ready.`)
        this.abort.abort()
      }
    }, () => { this.failure = new Error(`${label} could not start.`); this.abort.abort() })
  }
  async once(bin: string, args: string[], interactive = false): Promise<void> {
    this.abort.signal.throwIfAborted()
    const child = managedProcess(bin, args, { interactive })
    this.owned.set("preparation", child)
    try {
      const code = await Promise.race([child.done, this.untilStopped()])
      this.abort.signal.throwIfAborted()
      if (code !== 0) throw new Error(`${bin} ${args.join(" ")} failed (${code}); fix the reported prerequisite and rerun the same remote command.`)
    } finally {
      await child.stop()
      this.owned.delete("preparation")
    }
  }
  async waitFor(label: string, check: () => Promise<boolean>, timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      this.abort.signal.throwIfAborted()
      if (await check()) return
      await delay(1000, undefined, { signal: this.abort.signal })
    }
    throw new Error(`Timed out waiting for ${label}. Run bun run ops remote status to inspect it.`)
  }
  untilStopped(): Promise<void> {
    if (this.abort.signal.aborted) return Promise.resolve()
    return new Promise(resolve => this.abort.signal.addEventListener("abort", () => resolve(), { once: true }))
  }
  async pause(ms: number): Promise<void> {
    try { await delay(ms, undefined, { signal: this.abort.signal }) }
    catch (error) { if (!this.abort.signal.aborted) throw error }
  }
  async close(): Promise<void> {
    this.closing = true
    this.phase = "stopping"
    this.abort.abort()
    const results = await Promise.allSettled([...this.owned.values()].reverse().map(child => child.stop()))
    this.owned.clear()
    if (results.some(r => r.status === "rejected")) throw new Error("An owned process could not be cleaned up.")
  }
  get error(): Error | undefined { return this.failure }
}
