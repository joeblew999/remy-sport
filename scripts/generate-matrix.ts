#!/usr/bin/env bun
/**
 * Generates all derived files from docs/matrix.json.
 *
 * Usage:  mise run matrix:generate
 *         bun scripts/generate-matrix.ts
 *
 * Outputs:
 *   src/auth/access-control.gen.ts — role-permission definitions (implemented only)
 *   src/auth/matrix-data.gen.ts    — typed matrix data for runtime use
 *   docs/user/matrix.gen.md        — human-readable matrix + gap report
 */
import { writeFileSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const MATRIX_PATH = resolve(ROOT, "docs/matrix.json")
const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf-8"))

const PROVENANCE = `docs/matrix.json`
const REGEN_CMD = `mise run matrix:generate`

type Status = "implemented" | "planned" | "not_started"

/** Filter resources by status. */
function resourcesByStatus(...statuses: Status[]) {
  return Object.entries(matrix.resources).filter(
    ([, info]: [string, any]) => statuses.includes(info.status)
  ) as [string, any][]
}

const implemented = resourcesByStatus("implemented")
const allResources = Object.entries(matrix.resources) as [string, any][]

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
// Only includes IMPLEMENTED resources — these are the live permission checks.

function generateAccessControl(): string {
  const lines: string[] = [
    header("ts"),
    `import { createAccessControl } from "better-auth/plugins/access"`,
    ``,
  ]

  // Build the createAccessControl call (implemented only)
  const acEntries = implemented.map(
    ([resource, info]) => {
      const key = resource.includes("-") ? JSON.stringify(resource) : resource.padEnd(12)
      return `  ${key}: ${JSON.stringify(info.actions)},`
    }
  )
  lines.push(`export const ac = createAccessControl({`)
  lines.push(...acEntries)
  lines.push(`})`)
  lines.push(``)

  // Build each role (implemented only)
  for (const role of matrix.roles) {
    const varName = role === "admin" ? "adminRole" : role
    const roleEntries: string[] = []

    for (const [resource, info] of implemented) {
      const perms = info.roles[role] || []
      if (perms.length > 0) {
        const key = resource.includes("-") ? JSON.stringify(resource) : resource.padEnd(12)
        roleEntries.push(`  ${key}: ${JSON.stringify(perms)},`)
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
// Exports implemented resources for runtime + full status map for dashboards.

function generateMatrixData(): string {
  const lines: string[] = [
    header("ts"),
    `/** Typed matrix data from ${PROVENANCE} for runtime use. */`,
    ``,
  ]

  // Implemented resource list (used by permissions endpoint, tests)
  const implNames = implemented.map(([r]) => r)
  lines.push(`export const RESOURCES = ${JSON.stringify(implNames)} as const`)
  lines.push(`export type Resource = typeof RESOURCES[number]`)
  lines.push(``)

  // Event type scope map (implemented only)
  lines.push(`/** Which event types each resource applies to. */`)
  lines.push(`export const EVENT_TYPE_SCOPE: Record<Resource, string[]> = {`)
  for (const [resource, info] of implemented) {
    lines.push(`  ${JSON.stringify(resource)}: ${JSON.stringify(info.eventTypes)},`)
  }
  lines.push(`}`)
  lines.push(``)

  // Route map (implemented only)
  lines.push(`/** API routes for each resource:action. */`)
  lines.push(`export const ROUTE_MAP: Record<string, { method: string; path: string }[]> = {`)
  for (const [resource, info] of implemented) {
    for (const [action, route] of Object.entries(info.routes) as [string, any][]) {
      const routes = [route]
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

  // Public read endpoints (implemented only, where publicRead is true)
  lines.push(`/** Public read endpoints (no auth required). */`)
  lines.push(`export const PUBLIC_READS: { method: string; path: string }[] = [`)
  for (const [, info] of implemented) {
    if (info.publicRead && info.routes.read) {
      lines.push(`  { method: "${info.routes.read.method}", path: "${info.routes.read.path}" },`)
    }
  }
  lines.push(`  { method: "GET", path: "/api/match-referees" },`)
  lines.push(`]`)
  lines.push(``)

  // Full status map (all resources — for dashboard gap reporting)
  lines.push(`/** Implementation status for all resources (including planned/not_started). */`)
  lines.push(`export type ResourceStatus = "implemented" | "planned" | "not_started"`)
  lines.push(`export const RESOURCE_STATUS: Record<string, { status: ResourceStatus; group: string; designFeatures: string[] }> = {`)
  for (const [resource, info] of allResources) {
    lines.push(`  ${JSON.stringify(resource)}: { status: ${JSON.stringify(info.status)}, group: ${JSON.stringify(info.group)}, designFeatures: ${JSON.stringify(info.designFeatures)} },`)
  }
  lines.push(`}`)
  lines.push(``)

  return lines.join("\n")
}

// ── 3. docs/user/matrix.gen.md ───────────────────────────────────────────────
// Shows implemented matrix tables + gap report.

function generateMatrixMd(): string {
  const lines: string[] = [
    header("md"),
    `# Access Matrix (Generated)`,
    ``,
    `Implementation status generated from [docs/matrix.json](../matrix.json).`,
    `Compare with the [design doc](matrix.md) to see the full vision.`,
    ``,
    `**Actors:** ${matrix.roles.map((r: string) => `${r.charAt(0).toUpperCase()} = ${r.charAt(0).toUpperCase() + r.slice(1)}`).join(" · ")}`,
    ``,
    `**Event types:** T = Tournament · L = League · K = Camp/Clinic · Sh = Showcase`,
    ``,
    `**Access:** W = writes · R = reads · — = no access`,
    ``,
  ]

  // ── Gap Report ──────────────────────────────────────────────────────────
  const implCount = implemented.length
  const plannedCount = resourcesByStatus("planned").length
  const notStartedCount = resourcesByStatus("not_started").length
  const totalCount = allResources.length

  lines.push(`---`)
  lines.push(``)
  lines.push(`## Implementation Status`)
  lines.push(``)
  lines.push(`| Status | Count | Resources |`)
  lines.push(`|---|---|---|`)

  for (const [status, label] of [["implemented", "Implemented"], ["planned", "Planned"], ["not_started", "Not Started"]] as const) {
    const resources = resourcesByStatus(status as Status)
    const names = resources.map(([r]) => r).join(", ")
    lines.push(`| ${label} | ${resources.length}/${totalCount} | ${names || "—"} |`)
  }

  lines.push(``)

  // Progress bar (text-based)
  const pct = Math.round((implCount / totalCount) * 100)
  lines.push(`**Progress: ${implCount}/${totalCount} resources implemented (${pct}%)**`)
  lines.push(``)

  // Group breakdown
  const groups = [...new Set(allResources.map(([, info]) => info.group))] as string[]
  lines.push(`### By Feature Group`)
  lines.push(``)
  lines.push(`| Group | Implemented | Planned | Not Started |`)
  lines.push(`|---|---|---|---|`)

  for (const group of groups) {
    const inGroup = allResources.filter(([, info]) => info.group === group)
    const impl = inGroup.filter(([, info]) => info.status === "implemented").map(([r]) => r)
    const plan = inGroup.filter(([, info]) => info.status === "planned").map(([r]) => r)
    const notS = inGroup.filter(([, info]) => info.status === "not_started").map(([r]) => r)
    lines.push(`| ${group} | ${impl.join(", ") || "—"} | ${plan.join(", ") || "—"} | ${notS.join(", ") || "—"} |`)
  }

  lines.push(``)

  // ── Implemented Matrix ──────────────────────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`## Matrix 1 — Implemented Resource × Actor`)
  lines.push(``)

  const roleHeaders = matrix.roles.map((r: string) => r.charAt(0).toUpperCase())
  lines.push(`| Resource | Action | ${roleHeaders.join(" | ")} |`)
  lines.push(`|---|---|${roleHeaders.map(() => ":---:").join("|")}|`)

  for (const [resource, info] of implemented) {
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
  lines.push(`## Matrix 2 — Implemented Resource × Event Type`)
  lines.push(``)
  lines.push(`| Resource | T | L | K | Sh |`)
  lines.push(`|---|:---:|:---:|:---:|:---:|`)

  for (const [resource, info] of implemented) {
    const cells = ["tournament", "league", "camp", "showcase"].map(
      (et) => (info.eventTypes.includes(et) ? "x" : "")
    )
    lines.push(`| ${resource} | ${cells.join(" | ")} |`)
  }

  // ── Planned / Not Started ───────────────────────────────────────────────
  const upcoming = resourcesByStatus("planned", "not_started")
  if (upcoming.length > 0) {
    lines.push(``)
    lines.push(`---`)
    lines.push(``)
    lines.push(`## Planned & Not Started Resources`)
    lines.push(``)
    lines.push(`| Resource | Status | Group | Design Features | Event Types |`)
    lines.push(`|---|---|---|---|---|`)

    for (const [resource, info] of upcoming) {
      const statusBadge = info.status === "planned" ? "Planned" : "Not Started"
      const features = info.designFeatures.join(", ")
      const etypes = info.eventTypes.map((et: string) => {
        const map: Record<string, string> = { tournament: "T", league: "L", camp: "K", showcase: "Sh" }
        return map[et] || et
      }).join(", ")
      lines.push(`| ${resource} | ${statusBadge} | ${info.group} | ${features} | ${etypes} |`)
    }
  }

  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`*Source: [docs/matrix.json](../matrix.json) · Design: [matrix.md](matrix.md) · Regenerate: \`${REGEN_CMD}\`*`)
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

// Print summary
const implCount = implemented.length
const totalCount = allResources.length
const pct = Math.round((implCount / totalCount) * 100)
console.log(`\nStatus: ${implCount}/${totalCount} resources implemented (${pct}%)`)
console.log(`Done.`)
