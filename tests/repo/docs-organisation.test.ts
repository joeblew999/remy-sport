import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect, it } from "vitest"

const docs = resolve(import.meta.dirname, "../../docs")

it("every current document and archived record is linked from its own index", () => {
  for (const folder of [docs, resolve(docs, "done")]) {
    const index = readFileSync(resolve(folder, "README.md"), "utf8")
    const links = [...index.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)].map(match => match[1])
    const files = readdirSync(folder).filter(name => name.endsWith(".md") && name !== "README.md")
    expect(files.filter(name => !links.includes(name)), `Unindexed documents in ${folder}`).toEqual([])
  }
})

it("archived plans explicitly distinguish completion from supersession", () => {
  const archive = resolve(docs, "done")
  for (const name of readdirSync(archive).filter(name => name.endsWith(".md") && name !== "README.md")) {
    const text = readFileSync(resolve(archive, name), "utf8")
    expect(text, name).toMatch(/^Archive: (completed|superseded) \(\d{4}-\d{2}-\d{2}\)\./m)
    expect(text, `${name} must lead readers back to current work`).toContain("(../README.md)")
  }
  for (const name of readdirSync(docs).filter(name => name.endsWith(".md") && name !== "README.md")) {
    expect(readFileSync(resolve(docs, name), "utf8"), `${name} belongs in done/`).not.toMatch(/^Archive: /m)
  }
})
