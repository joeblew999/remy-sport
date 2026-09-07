import { expect, it } from 'vitest'
import { withMoqPermission } from '../../scripts/lib/moq-permission'

it('adds MoQ only to the exact account and preserves every existing restriction and policy', () => {
  const input = { name: 'dev', status: 'active', expires_on: '2026-10-01T00:00:00Z',
    not_before: '2026-09-01T00:00:00Z', condition: { request_ip: { in: ['192.0.2.0/24'] } },
    policies: [
      { id: 'zone', effect: 'allow' as const, resources: { 'com.cloudflare.api.account.zone.*': '*' }, permission_groups: [{ id: 'dns' }] },
      { id: 'account', effect: 'allow' as const, resources: { 'com.cloudflare.api.account.target': '*' }, permission_groups: [{ id: 'workers', name: 'Workers Write' }] },
    ] }
  const before = structuredClone(input)
  const output = withMoqPermission(input, 'target')
  expect(input).toEqual(before)
  expect(output.policies[1]!.permission_groups.at(-1)!.id).toBe('2f912625599b434a8df3e4e02d64c7b4')
  expect(withMoqPermission(output, 'target')).toEqual(output)
  output.policies[1]!.permission_groups.pop()
  expect(output).toEqual(before)
})

it('refuses wildcard, multi-account and denied policies instead of broadening access', () => {
  for (const policy of [
    { effect: 'allow' as const, resources: { 'com.cloudflare.api.account.*': '*' } },
    { effect: 'allow' as const, resources: { 'com.cloudflare.api.account.target': '*', 'com.cloudflare.api.account.other': '*' } },
    { effect: 'deny' as const, resources: { 'com.cloudflare.api.account.target': '*' } },
  ]) {
    expect(() => withMoqPermission({ name: 'dev', policies: [{ id: 'p', permission_groups: [], ...policy }] }, 'target')).toThrow('exact account')
  }
})
