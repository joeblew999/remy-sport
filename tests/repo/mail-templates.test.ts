import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { parseSync } from "oxc-parser"
import { rule } from "./helpers"

/**
 * A mail template holds structure, never words.
 *
 * Once an email has an HTML part there are two ways to keep it: a second
 * message per email holding the HTML, which is the same sentence written
 * twice in three languages and kept in step by hand; or one template that lays
 * out the message the text part already is. The second is the design
 * (docs/2026-09-09-02-email-channel-on-react-email.md), and it only stays the
 * design while no template grows a sentence of its own — which a template will
 * do the first time somebody wants a footer and finds typing it quicker than
 * adding a message. So this reads every template's syntax tree and fails on:
 *
 *   - JSX text with letters in it: `<Text>Thanks for reading</Text>`.
 *   - A string literal or template literal holding two words, or any Thai or
 *     Japanese script at all — `title="Your code"`, `` `Follow ${x} here` ``.
 *
 * `frame.ts` is the one file allowed a string with a space in it: font stacks
 * and the doctype. It is not a template and not a `.tsx`, so it is not read.
 */
const ROOT = resolve(import.meta.dirname, "../..")
const DIR = resolve(ROOT, "src/mail/templates")

const WORDS = /\p{L}{2,}[  ]\p{L}{2,}/u
const SCRIPT = /[\p{Script=Thai}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u
const LETTERS = /\p{L}{2,}/u

type Node = { type: string; start?: number; end?: number; [key: string]: unknown }

function walk(node: unknown, visit: (n: Node) => void): void {
  if (!node || typeof node !== "object") return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  const n = node as Node
  if (typeof n.type === "string") visit(n)
  for (const [key, value] of Object.entries(n)) {
    if (key !== "type" && value && typeof value === "object") walk(value, visit)
  }
}

const problems: string[] = []
const templates = readdirSync(DIR).filter((f) => f.endsWith(".tsx"))
for (const file of templates) {
  const path = join(DIR, file)
  const source = readFileSync(path, "utf8")
  const at = (offset: number) => `${relative(ROOT, path)}:${source.slice(0, offset).split("\n").length}`
  const { program } = parseSync(path, source)
  walk(program, (n) => {
    if (n.type === "JSXText" && LETTERS.test(String(n.value))) {
      problems.push(`${at(n.start ?? 0)}: JSX text ${JSON.stringify(String(n.value).trim())}`)
    }
    if (n.type === "Literal" && typeof n.value === "string" && (WORDS.test(n.value) || SCRIPT.test(n.value))) {
      problems.push(`${at(n.start ?? 0)}: string ${JSON.stringify(n.value)}`)
    }
    if (n.type === "TemplateLiteral") {
      for (const q of n.quasis as { value: { cooked?: string | null } }[]) {
        const text = q.value.cooked ?? ""
        if (WORDS.test(text) || SCRIPT.test(text)) problems.push(`${at(n.start ?? 0)}: template ${JSON.stringify(text)}`)
      }
    }
  })
}

rule(
  "mail templates hold structure, never words",
  [...(templates.length ? [] : ["no templates found under src/mail/templates"]), ...problems],
  "mail-templates: a template holds words of its own\n\n" +
    problems.map((p) => `  ${p}\n`).join("") +
    "\n  Every word a reader sees comes from a Paraglide message; a template decides\n" +
    "  layout only. Add a message under messages/ and call it from the template.",
  `mail-templates: ${templates.length} templates hold no words of their own`,
)
