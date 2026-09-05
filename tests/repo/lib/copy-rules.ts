import { lineOf, parse, walk, type Node } from "./ast"

/**
 * No user-visible string may be written directly into the UI.
 *
 * Every rule below earns its place by catching a class this repo has actually
 * shipped. This is not a general lint setup and must not become one.
 *
 * ── Why a machine checks this at all ──
 *
 * tests/repo/messages.test.ts verifies that every released locale carries every
 * message, and reports 147/147. That is true, and it is the wrong question: it
 * cannot see a string that was never a message. It was green while ~99
 * hardcoded English strings shipped — an English status chip on every Thai
 * event card, English column headers on the admin console, "Venue TBC" inside a
 * Thai sentence.
 *
 * The first attempt was a regex scanner over the source, and it was rightly
 * called slop: text matching cannot tell a person's name in a fixture from a
 * label on a button, so it reported "Phongphan" and `Promise<T>` as
 * untranslated copy. A check that is mostly false positives gets ignored and
 * takes the real findings with it.
 *
 * So these walk the syntax tree. A JSXText node is a string in a *rendered
 * position*; it cannot be confused with a comment, a type, an identifier, a
 * className or a data-testid, because those are different nodes. That is the
 * difference between guessing and knowing.
 *
 * ── Why here and not in ESLint ──
 *
 * These were `react/jsx-no-literals` and two `no-restricted-syntax` selectors
 * in eslint.config.mjs. Three rules, and the price was four packages
 * (`eslint`, `eslint-plugin-react`, `@typescript-eslint/parser` and their
 * tree), a root config file, and — the part that mattered — a parser that
 * reaches the syntax through TypeScript's JavaScript compiler API, which
 * TypeScript 7 does not ship. Three rules were pinning the repo to TypeScript
 * 6. The rules are unchanged, node for node; see tests/repo/lib/ast.ts.
 */

/**
 * Glyphs and separators that are the same in every language — an em dash is not
 * English — plus the product's own name. "Remy Sport" and "เรมีสปอร์ต" are the
 * brand in two scripts, shown together on purpose in the sidebar: a proper noun
 * is not a string to translate, and wrapping it in a message would invite
 * somebody to.
 */
const ALLOWED = new Set([
  "—", "–", "·", "/", "|", ":", "×", "→", "←", "↗", "↻", "+", "-", "?", "*",
  "Remy Sport", "Remy Sport ·", "เรมีสปอร์ต",
  // A masked score and a keyboard shortcut. Neither is language.
  "--", "⌘K", "#", "±",
])

const RENDERED = new Set(["JSXElement", "JSXFragment"])

/** The value a string node carries, or null if it is not a string. */
const stringValue = (node: Node): string | null =>
  typeof node.value === "string" ? node.value : null

/**
 * JSX text as the browser will render it, entities and all.
 *
 * The parser hands back source text, so `&nbsp;` arrives as six characters
 * rather than as the non-breaking space it renders. Untreated, the layout
 * spacer in live.tsx reads as a word. Decoding is also what lets `&mdash;` be
 * recognised as the em dash the allowed list already permits — a glyph is a
 * glyph however it is spelled.
 */
const NAMED: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  mdash: "—", ndash: "–", middot: "·", times: "×", hellip: "…",
  rarr: "→", larr: "←", plusmn: "±",
}
const decodeEntities = (text: string): string =>
  text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return NAMED[body.toLowerCase()] ?? whole
  })

/**
 * A line the author has taken responsibility for, with the reason beside it.
 *
 * One spelling for the whole repo — tests/repo/fixture-ids.test.ts uses the
 * same marker. There is one use of it here, and it is load-bearing: the
 * unhandled-rejection panel is developer tooling that never reaches a reader,
 * and a translated stack-trace viewer would be absurd.
 */
const IGNORED = /check-ignore/

/**
 * The parent a rule means, looking through binary expressions.
 *
 * `<div>{"Venue " + name}</div>` renders both halves, so the literal's parent
 * for this purpose is the expression container, not the `+`.
 */
function effectiveParent(ancestors: readonly Node[]): Node | undefined {
  for (const node of ancestors) {
    if (node.type !== "BinaryExpression") return node
  }
  return undefined
}

export interface Finding {
  path: string
  line: number
  text: string
  why: string
}

const WHITESPACE = /^[\s]*$/

