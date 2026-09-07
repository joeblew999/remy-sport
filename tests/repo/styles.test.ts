import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

function undefinedTokens(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const defined = new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]))
  return [...new Set([...text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)]
    .map(match => match[1]!).filter(token => !defined.has(token)))]
}

test("shared CSS tokens resolve or provide a fallback", () => {
  expect(undefinedTokens("a { color: var(--missing); background: var(--optional, red) }"))
    .toEqual(["--missing"])
  expect(undefinedTokens("/* --missing: red */ a { color: var(--missing) }"))
    .toEqual(["--missing"])
  expect(undefinedTokens(readFileSync("src/web/styles.css", "utf8"))).toEqual([])
})
