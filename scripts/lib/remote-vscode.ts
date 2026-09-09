import { spawnSync } from "node:child_process"

export interface CommandResult { code: number | null; out: string; err?: string; missing?: boolean }
export type ReadCommand = (bin: string, args: string[]) => CommandResult
export const readCommand: ReadCommand = (bin, args) => {
  const p = spawnSync(bin, args, { encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })
  return { code: p.error ? null : p.status, out: p.stdout ?? "", err: p.stderr ?? "", missing: (p.error as NodeJS.ErrnoException)?.code === "ENOENT" }
}
export interface EditorStatus {
  cli: string | null
  state: "absent" | "connected" | "disconnected" | "unknown"
  serviceInstalled: boolean | null
  loggedIn: boolean | null
  name?: string
  reason?: string
}
export function parseEditorStatus(out: string): Omit<EditorStatus, "cli" | "loggedIn"> {
  try {
    // The launcher writes macOS diagnostics to stderr; stdout is the JSON API.
    const v = JSON.parse(out)
    if (typeof v.service_installed !== "boolean") throw new Error()
    if (v.tunnel === null) return { state: "absent", serviceInstalled: v.service_installed }
    const t = v.tunnel
    if (!t || !["Connected", "Disconnected"].includes(t.tunnel)) throw new Error()
    if (t.tunnel === "Connected" && (typeof t.name !== "string" || !t.name || t.has_editor_link === false)) throw new Error()
    return { state: t.tunnel === "Connected" ? "connected" : "disconnected", serviceInstalled: v.service_installed, ...(typeof t.name === "string" ? { name: t.name } : {}) }
  } catch {
    return { state: "unknown", serviceInstalled: null, reason: "VS Code returned an unsupported tunnel status; check its installed version." }
  }
}
export function editorStatus(run: ReadCommand = readCommand): EditorStatus {
  for (const cli of ["code", "code-insiders"]) {
    const status = run(cli, ["tunnel", "status"])
    if (status.missing) continue
    if (status.code !== 0) return { cli, state: "unknown", serviceInstalled: null, loggedIn: null, reason: "VS Code status failed or timed out." }
    const login = run(cli, ["tunnel", "user", "show"])
    const loginText = login.out + (login.err ?? "")
    const loggedIn = login.code === 0 && /logged in with provider/.test(loginText) ? true
      : login.code !== null && /not logged in/.test(loginText) ? false : null
    return { cli, ...parseEditorStatus(status.out), loggedIn }
  }
  return { cli: null, state: "absent", serviceInstalled: null, loggedIn: null, reason: "Install VS Code and enable its code command in PATH, then rerun this command." }
}
