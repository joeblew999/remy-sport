import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { parseSync } from "oxc-parser"

/**
 * Reading the tree's syntax, for the rules that are about syntax.
 *
 * Two of this repo's rules are AST questions — no user-visible string may be
 * written directly into the UI, and no layer may import a layer above it. They
 * were an ESLint config and a dependency-cruiser config, three packages and two
 * root files between them, and both of those tools reach the syntax through the
 * TypeScript JavaScript compiler API, which TypeScript 7 no longer ships. That
 * made two eight-rule checks the thing pinning the whole repo to TypeScript 6.
 *
 * oxc is the parser Vite 8 already builds on and knip already parses with, so
 * this adds no toolchain — it uses the one that is here. It produces an ESTree
 * tree: `JSXText`, `JSXExpressionContainer`, `JSXAttribute`, `Literal`,
 * `ImportDeclaration` with `importKind`, which is every node those rules name.
 *
 * What is NOT here is a lint framework. There is no rule registry, no severity,
 * no autofix and no plugin API, because there are eight rules and they are
 * ordinary code: walk, collect, assert. A framework would be more of this repo's
 * behaviour hidden inside a dependency, which is the thing being undone.
 */

export const ROOT = resolve(import.meta.dirname, "../../..")

/** An ESTree node, as much of one as a walk needs to know. */
export interface Node {
  type: string
  [key: string]: unknown
}

/** Every .ts/.tsx under `dir`, repo-relative, generated trees excluded. */
export function sources(dir: string, skip: readonly string[] = ["paraglide"]): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      if (skip.includes(entry.name)) continue
      const path = `${rel}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(path)
    }
  }
  walk(dir)
  return out.sort()
}

export interface Parsed {
  /** Repo-relative path. */
  path: string
  source: string
  program: Node
}

export function parse(path: string, source = readFileSync(join(ROOT, path), "utf8")): Parsed {
  const parsed = parseSync(path, source, { sourceType: "module" })
  // A parse error means the walk below is looking at a partial tree, and a rule
  // that silently checked half a file would be worse than one that did not run.
  // `tsc` is the real syntax gate; this only has to refuse to guess.
  if (parsed.errors.length) {
    throw new Error(`${path}: ${parsed.errors[0]?.message ?? "could not be parsed"}`)
  }
  return { path, source, program: parsed.program as unknown as Node }
}

/**
 * Every node, with the chain of nodes above it — nearest parent first.
 *
 * Parents rather than a parent pointer: the rules ask about ancestry ("a
 * literal in a rendered position, but not inside an attribute"), and the
 * selectors they came from were written in those terms.
 */
export function walk(program: Node, visit: (node: Node, ancestors: readonly Node[]) => void): void {
  const stack: Node[] = []
  const step = (value: unknown): void => {
    if (!value || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const child of value) step(child)
      return
    }
    const node = value as Node
    const isNode = typeof node.type === "string"
    if (isNode) {
      visit(node, stack)
      stack.unshift(node)
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "type") continue
      step(child)
    }
    if (isNode) stack.shift()
  }
  step(program)
}

/** The 1-based line a node starts on, for a message somebody has to act on. */
export function lineOf(parsed: Parsed, node: Node): number {
  const start = typeof node.start === "number" ? node.start : 0
  let line = 1
  for (let i = 0; i < start && i < parsed.source.length; i++) {
    if (parsed.source[i] === "\n") line++
  }
  return line
}

/**
 * What a module specifier points at inside this repo, or null.
 *
 * Only local imports matter to the layering rules: a package name is not a
 * layer. Extensions are added the way the bundler adds them, and `index` is
 * tried last, which is the order every resolver here uses.
 */
export function resolveLocal(fromFile: string, specifier: string, virtual: ReadonlySet<string> = new Set()): string | null {
  if (!specifier.startsWith(".")) return null
  const base = join(dirname(fromFile), specifier)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]
  for (const candidate of candidates) {
    if (virtual.has(candidate)) return candidate
    // A directory is not a module; only its index is.
    try {
      if (statSync(join(ROOT, candidate)).isFile()) return candidate.replace(/^\.\//, "")
    } catch {
      /* not this one */
    }
  }
  return null
}

export interface Edge {
  /** Repo-relative importer. */
  from: string
  /** Repo-relative imported module, resolved inside the repo. */
  to: string
  /** `import type` — erased at build time, so it cannot pull code into a bundle. */
  typeOnly: boolean
  line: number
}

/**
 * Every local import and re-export in a file.
 *
 * Re-exports count: `export * from "./x"` is a dependency by any measure, and
 * src/db/schema.ts is nothing but those.
 */
export function edgesOf(parsed: Parsed, virtual: ReadonlySet<string> = new Set()): Edge[] {
  const edges: Edge[] = []
  walk(parsed.program, (node) => {
    if (
      node.type !== "ImportDeclaration" &&
      node.type !== "ExportNamedDeclaration" &&
      node.type !== "ExportAllDeclaration"
    ) {
      return
    }
    const source = node.source as { value?: string } | null
    if (!source?.value) return
    const to = resolveLocal(parsed.path, source.value, virtual)
    if (!to) return
    // `import type {…}` on the declaration, or every specifier marked `type` —
    // both erase, and the second is how `import { type X }` is written.
    const specifiers = (node.specifiers ?? []) as Array<{ importKind?: string }>
    const typeOnly =
      node.importKind === "type" ||
      node.exportKind === "type" ||
      (specifiers.length > 0 && specifiers.every((s) => s.importKind === "type"))
    edges.push({ from: parsed.path, to, typeOnly, line: lineOf(parsed, node) })
  })
  return edges
}
