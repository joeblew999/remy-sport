/**
 * The lock that makes copied components upgradeable.
 *
 * shadcn does not install components; it copies their source into the repo
 * and they become ours. That is the whole model, and it has one failure mode:
 * somebody edits a copied file by hand, and from then on `add --overwrite`,
 * which is how an upgrade is taken, silently discards the edit — or the edit
 * is kept and the component quietly forks the design system. With many agents
 * working in turn that is not a risk, it is a schedule.
 *
 * So every file the registry writes is recorded here with the item it came
 * from and a hash of its content, by the one command that is allowed to write
 * them (`bun run ops ui add`). tests/repo/registry.test.ts then fails when a
 * file under the UI folder is absent from the lock, differs from its recorded
 * hash, or came from a namespace the lock does not allow. A hand edit is a red
 * check; an upgrade is `bun run ops ui add <item>` again, and the diff is in
 * git where it belongs.
 *
 * The allowlist lives in the lock rather than in components.json because the
 * official registry index resolves namespaces with no configuration at all —
 * `@magicui/marquee` installs with nothing declared anywhere — so the only
 * place a "which catalogues may this repo draw from" rule can live is one we
 * own. `registries` maps a namespace to the reason it is allowed.
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

export const LOCK_FILE = "components-lock.json"
/** Where components.json points `aliases.ui`; the folder the lock governs whole. */
export const UI_DIR = "src/web/components/ui"

export interface Lock {
  /** Namespace → why it is allowed. `@shadcn` is the official registry. */
  registries: Record<string, string>
  /**
   * The preset shadcn's create page offers, as its own field names, so
   * `bun run ops ui theme` can ask shadcn for the theme those choices decide.
   * Fonts are the exception: `font` names the preset's face for the endpoint's
   * sake, but the stylesheet keeps our self-hosted Inter and Noto Sans Thai.
   */
  preset?: Record<string, string>
  /** `@namespace/item` → the files it wrote (repo-relative) and their sha256. */
  items: Record<string, { files: Record<string, string> }>
}

export function readLock(root: string): Lock {
  const path = join(root, LOCK_FILE)
  if (!existsSync(path)) return { registries: { "@shadcn": "the official shadcn registry" }, items: {} }
  return JSON.parse(readFileSync(path, "utf8")) as Lock
}

export function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

/** `button` → `@shadcn/button`; `@acme/thing` stays; a URL or path is refused. */
export function qualify(item: string): string {
  if (/^(https?:|\.|\/)/.test(item)) throw new Error(`refusing "${item}": items are added by registry name, never by URL or path, so the lock can say where they came from`)
  return item.startsWith("@") ? item : `@shadcn/${item}`
}

export function namespaceOf(qualified: string): string {
  return qualified.split("/")[0]!
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

/** Every way the tree and the lock can disagree, as sentences. Empty means they agree. */
export function verifyLock(root: string): string[] {
  const lock = readLock(root)
  const problems: string[] = []
  const locked = new Map<string, { item: string; hash: string }>()

  for (const [item, entry] of Object.entries(lock.items)) {
    const namespace = namespaceOf(item)
    if (!(namespace in lock.registries)) {
      problems.push(`${item} came from ${namespace}, which ${LOCK_FILE} does not allow`)
    }
    for (const [file, hash] of Object.entries(entry.files)) {
      locked.set(file, { item, hash })
      const path = join(root, file)
      if (!existsSync(path)) problems.push(`${file} is in the lock (from ${item}) but not in the tree`)
      else if (hashFile(path) !== hash) problems.push(`${file} differs from what ${item} wrote — edited by hand? Re-add it with \`bun run ops ui add ${item}\``)
    }
  }

  for (const path of walk(join(root, UI_DIR))) {
    const file = relative(root, path)
    if (!locked.has(file)) problems.push(`${file} is under ${UI_DIR} but no registry item in the lock wrote it`)
  }

  return problems
}