export function copyProblems(files: readonly string[]): Finding[] {
  const found: Finding[] = []
  for (const path of files) {
    const parsed = parse(path)
    const tsx = path.endsWith(".tsx")
    const lines = parsed.source.split("\n")
    walk(parsed.program, (node, ancestors) => {
      const line = lineOf(parsed, node)
      // The marked line, or the one above it — a JSX attribute and a returned
      // literal are both often wrapped, and the reason belongs where a reader
      // will see it.
      if (IGNORED.test(lines[line - 1] ?? "") || IGNORED.test(lines[line - 2] ?? "")) return
      const at = (text: string, why: string) =>
        found.push({ path, line, text: text.trim().slice(0, 60), why })

      if (tsx) {
        /**
         * Text in a rendered position — the whole of `jsx-no-literals`, which
         * is the rule that catches "Venue TBC" between two tags.
         */
        if (node.type === "JSXText") {
          const value = decodeEntities(stringValue(node) ?? "")
          if (!WHITESPACE.test(value) && !ALLOWED.has(value.trim())) {
            at(value, "text rendered as-is")
          }
          return
        }

        /**
         * A bare string or template inside `{…}` in a rendered position:
         * `<div>{"Live now"}</div>`. Not an attribute — className, data-testid
         * and a font stack in a style object are not language, and flagging
         * them would make the rule noise.
         */
        if (node.type === "Literal" || node.type === "TemplateLiteral") {
          const parent = effectiveParent(ancestors)
          const grandParent = ancestors[ancestors.indexOf(parent as Node) + 1]
          if (parent?.type === "JSXExpressionContainer" && grandParent && RENDERED.has(grandParent.type)) {
            const value = node.type === "TemplateLiteral" ? "`…`" : stringValue(node)
            if (value !== null && !WHITESPACE.test(value) && !ALLOWED.has(value.trim())) {
              at(value, "a string in a rendered expression")
            }
          }
        }

        /**
         * A string inside a JSX *expression*, which the rule above cannot see.
         *
         * It walks the container's direct children, and `{{ all: "All", live:
         * "Live" }[id]}` has none that are strings — it is an object literal.
         * That is how the discover page's tab row stayed English in Thai and
         * Japanese while every check reported the page clean.
         *
         * The pattern is `^[A-Z][a-z]` — a capital followed by a lowercase —
         * and that shape is doing real work. It matches "All", "Live",
         * "Registering": words a person reads. It does NOT match "LIVE",
         * "NOT_FOUND" or "tournament", which is what a comparison against a
         * code looks like, and comparisons are most of what string literals do
         * in this position.
         */
        if (node.type === "Literal") {
          const value = stringValue(node)
          const inContainer = ancestors.some((a) => a.type === "JSXExpressionContainer")
          const inAttribute = ancestors.some((a) => a.type === "JSXAttribute")
          if (value !== null && /^[A-Z][a-z]/.test(value) && inContainer && !inAttribute) {
            at(value, "a user-visible string inside a JSX expression")
          }
        }

        /**
         * The four attributes a person actually reads.
         *
         * Props are exempt in general and that is right — but these four are
         * read aloud by a screen reader or shown in the field, and the blanket
         * exemption covered them: `placeholder="Event name"` and
         * `placeholder="Description (optional)"` sat in the create-event form
         * in English while the rest of it was Thai, and every check passed.
         *
         * Two letters minimum, so `alt=""` — how you mark an image
         * decorative — is still allowed.
         */
        if (node.type === "JSXAttribute") {
          const name = (node.name as { name?: string } | undefined)?.name ?? ""
          const value = node.value as Node | null
          if (/^(placeholder|title|alt|aria-label)$/.test(name) && value?.type === "Literal") {
            const text = stringValue(value)
            if (text !== null && /[A-Za-z]{2}/.test(text)) {
              at(text, `a user-visible ${name} in English`)
            }
          }
        }
        return
      }

      /**
       * The view-model layer, which none of the JSX rules can see.
       *
       * They walk JSX, and `src/web/lib/api.ts` has none — it is plain
       * TypeScript that MANUFACTURES the strings JSX later renders. That is
       * exactly where `statusLabel` returned "Live now", "Finished" and
       * "Registration open" as literals, so every Thai event card carried an
       * English status chip, with the JSX rules green throughout.
       *
       * A string literal returned from here is an error. Narrow on purpose: it
       * is the shape a label takes on its way to the screen, and it does not
       * object to a literal used as a key, a code, a class name or a
       * comparison, which is most of what this layer otherwise does. It cannot
       * catch a label built by concatenation or assigned to a variable first,
       * and pretending otherwise would be the bullshit. What it does catch is
       * the exact shape that shipped.
       */
      if (node.type === "ReturnStatement") {
        const argument = node.argument as Node | null
        const value = argument?.type === "Literal" ? stringValue(argument) : null
        if (value !== null && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(value)) {
          at(value, "a user-visible string returned from the view-model layer")
        }
      }
    })
  }
  return found
}
