import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { ROOT, lineOf, parse, sources, walk, type Node } from "./lib/ast"
import { rule } from "./helpers"

/**
 * A development-only experiment and the product it proved do not share copy.
 *
 * On 2026-09-09 the Meetings feature shipped with **"Create test room"** on the
 * button that invites your colleagues to a meeting. Nothing was broken: the
 * button worked, all three locales carried the string, every check was green.
 * It simply told a reader that the thing they were about to do was a test —
 * because the page reached for `meeting_create`, and that key belonged to
 * `pages/meeting-test.tsx`, the dev-only two-seat media experiment, where
 * "Create test room" is exactly right.
 *
 * That is what a shared namespace does. The experiment came first, so it owned
 * the obvious names — `meeting_create`, `meeting_join`, `meeting_peer_hint` —
 * and the feature built on its transport inherited its vocabulary along with
 * it: "the other participant" in a room that can hold six, "No meetings yet"
 * on a meeting the reader was looking straight at.
 *
 * ## The two rules
 *
 * 1. A message named for a dev-only surface (`meeting_test_*`) is referenced
 *    only by that surface.
 * 2. A message *only* that surface uses is named for it — otherwise it is an
 *    unmarked private string sitting in the shared namespace, which is exactly
 *    what `meeting_create` was on the day somebody needed a create button.
 *
 * Between them: the experiment's own vocabulary is visible in the locale files
 * and cannot leak, while genuinely shared copy (`sign_in`, `push_retry`) stays
 * shared, because a string a shipped page already renders is safe everywhere.
 *
 * What is *not* checked is whether a sentence sounds like a test.
 * `send_test_notification` is honest copy on a shipped page, and no machine can
 * tell those apart. Ownership can be told, and ownership is the fault line.
 *
 * ## Why the list is literal
 *
 * "Dev-only" is a property of a surface, and the surfaces are gated in
 * different ways — a page that renders an EmptyState outside `dev`, a link
 * wrapped in `__BUILD__.environment === "dev"`, a procedure that 404s
 * server-side. Grepping for the gate would quietly pass the day a fourth
 * spelling appears, and reporting success wrongly is the one thing a check may
 * never do. There is one such surface today; adding the second is a line here,
 * with its reason.
 */
const DEV_ONLY: ReadonlyArray<[path: string, why: string]> = [
  [
    "src/web/pages/meeting-test.tsx",
    "the two-seat Hang experiment: dev-only in the page, and in moq.meetingConfig's own policy",
  ],
]

/** The marker copy-rules.ts and fixture-ids.test.ts use, spelled the same way. */
const IGNORED = /check-ignore/

