import { expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'
import { ACTION } from '../../src/domain/vocabularies'
import type { Node } from './lib/ast'
import { EXTERNAL_OPERATIONS, externalOperations, operationsInProgram } from './lib/external-operations'

function discover(source: string) {
  const parsed = parseSync('operations-fixture.ts', source)
  expect(parsed.errors).toEqual([])
  return [...operationsInProgram(parsed.program as unknown as Node, 'operations-fixture.ts')]
}

it('every discovered external operation has a current canonical action mapping', () => {
  expect([...externalOperations()].sort()).toEqual(Object.keys(EXTERNAL_OPERATIONS).sort())
  const actions = new Set<string>(ACTION.map((action) => action.code))
  for (const mapped of Object.values(EXTERNAL_OPERATIONS)) {
    expect(mapped.length).toBeGreaterThan(0)
    for (const action of mapped) expect(actions.has(action), action).toBe(true)
  }
})

it('auth calls are enrolled without treating incidental strings as operations', () => {
  expect(discover(`
    const example = '/api/auth/not-an-operation'
    fetch('/api/auth/get-session')
    call('/api/auth/admin/list-users?limit=50', {})
  `)).toEqual(['auth.get-session', 'auth.admin/list-users'])
})

it('admin mutation variants enroll every static branch', () => {
  expect(discover(`
    const action = useAdminAction()
    action.mutate({ path: banned ? 'unban-user' : 'ban-user' })
    action.mutateAsync({ path: 'create-user' })
    action['mutateAsync']({ path: 'set-role' })
  `)).toEqual(['auth.admin/unban-user', 'auth.admin/ban-user', 'auth.admin/create-user', 'auth.admin/set-role'])
})

it('a dynamic branch cannot silently disappear from the operation inventory', () => {
  expect(() => discover(`
    const action = useAdminAction()
    action.mutate({ path: allowed ? 'ban-user' : unknownPath })
  `)).toThrow('dynamic admin action needs explicit inventory support')
  expect(() => discover(`
    const action = useAdminAction()
    action.mutateAsync(input)
  `)).toThrow('admin action requires a statically auditable path')
})
