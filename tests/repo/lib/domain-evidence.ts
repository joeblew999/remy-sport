import { existsSync, readFileSync } from 'node:fs'
import ledger from './domain-evidence.json'
import { domainItems } from './domain-items'

export interface Evidence {
  intent: 'display' | 'edit' | 'derived' | 'internal' | 'implementation_pending'
  reason: string
  surfaces: string[]
  operations: string[]
  audience: string[]
  cases: { file: string; test: string; level: 'render' | 'worker' | 'persistence'; result: string }[]
}
export interface Ledger { unreviewed: string[]; reviewed: Record<string, Evidence> }
export const evidence: Ledger = ledger as Ledger

/** Enrollment is separate from report regeneration; additions cannot auto-pass. */
export function evidenceProblems(items: readonly string[], ledger: Ledger = evidence): string[] {
  const problems: string[] = []
  const { procedures } = domainItems()
  const known = new Set(items)
  const enrolled = [...ledger.unreviewed, ...Object.keys(ledger.reviewed)]
  const seen = new Set<string>()
  for (const item of enrolled) {
    if (seen.has(item)) problems.push(`${item}: duplicate evidence classification`)
    seen.add(item)
    if (!known.has(item)) problems.push(`${item}: stale evidence classification`)
  }
  for (const item of items) if (!seen.has(item)) problems.push(`${item}: missing evidence classification`)
  for (const [item, row] of Object.entries(ledger.reviewed)) {
    if (!['display', 'edit', 'derived', 'internal', 'implementation_pending'].includes(row.intent)) problems.push(`${item}: unknown intent`)
    for (const operation of row.operations) if (!procedures.has(operation)) problems.push(`${item}: unknown procedure ${operation}`)
    if (!row.reason.trim() || !row.audience.length) problems.push(`${item}: explain intent and viewers`)
    if (!['internal', 'implementation_pending'].includes(row.intent) && !row.cases.length) problems.push(`${item}: no behavior evidence`)
    for (const file of row.surfaces) if (!existsSync(file)) problems.push(`${item}: missing surface ${file}`)
    for (const test of row.cases) {
      if (!test.result.trim() || !test.test.trim()) problems.push(`${item}: incomplete test evidence`)
      if (!existsSync(test.file) || !readFileSync(test.file, 'utf8').includes(test.test)) problems.push(`${item}: missing named test ${test.file}: ${test.test}`)
    }
  }
  return problems
}
