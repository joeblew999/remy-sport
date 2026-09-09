import { expect, it } from 'vitest'
import { bunPinProblem, pinnedBun } from '../../scripts/lib/bun-pin'

it('reads the bun pin out of mise.toml, aligned spacing and all', () => {
  expect(pinnedBun('[tools]\nbun  = "1.4.0"\njq   = "1.8.2"\n')).toBe('1.4.0')
  expect(pinnedBun('[tools]\njq = "1.8.2"\n')).toBeNull()
})

it('accepts exactly the pinned Bun and refuses any other, naming both versions', () => {
  const toml = '[tools]\nbun = "1.4.0"\n'
  expect(bunPinProblem(toml, '1.4.0')).toBeNull()
  expect(bunPinProblem(toml, '1.3.14')).toMatch(/Bun 1\.3\.14, and mise\.toml pins 1\.4\.0/)
  expect(bunPinProblem(toml, '1.4.1')).toMatch(/pins 1\.4\.0/)
  expect(bunPinProblem('[tools]\n', '1.4.0')).toMatch(/pins no Bun/)
})
