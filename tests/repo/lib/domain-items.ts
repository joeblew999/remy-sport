import { is, getTableColumns, getTableName } from 'drizzle-orm'
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'
import * as schema from '../../../src/db/schema'
import { router } from '../../../src/api/index'
import { policyOf } from '../../../src/api/base'
import { ACTION } from '../../../src/domain/vocabularies'

type Node = Record<string, unknown>

/** Qualified output paths preserve nesting, arrays and record values. */
export function outputPaths(schema: unknown, prefix = '', ancestors: unknown[] = []): string[] {
  if (!schema || typeof schema !== 'object') return []
  if (ancestors.includes(schema)) throw new Error(`Recursive output schema needs an explicit coverage policy: ${prefix}`)
  const node = schema as Node
  const def = (node._def ?? node.def) as Node | undefined
  if (!def) throw new Error(`Unrecognized output schema: ${prefix}`)
  const next = [...ancestors, schema]
  const shape = typeof def.shape === 'function' ? def.shape() as Node : def.shape as Node | undefined
  if (shape) return Object.entries(shape).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return [path, ...outputPaths(value, path, next)]
  })
  if (def.element) return outputPaths(def.element, `${prefix}[]`, next)
  if (def.innerType) return outputPaths(def.innerType, prefix, next)
  if (def.valueType) return [`${prefix}.*`, ...outputPaths(def.valueType, `${prefix}.*`, next)]
  if (Array.isArray(def.options)) return [...new Set(def.options.flatMap((v) => outputPaths(v, prefix, next)))]
  return []
}

export function domainItems() {
  const items = new Set(ACTION.map((a) => `action.${a.code}`))
  const operations = new Map<string, Set<string>>()
  const procedures = new Set<string>()
  for (const [name, table] of Object.entries(schema)) {
    if (!is(table, SQLiteTable)) continue
    for (const field of Object.keys(getTableColumns(table))) items.add(`field.${name}.${field}`)
    for (const fk of getTableConfig(table).foreignKeys) {
      const ref = fk.reference()
      items.add(`relationship.${name}.(${ref.columns.map((c) => c.name).join(',')})->${getTableName(ref.foreignTable)}.(${ref.foreignColumns.map((c) => c.name).join(',')})`)
    }
  }
  const walk = (node: Node, path: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== 'object') continue
      const proc = (value as Node)['~orpc'] as Node | undefined
      if (!proc?.handler) { walk(value as Node, [...path, key]); continue }
      const name = [...path, key].join('.')
      procedures.add(name)
      items.add(`procedure.${name}`)
      for (const field of outputPaths(proc.outputSchema)) items.add(`output.${name}.${field}`)
      for (const middleware of (proc.middlewares ?? []) as unknown[]) {
        const policy = policyOf(middleware)
        const actions = policy?.kind === 'handler' ? policy.actions : policy && 'action' in policy ? [policy.action] : []
        for (const action of actions) {
          const paths = operations.get(action) ?? new Set<string>()
          paths.add(name); operations.set(action, paths)
        }
      }
    }
  }
  walk(router as unknown as Node, [])
  return { items: [...items].sort(), operations, procedures }
}
