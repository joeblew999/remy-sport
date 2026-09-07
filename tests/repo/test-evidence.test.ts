import { expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'
import type { Node } from './lib/ast'
import { executableTestTitles } from './lib/test-evidence'

it('disabled suites and chained skipped tests cannot supply behavior evidence', () => {
  const source = `
    test('active', () => {})
    describe('active suite', () => { it('active nested', () => {}) })
    test.describe('browser suite', () => { test('active browser', async () => {}) })
    describe.skip('disabled suite', () => { it('disabled nested', () => {}) })
    test.describe.skip('disabled browser suite', () => { test('disabled browser', () => {}) })
    test.skip.each([1])('disabled parameterized', () => {})
    it['skip']('disabled computed', () => {})
    describe.skipIf(flag)('conditional suite', () => { it('conditional nested', () => {}) })
    test.fixme('unfinished', () => {})
    test.todo('pending')
  `
  const parsed = parseSync('evidence-fixture.ts', source)
  expect(parsed.errors).toEqual([])
  expect([...executableTestTitles(parsed.program as unknown as Node)]).toEqual([
    'active', 'active nested', 'active browser',
  ])
})
