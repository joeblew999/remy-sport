import { expect, it } from 'vitest'
import { z } from 'zod'
import { domainItems, outputPaths } from './lib/domain-items'
import { evidence, evidenceProblems } from './lib/domain-evidence'

it('new fields cannot pass by regenerating the coverage report', () => {
  const { items } = domainItems()
  expect(evidenceProblems([...items, 'field.player.newProductField'])).toContain('field.player.newProductField: missing evidence classification')
})

it('removing a journey\'s only evidence fails rather than silently downgrading it', () => {
  const ledger = structuredClone(evidence)
  ledger.reviewed['action.EDIT_PLAYER_PROFILE']!.cases = []
  expect(evidenceProblems(domainItems().items, ledger)).toContain('action.EDIT_PLAYER_PROFILE: no behavior evidence')
})

it('stale classifications and deleted named tests fail', () => {
  const ledger = structuredClone(evidence)
  ledger.unreviewed.push('field.deletedEntity.oldField')
  ledger.reviewed['action.EDIT_PLAYER_PROFILE']!.cases[0]!.test = 'deleted behavior case'
  const problems = evidenceProblems(domainItems().items, ledger)
  expect(problems).toContain('field.deletedEntity.oldField: stale evidence classification')
  expect(problems.some((p) => p.includes('missing named test') && p.includes('deleted behavior case'))).toBe(true)
})

it('output coverage distinguishes nested names, array entries and translation records', () => {
  const shape = z.object({ home: z.object({ names: z.record(z.string(), z.string()) }),
    away: z.array(z.object({ names: z.string().nullable() })).optional() })
  expect(outputPaths(shape)).toEqual(['home', 'home.names', 'home.names.*', 'away', 'away[].names'])
})
