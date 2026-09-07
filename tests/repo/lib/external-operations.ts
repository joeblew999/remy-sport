import { parse, sources, walk, type Node } from './ast'

/** Owned by Better Auth/browser APIs, outside the oRPC response contract. */
export const EXTERNAL_OPERATIONS = {
  'auth.email-otp/send-verification-otp': ['SIGN_IN_OUT', 'SIGN_UP_AS_SPECTATOR'],
  'auth.sign-in/email-otp': ['SIGN_IN_OUT', 'SIGN_UP_AS_SPECTATOR'],
  'auth.sign-out': ['SIGN_IN_OUT'],
  'auth.get-session': ['SIGN_IN_OUT'],
  'auth.list-sessions': ['SIGN_IN_OUT'],
  'auth.revoke-session': ['SIGN_IN_OUT'],
  'auth.revoke-other-sessions': ['SIGN_IN_OUT'],
  'auth.admin/list-users': ['MANAGE_ALL_USERS'],
  'auth.admin/set-role': ['MANAGE_ALL_USERS'],
  'auth.admin/ban-user': ['MANAGE_ALL_USERS'],
  'auth.admin/unban-user': ['MANAGE_ALL_USERS'],
  'auth.admin/impersonate-user': ['MANAGE_ALL_USERS'],
  'auth.admin/stop-impersonating': ['MANAGE_ALL_USERS'],
  'auth.admin/create-user': ['CREATE_USER_ACCOUNT'],
  'browser.install': ['INSTALL_APP'],
} as const

/** Discover static auth endpoints and admin mutation paths from executable code. */
export function externalOperations(): Set<string> {
  return new Set(sources('src/web').flatMap((file) => [...operationsInProgram(parse(file).program, file)]))
}

/** Refuse partially dynamic admin paths: auditing just one branch hides work. */
export function operationsInProgram(program: Node, file: string): Set<string> {
  const found = new Set<string>()
  const strings = (node: Node): string[] => {
    if (typeof node.value === 'string') return [node.value]
    if (node.type === 'ConditionalExpression') return [...strings(node.consequent as Node), ...strings(node.alternate as Node)]
    throw new Error(`${file}: dynamic admin action needs explicit inventory support`)
  }
  const adminBindings = new Set<string>()
  walk(program, (node) => {
    const init = node.init as Node | undefined
    if (node.type === 'VariableDeclarator' && (init?.callee as Node | undefined)?.name === 'useAdminAction') adminBindings.add(String((node.id as Node).name))
  })
  walk(program, (node) => {
    if (node.type === 'CallExpression') {
      const callee = node.callee as Node
      const endpoint = (node.arguments as Node[])[0]
      if (['fetch', 'call'].includes(String(callee.name)) && typeof endpoint?.value === 'string' && endpoint.value.startsWith('/api/auth/')) {
        found.add(`auth.${endpoint.value.slice('/api/auth/'.length).split('?')[0]}`)
      }
      const object = callee.object as Node | undefined
      const property = callee.property as Node | undefined
      const method = callee.computed ? property?.value : property?.name
      if (adminBindings.has(String(object?.name)) && ['mutate', 'mutateAsync'].includes(String(method))) {
        const arg = (node.arguments as Node[])[0]
        const path = (arg?.properties as Node[] | undefined)?.find((p) => (p.key as Node)?.name === 'path')
        if (!path) throw new Error(`${file}: admin action requires a statically auditable path`)
        const paths = strings(path.value as Node)
        for (const path of paths) found.add(`auth.admin/${path}`)
      }
      if (property?.name === 'showDialog') found.add('browser.install')
    }
  })
  return found
}
