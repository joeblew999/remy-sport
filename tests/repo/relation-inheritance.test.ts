import { expect, it } from "vitest"
import { RELATION } from "../../src/domain/vocabularies"

it("inherited relations name existing parents and cannot form cycles", () => {
  const visit = (code: string, path: string[]) => {
    expect(path, `relation inheritance cycle: ${[...path, code].join(' -> ')}`).not.toContain(code)
    const relation = RELATION.find((r) => r.code === code)
    expect(relation, `unknown parent ${code}`).toBeDefined()
    if (relation?.via === 'parent') {
      expect(relation.sourceTable).toBeTruthy()
      expect(relation.objectColumn).toBeTruthy()
      expect(relation.throughColumn).toBeTruthy()
      visit(relation.parentRelation!, [...path, code])
    }
  }
  RELATION.forEach((r) => visit(r.code, []))
})
