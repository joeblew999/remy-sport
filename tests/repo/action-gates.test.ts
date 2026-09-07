import { expect, it } from "vitest"
import { parse, walk, type Node } from "./lib/ast"

/** Completed migrations stay completed; remaining surfaces are listed in the plan. */
const MIGRATED = [
  "src/web/components/schedule.tsx", "src/web/components/moq-video.tsx",
  "src/web/components/event-settings.tsx", "src/web/components/your-players.tsx",
  "src/web/pages/team.tsx", "src/web/pages/live.tsx", "src/web/pages/discover.tsx",
]

it("migrated surfaces render permissions through the shared gate", () => {
  const violations: string[] = []
  for (const file of MIGRATED) walk(parse(file).program, (node) => {
    if (node.type !== "MemberExpression") return
    const object = node.object as Node
    const property = node.property as Node
    const ownsCan = object?.type === "MemberExpression" && (object.property as Node)?.name === "can"
    const isCan = object?.type === "Identifier" && object.name === "can"
    if ((ownsCan || isCan) && (node.computed || /^[A-Z_]+$/.test(String(property?.name)))) violations.push(file)
  })
  expect(violations, "Use Can with the resource whose server answer grants the action").toEqual([])
})
