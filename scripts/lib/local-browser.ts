import { resolve } from "node:path"

// Shared by migration, Vite and the browser runner. Never accept an arbitrary
// persistence directory: cleanup must only remove a run owned by this command.
export const LOCAL_BROWSER_ORIGIN = "http://localhost:8788"
export function localBrowserState(runDirectory: string | undefined): string {
  if (!runDirectory || !/^\.playwright\/runs\/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(runDirectory)) {
    throw new Error("Local browser tests require bun run test:e2e or bun run shots (a valid run directory)")
  }
  return resolve(runDirectory, "state")
}
