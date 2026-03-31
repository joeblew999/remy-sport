#!/usr/bin/env bun
/**
 * Generates all derived files from docs/matrix.json.
 *
 * Usage:  mise run matrix:generate
 *         bun scripts/generate-matrix.ts
 *
 * Outputs:
 *   src/auth/access-control.gen.ts — role-permission definitions
 *   src/auth/matrix-data.gen.ts    — typed matrix data for runtime use
 *   docs/user/matrix.gen.md        — human-readable markdown table
 */
import { writeFileSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const MATRIX_PATH = resolve(ROOT, "docs/matrix.json")
const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf-8"))

const PROVENANCE = `docs/matrix.json`
const REGEN_CMD = `mise run matrix:generate`

function header(lang: "ts" | "md") {
  const ts = [
    `// GENERATED from ${PROVENANCE} — do not edit manually.`,
    `// Regenerate: ${REGEN_CMD}`,
    ``,
  ]
  const md = [
    `<!-- GENERATED from ${PROVENANCE} — do not edit manually. -->`,
    `<!-- Regenerate: ${REGEN_CMD} -->`,
    ``,
  ]
  return lang === "ts" ? ts.join("\n") : md.join("\n")
}

// ── 1. src/auth/access-control.gen.ts ────────────────────────────────────────

function generateAccessControl(): string {
  const lines: string[] = [
    header("ts"),
    `import { createAccessControl } from "better-auth/plugins/access"`,
    ``,
  ]

  // Build the createAccessControl call
  const acEntries = Object.entries(matrix.resources).map(
    ([resource, info]: [string, any]) =>
      `  ${resource.padEnd(12)}: ${JSON.stringify(info.actions)},`
  )
  lines.push(`export const ac = createAccessControl({`)
  lines.push(...acEntries)
  lines.push(`})`)
  lines.push(``)

  // Build each role
  for (const role of matrix.roles) {
    const varName = role === "admin" ? "adminRole" : role
    const roleEntries: string[] = []

    for (const [resource, info] of Object.entries(matrix.resources) as [string, any][]) {
      const perms = info.roles[role] || []
      if (perms.length > 0) {
        roleEntries.push(`  ${resource.padEnd(12)}: ${JSON.stringify(perms)},`)
      }
    }

    lines.push(`export const ${varName} = ac.newRole({`)
    lines.push(...roleEntries)
    lines.push(`})`)
    lines.push(``)
  }

  // Build roles object
  lines.push(`export const roles = {`)
  for (const role of matrix.roles) {
    const varName = role === "admin" ? "adminRole" : role
    if (role === "admin") {
      lines.push(`  admin: adminRole,`)
    } else {
      lines.push(`  ${role},`)
    }
  }
  lines.push(`}`)
  lines.push(``)

  return lines.join("\n")
}

// ── 2. src/auth/matrix-data.gen.ts ───────────────────────────────────────────

function generateMatrixData(): string {
  const lines: string[] = [
    header("ts"),
    `/** Typed matrix data from ${PROVENANCE} for runtime use. */`,
    ``,
  ]

  // Resource list
  const resources = Object.keys(matrix.resources)
  lines.push(`export const RESOURCES = ${JSON.stringify(resources)} as const`)
  lines.push(`export type Resource = typeof RESOURCES[number]`)
  lines.push(``)

  // Event type scope map
  lines.push(`/** Which event types each resource applies to. */`)
  lines.push(`export const EVENT_TYPE_SCOPE: Record<Resource, string[]> = {`)
  for (const [resource, info] of Object.entries(matrix.resources) as [string, any][]) {
    lines.push(`  ${resource.padEnd(12)}: ${JSON.stringify(info.eventTypes)},`)
  }
  lines.push(`}`)
  lines.push(``)

  // Route map (action → route)
  lines.push(`/** API routes for each resource:action. */`)
  lines.push(`export const ROUTE_MAP: Record<string, { method: string; path: string }[]> = {`)
  for (const [resource, info] of Object.entries(matrix.resources) as [string, any][]) {
    for (const [action, route] of Object.entries(info.routes) as [string, any][]) {
      const routes = [route]
      // Include additional routes
      if (info.additionalRoutes) {
        for (const ar of info.additionalRoutes) {
          if (ar.action === action) {
            routes.push({ method: ar.method, path: ar.path })
          }
        }
      }
      lines.push(`  "${resource}:${action}": ${JSON.stringify(routes)},`)
    }
  }
  lines.push(`}`)
  lines.push(``)

  // Public read endpoints
  lines.push(`/** Public read endpoints (no auth required). */`)
  lines.push(`export const PUBLIC_READS: { method: string; path: string }[] = [`)
  for (const [, info] of Object.entries(matrix.resources) as [string, any][]) {
    if (info.routes.read) {
      lines.push(`  { method: "${info.routes.read.method}", path: "${info.routes.read.path}" },`)
    }
  }
  // Add match-referees which is a public read but not a matrix resource
  lines.push(`  { method: "GET", path: "/api/match-referees" },`)
  lines.push(`]`)
  lines.push(``)

  return lines.join("\n")
}

// ── 3. docs/user/matrix.gen.md ───────────────────────────────────────────────

function generateMatrixMd(): string {
  const lines: string[] = [
    header("md"),
    `# Access Matrix`,
    ``,
    `Single source of truth for who can do what, across all features and event types.`,
    ``,
    `**Actors:** ${matrix.roles.map((r: string) => `${r.charAt(0).toUpperCase()} = ${r.charAt(0).toUpperCase() + r.slice(1)}`).join(" · ")}`,
    ``,
    `**Event types:** T = Tournament · L = League · K = Camp/Clinic · Sh = Showcase`,
    ``,
    `**Access:** W = writes · R = reads · — = no access`,
    ``,
    `---`,
    ``,
    `## Matrix 1 — Resource × Actor`,
    ``,
  ]

  // Build table header
  const roleHeaders = matrix.roles.map((r: string) => r.charAt(0).toUpperCase())
  lines.push(`| Resource | Action | ${roleHeaders.join(" | ")} |`)
  lines.push(`|---|---|${roleHeaders.map(() => ":---:").join("|")}|`)

  for (const [resource, info] of Object.entries(matrix.resources) as [string, any][]) {
    for (const action of info.actions) {
      const cells = matrix.roles.map((role: string) => {
        const perms: string[] = info.roles[role] || []
        if (perms.includes(action)) {
          return action === "read" ? "R" : "W"
        }
        return "—"
      })
      lines.push(`| ${resource} | ${action} | ${cells.join(" | ")} |`)
    }
  }

  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`## Matrix 2 — Resource × Event Type`)
  lines.push(``)
  lines.push(`| Resource | T | L | K | Sh |`)
  lines.push(`|---|:---:|:---:|:---:|:---:|`)

  const etMap: Record<string, string> = { tournament: "T", league: "L", camp: "K", showcase: "Sh" }

  for (const [resource, info] of Object.entries(matrix.resources) as [string, any][]) {
    const cells = ["tournament", "league", "camp", "showcase"].map(
      (et) => (info.eventTypes.includes(et) ? "x" : "")
    )
    lines.push(`| ${resource} | ${cells.join(" | ")} |`)
  }

  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`*Source: [docs/matrix.json](../matrix.json) · Regenerate: \`${REGEN_CMD}\`*`)
  lines.push(``)

  return lines.join("\n")
}

// ── Run ─────────────────────────────────────────────────────────────────────

const outputs = [
  { path: "src/auth/access-control.gen.ts", content: generateAccessControl() },
  { path: "src/auth/matrix-data.gen.ts", content: generateMatrixData() },
  { path: "docs/user/matrix.gen.md", content: generateMatrixMd() },
]

for (const { path, content } of outputs) {
  const fullPath = resolve(ROOT, path)
  writeFileSync(fullPath, content)
  console.log(`Generated ${path}`)
}

console.log("Done.")
