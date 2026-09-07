import { parse, walk, type Node } from './ast'

/** Only executable test declarations count, never comments or arbitrary strings. */
export function testTitles(file: string): Set<string> {
  return executableTestTitles(parse(file).program)
}

/** Static declarations only; runtime skips still require actual runner evidence. */
export function executableTestTitles(program: Node): Set<string> {
  const titles = new Set<string>()
  const chain = (node: Node | undefined): string[] => {
    if (!node) return []
    if (node.type === 'Identifier') return [String(node.name)]
    if (node.type === 'MemberExpression') {
      const property = node.property as Node
      return [...chain(node.object as Node), String(node.computed ? property.value : property.name)]
    }
    if (node.type === 'CallExpression') return chain(node.callee as Node)
    return []
  }
  const disabled = (node: Node): boolean => {
    if (node.type !== 'CallExpression') return false
    const names = chain(node.callee as Node)
    return ['test', 'it', 'describe'].includes(names[0] ?? '') &&
      names.some((name) => ['skip', 'fixme', 'todo', 'skipIf', 'runIf'].includes(name))
  }
  walk(program, (node, ancestors) => {
    if (node.type !== 'CallExpression') return
    const names = chain(node.callee as Node)
    if (!['test', 'it'].includes(names[0] ?? '') || names.includes('describe')) return
    if (disabled(node) || ancestors.some(disabled)) return
    const [title, body] = node.arguments as Node[]
    if (typeof title?.value === 'string' && ['ArrowFunctionExpression', 'FunctionExpression'].includes(body?.type ?? '')) titles.add(title.value)
  })
  return titles
}