/** `meeting-test.tsx` owns `meeting_test_*`. The file names the prefix, so neither can drift. */
const prefixOf = (path: string) => path.replace(/^.*\//, "").replace(/\.tsx?$/, "").replaceAll("-", "_")

/** Every `m.some_key()` in a file, with the line it is on. */
function messageKeys(path: string): Array<{ key: string; line: number }> {
  const parsed = parse(path)
  const lines = parsed.source.split("\n")
  const found: Array<{ key: string; line: number }> = []
  walk(parsed.program, (node: Node) => {
    if (node.type !== "MemberExpression" || node.computed) return
    const object = node.object as Node | undefined
    const property = node.property as Node | undefined
    if (object?.type !== "Identifier" || object.name !== "m") return
    if (property?.type !== "Identifier" || typeof property.name !== "string") return
    const line = lineOf(parsed, node)
    // A line whose author took responsibility, with the reason beside it: the
    // entry point to a dev-only page has to live on a page that ships.
    if (IGNORED.test(lines[line - 1] ?? "") || IGNORED.test(lines[line - 2] ?? "")) return
    found.push({ key: property.name, line })
  })
  return found
}

export interface SurfaceProblems {
  /** The experiment's copy, rendered by something that ships. */
  leaked: string[]
  /** A private string with a public-looking name — the trap, before it is sprung. */
  unmarked: string[]
  /** Distinct keys seen, for the summary line. */
  keys: number
}

/** The rules, over any set of files, so they can be run against text whose answer is known. */
export function surfaceProblems(
  files: readonly string[],
  devOnly: ReadonlyArray<readonly [path: string, why: string]>,
): SurfaceProblems {
  const devFiles = new Set(devOnly.map(([path]) => path))
  const usage = new Map<string, Array<{ path: string; line: number }>>()
  for (const path of files) {
    for (const { key, line } of messageKeys(path)) {
      const at = usage.get(key) ?? []
      at.push({ path, line })
      usage.set(key, at)
    }
  }

  const leaked: string[] = []
  const unmarked: string[] = []
  for (const [key, at] of usage) {
    const owner = devOnly.find(([path]) => key.startsWith(`${prefixOf(path)}_`))
    const shipped = at.filter((u) => !devFiles.has(u.path))
    if (owner) {
      for (const u of shipped) leaked.push(`${u.path}:${u.line}  m.${key}() belongs to ${owner[0]}`)
    } else if (at.length && !shipped.length) {
      const path = at[0]!.path
      unmarked.push(`m.${key}() — used only by ${path}, so name it ${prefixOf(path)}_*`)
    }
  }
  return { leaked, unmarked, keys: usage.size }
}

/**
 * Everything that renders words — the SPA, the API's error copy, the mail
 * templates. An email saying "test room" is the same defect by another route.
 * `components/ui/` is excluded as it is everywhere: registry copies, hash-locked,
 * and not ours to annotate.
 */
const files = sources("src").filter((f) => !f.startsWith("src/web/components/ui/"))

const missing = DEV_ONLY.filter(([path]) => !files.includes(path)).map(
  ([path]) => `${path} is listed as dev-only but is not in the tree`,
)
const { leaked, unmarked, keys } = surfaceProblems(files, DEV_ONLY)

rule(
  "a dev-only surface's copy reaches no shipped page",
  [...missing, ...leaked],
  `check-copy-surfaces: ${leaked.length} shipped reference(s) to development-only copy\n\n` +
    [...missing, ...leaked].map((p) => `  ${p}`).join("\n") +
    "\n\n  Give the shipped surface its own message. A key an experiment uses is the\n" +
    '  experiment\'s: it is free to say "test room" and "the other participant",\n' +
    "  which is why the product must not borrow it. This shipped — the Meetings\n" +
    '  dialog invited people with a button reading "Create test room".\n' +
    "  A line that must share one can carry `// check-ignore` with the reason.",
  `check-copy-surfaces: ${keys} message(s) rendered, none of the experiment's on a shipped page`,
)

rule(
  "a message only a dev-only surface uses is named for it",
  unmarked,
  `check-copy-surfaces: ${unmarked.length} unmarked development-only message(s)\n\n` +
    unmarked.map((p) => `  ${p}`).join("\n") +
    "\n\n  Rename the key in every messages/*.json and at its call site. An\n" +
    "  experiment's private string sitting in the shared namespace is the trap\n" +
    "  the rule above exists to catch — `meeting_create` was one, and the next\n" +
    "  person to want a create button took it.",
)

/**
 * The rules themselves, on the shapes this repo has actually shipped.
 *
 * The first case is the defect verbatim: a dev-only page owning `x_create`, a
 * shipped page rendering it. A rule that reports nothing because it walks the
 * wrong node passes the sweep above in a repo that is already clean, and would
 * have passed it on 2026-09-09 too.
 */
describe("the rules themselves, on copy whose answer is known", () => {
  const DEV = "demo-test.tsx"
  const SHIPPED = "product.tsx"

  /** Two files in a temp directory inside the repo, because parsing is repo-relative. */
  const run = (dev: string, shipped: string): SurfaceProblems => {
    const dir = mkdtempSync(join(ROOT, ".surface-fixture-"))
    try {
      writeFileSync(join(dir, DEV), dev)
      writeFileSync(join(dir, SHIPPED), shipped)
      const rel = (name: string) => relative(ROOT, join(dir, name))
      return surfaceProblems([rel(DEV), rel(SHIPPED)], [[rel(DEV), "the fixture's experiment"]])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it("catches the experiment's own copy on a shipped page", () => {
    const found = run(
      `export const A = () => <div>{m.demo_test_create()}</div>`,
      `export const B = () => <div>{m.demo_test_create()}</div>`,
    )
    expect(found.leaked).toHaveLength(1)
    expect(found.leaked[0]).toContain("m.demo_test_create()")
  })

  it("catches a private string wearing a shared name — the 2026-09-09 defect, one day earlier", () => {
    const found = run(
      `export const A = () => <div>{m.meeting_create()}</div>`,
      `export const B = () => <div>{m.something_else()}</div>`,
    )
    expect(found.unmarked).toEqual([expect.stringContaining("m.meeting_create()")])
  })

  it("allows copy the shipped page owns and the experiment borrows", () => {
    const found = run(
      `export const A = () => <div>{m.sign_in()}</div>`,
      `export const B = () => <div>{m.sign_in()}</div>`,
    )
    expect(found).toMatchObject({ leaked: [], unmarked: [] })
  })

  it("allows a marked line, so a dev-only page can be linked from one that ships", () => {
    const found = run(
      `export const A = () => <div>{m.demo_test_title()}</div>`,
      `export const B = () => <div>{m.demo_test_title()}</div> // check-ignore: the entry point`,
    )
    expect(found.leaked).toEqual([])
  })

  it("does not mistake another object's property for a message", () => {
    const found = run(
      `export const A = () => <div>{m.demo_test_title()}</div>`,
      `export const B = () => <div>{form.demo_test_title()}{rows[m]}</div>`,
    )
    expect(found.leaked).toEqual([])
  })
})
