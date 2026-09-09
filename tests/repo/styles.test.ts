/**
 * The stylesheet's type rules, as tests.
 *
 * `src/web/styles.css` is one file with no build step, so nothing but a check
 * stops a rule from drifting: a literal font name in one selector, an 11px
 * label, a new metadata line set in monospace because the row above it was.
 * That is how the file reached 61 monospace rules and 57 rules under 12px
 * before docs/done/2026-09-08-01-typography-and-design-system.md. Each rule here
 * names the drift it stops.
 *
 * Blocks are parsed with a regex over comment-stripped CSS: the innermost
 * `selector { declarations }` pairs. A media query's own brace never matches,
 * because a selector cannot contain one, so its inner rules are read as if
 * they stood at the top level — which is what these rules want.
 */

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"
import { rule } from "./helpers"

const CSS_PATH = "src/web/styles.css"

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

function undefinedTokens(css: string): string[] {
  const text = stripComments(css)
  const defined = new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]))
  return [...new Set([...text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)]
    .map(match => match[1]!).filter(token => !defined.has(token)))]
}

interface Block { selector: string; body: string }

function blocks(css: string): Block[] {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({
    selector: match[1]!.trim().replace(/\s+/g, " "),
    body: match[2]!,
  }))
}

/** Every `font-family:` value that is not a token or `inherit`. */
function literalFontFamilies(css: string): string[] {
  return [...stripComments(css).matchAll(/font-family\s*:\s*([^;}]+)/g)]
    .map(match => match[1]!.trim())
    .filter(value => !/^(var\(--font-[\w-]+\)|inherit)$/.test(value))
}

/** Every pixel size under the floor, in a `font-size:` or a `--text-*` token. */
function sizesBelow(css: string, floor: number): string[] {
  const out: string[] = []
  for (const match of stripComments(css).matchAll(/(font-size|--type-[\w-]+|--text-[\w-]+)\s*:\s*([^;}]+)/g)) {
    for (const px of match[2]!.matchAll(/(\d+(?:\.\d+)?)px/g)) {
      if (Number(px[1]) < floor) out.push(`${match[1]}: ${match[2]!.trim()}`)
    }
  }
  return out
}

/** Selectors whose block contains `needle`, minus the ones allowed to. */
function blocksUsing(css: string, needle: RegExp, allowed: readonly string[]): string[] {
  return blocks(css).filter(b => needle.test(b.body) && !allowed.includes(b.selector)).map(b => b.selector)
}

test("the block parser reads nested media rules as top-level selectors", () => {
  expect(blocks("a { x: 1 } @media (max-width: 1px) { .b, .c { y: 2 } }").map(b => b.selector))
    .toEqual(["a", ".b, .c"])
  expect(literalFontFamilies("a { font-family: 'Inter', sans-serif } b { font-family: var(--font-sans) } c { font-family: inherit }"))
    .toEqual(["'Inter', sans-serif"])
  expect(sizesBelow("a { font-size: 10px } :root { --type-xs: 12px; --type-tiny: 9px; --text-tiny: 9px } b { font-size: clamp(11px, 3vw, 30px) }", 12))
    .toEqual(["font-size: 10px", "--type-tiny: 9px", "--text-tiny: 9px", "font-size: clamp(11px, 3vw, 30px)"])
  expect(undefinedTokens("a { color: var(--missing); background: var(--optional, red) }"))
    .toEqual(["--missing"])
  expect(undefinedTokens("/* --missing: red */ a { color: var(--missing) }"))
    .toEqual(["--missing"])
})

const css = readFileSync(CSS_PATH, "utf8")

rule("shared CSS tokens resolve or provide a fallback", undefinedTokens(css),
  `${CSS_PATH} uses tokens that nothing defines: ${undefinedTokens(css).join(", ")}`)

rule("every font-family is a --font-* token", literalFontFamilies(css),
  `${CSS_PATH} names a typeface outside the tokens:\n  ${literalFontFamilies(css).join("\n  ")}\n\n` +
  `Use var(--font-sans), var(--font-display), var(--font-thai) or var(--font-mono). The faces are\n` +
  `named once, at the top of the file, so that the Thai and system-ui tails cannot be forgotten.`)

/* The tails are load-bearing: Thai is self-hosted and system-ui renders CJK.
   Drop either and a declared locale becomes tofu. The mono token is exempt on
   purpose — it is only ever used for code and digits. */
const tailless = ["--font-sans", "--font-thai"].filter(token => {
  const value = stripComments(css).match(new RegExp(`${token}\\s*:\\s*([^;]+)`))?.[1] ?? ""
  return !value.includes("'Noto Sans Thai'") || !value.includes("system-ui")
})
rule("the text font tokens keep Noto Sans Thai and system-ui in their tails", tailless,
  `These font tokens in ${CSS_PATH} lost 'Noto Sans Thai' or system-ui from their tail: ${tailless.join(", ")}`)

const FLOOR = 12
rule(`no text is set below ${FLOOR}px`, sizesBelow(css, FLOOR),
  `${CSS_PATH} sets text under ${FLOOR}px:\n  ${sizesBelow(css, FLOOR).join("\n  ")}\n\n` +
  `The floor is text-xs. If something genuinely needs to be smaller, it is decoration, not text.`)

/* Nowhere, any more: the registry's components carry their own faces, and a
   column of digits aligns with tabular-nums. The rule stays so a stray
   monospace label cannot come back — a line of metadata in mono is what made
   the app read like a terminal. */
const MONO_ALLOWED: readonly string[] = []
const monoStrays = blocksUsing(css, /var\(--font-mono\)/, MONO_ALLOWED)
rule("the monospace face is used only where digits align", monoStrays,
  `${CSS_PATH} sets var(--font-mono) on selectors not in the allowlist:\n  ${monoStrays.join("\n  ")}\n\n` +
  `Mono is for numbers that have to line up (scores, clocks, codes, hashes). Metadata is sans.\n` +
  `If this is a new column of digits, add the selector to MONO_ALLOWED in ${import.meta.url.split("/").slice(-2).join("/")} with what it aligns.`)

/* Nowhere: a pill is the registry's Badge, sentence case as it ships.
   Headings, labels and table headers are sentence case too. */
const UPPERCASE_ALLOWED: readonly string[] = []
const upperStrays = blocksUsing(css, /text-transform\s*:\s*uppercase/, UPPERCASE_ALLOWED)
rule("uppercase is reserved for pills and tags", upperStrays,
  `${CSS_PATH} sets text-transform: uppercase on selectors not in the allowlist:\n  ${upperStrays.join("\n  ")}\n\n` +
  `Labels, headings and table headers are sentence case. A new status pill goes in UPPERCASE_ALLOWED.`)

/* Every class the stylesheet styles is rendered by something. The dead half
   of this file — the old live page, the bracket, standings rows — was found
   by this rule in 2026-09 and deleted. Names are matched as whole words
   anywhere in src/web, which is generous: a class that shares its name with
   an ordinary word will pass. It still catches whole dead families. */
const DYNAMIC_CLASSES: Record<string, string> = {
  dark: "shadcn's dark mode: put on <html> by the theme provider (lib/theme.ts), read by `@custom-variant dark`",
}
function webFiles(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "paraglide" || entry.name === "fonts" || entry.name === "public") continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.(tsx?|html)$/.test(entry.name)) out.push({ path, text: readFileSync(path, "utf8") })
    }
  }
  walk("src/web")
  return out
}
const files = webFiles()
const source = files.map(f => f.text).join("\n")
const classNames = [...new Set([...stripComments(css).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]!))]
const dead = classNames.filter(name =>
  !(name in DYNAMIC_CLASSES) && !new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`).test(source))
rule("every class in the stylesheet is rendered by something", dead,
  `${CSS_PATH} styles ${dead.length} class(es) that no file under src/web mentions:\n  ${dead.join(", ")}\n\n` +
  `Delete the rules, or if the name is composed at runtime add it to DYNAMIC_CLASSES with where.`,
  `styles: ${classNames.length} classes, all rendered`)

/* Uppercase is a presentation decision, so it is made in CSS (the allowlist
   above), never in the copy. Eleven English messages were written in capitals
   — crumbs, statuses, a panel heading — and stayed that way after the
   stylesheet stopped shouting, because the copy check reads `^[A-Z][a-z]`
   and a word in capitals does not match it. */
const CAPITALS_ALLOWED: Record<string, string> = {
  col_points: "PTS, the standings column abbreviation",
}
const messages = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, string>
const shouting = Object.entries(messages)
  .filter(([key, value]) => !(key in CAPITALS_ALLOWED) && /^[A-Z][A-Z0-9 /&'-]{2,}$/.test(value))
  .map(([key, value]) => `${key}: "${value}"`)
rule("no English message is written in capitals", shouting,
  `messages/en.json has copy in capitals:\n  ${shouting.join("\n  ")}\n\n` +
  `Write it in sentence case. If it must render uppercase, that is a pill: add its selector to UPPERCASE_ALLOWED.`)

/* Type comes from the stylesheet. An inline font is invisible to the rules
   above and to every media query. */
const inlineType = [...source.matchAll(/\b(fontFamily|fontSize)\s*:/g)].map(m => m[1]!)
rule("no component sets a font inline", inlineType,
  `${inlineType.length} inline fontFamily/fontSize style(s) under src/web. Give the element a class and set it in ${CSS_PATH}.`)

/* The same two rules for Tailwind classes in JSX, now that shadcn's components
   are written in them. `text-sm` reads the scale above and is fine; an
   arbitrary `text-[10px]` or `font-['Comic_Sans']` is the drift the rules
   above stop in CSS, arriving through a class instead. */
const smallArbitrary = [...source.matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)]
  .filter(m => Number(m[1]) < FLOOR).map(m => m[0])
rule(`no Tailwind class sets text under ${FLOOR}px`, smallArbitrary,
  `Arbitrary text sizes under ${FLOOR}px in src/web JSX:\n  ${smallArbitrary.join("\n  ")}\n\nUse text-xs (12px) or larger.`)
const fontClass = [...source.matchAll(/\bfont-\[[^\]]+\]/g)].map(m => m[0])
rule("no Tailwind class names a typeface", fontClass,
  `Arbitrary font families in src/web JSX:\n  ${fontClass.join("\n  ")}\n\nUse font-sans, font-display, font-thai or font-mono, which read the tokens.`)

/* The registry's look is the look (the Product Owner, 2026-09-08: no
   reinvented wheels, their theme not ours). Tailwind offers the two escapes
   the allowlists above close in CSS — `uppercase` and `font-mono` — as
   classes, and the badge and table steps are where they would arrive: a pill
   shouted back into capitals, a score column set in mono when tabular-nums
   is what aligns digits. The registry's own files are exempt: they are
   hash-locked, and this rule is for what we author. */
const JSX_ESCAPES_ALLOWED: Record<string, string> = {}
const stripTsxComments = (text: string) => stripComments(text).replace(/^\s*\/\/.*$/gm, "")
const escapes = files
  .filter(f => !f.path.startsWith("src/web/components/ui/") && !(f.path in JSX_ESCAPES_ALLOWED))
  .flatMap(f => [...stripTsxComments(f.text).matchAll(/\b(uppercase|font-mono)\b/g)].map(m => `${f.path}: ${m[1]}`))
rule("no authored JSX sets uppercase or monospace by class", escapes,
  `Tailwind escapes in src/web JSX:\n  ${escapes.join("\n  ")}\n\n` +
  `A registry Badge is sentence case, and a column of digits aligns with tabular-nums. If a case is\n` +
  `real, add the file to JSX_ESCAPES_ALLOWED with why.`)

/* ── The scale is decided in a component, never at a call site ──────────────
   The September 8 conversion cleaned this stylesheet and the drift moved into
   the JSX, where until now nothing looked: 140 hand-picked type classes and
   100 overrides of a registry component's own size, padding, radius or gap.
   That is what made main content read as assembled while the sidebar — nine
   registry primitives used as shipped — read as designed.

   These three rules hold the boundary. `src/web/components/page.tsx` is the one
   file allowed to name a heading size, because it is where the ladder lives;
   the registry's own files are exempt because they are hash-locked and are the
   scale everything else defers to.
   docs/done/2026-09-09-07-main-content-on-the-registry.md. */
const FRAME = "src/web/components/page.tsx"
const authored = files.filter(f => !f.path.startsWith("src/web/components/ui/"))

/* A list is the registry's own `ItemGroup` and `Item`, used as they ship.
   They were wrapped in a `RowGroup`/`Row` of ours that flattened the radius and
   divided the rows, which was itself an improvement on the same five classes
   copied twenty-two times — and still not the preset. The wrapper is gone. */
/* Anywhere in the file, not just on the tag: four pages hoisted the same five
   classes into a `const LIST` and a `const row`, which a tag-shaped rule walked
   straight past. A list style is a list style wherever it is written down. */
const inlineRows = authored
  .filter(f => f.path !== FRAME)
  .flatMap(f => [
    // Dividers are list styling wherever they are written — including hoisted
    // into a `const LIST`, which is how four pages kept theirs past a
    // tag-shaped rule.
    ...[...stripTsxComments(f.text).matchAll(/\bdivide-y\b/g)].map(() => `${f.path}: divide-y`),
    // `rounded-none` only where it flattens a row. A full-bleed Alert and a
    // line-variant TabsList use it legitimately, and squeezing those into this
    // rule would teach people to add exemptions rather than fix lists.
    ...[...stripTsxComments(f.text).matchAll(/<Item(?:Group)?\b[^>]*?\brounded-none\b/g)]
      .map(() => `${f.path}: rounded-none on a row`),
  ])
rule("a list is the registry's ItemGroup, not a box with dividers", inlineRows,
  `Inline list styling in src/web JSX:\n  ${inlineRows.join("\n  ")}\n\n` +
  `Use ItemGroup and Item as the registry ships them. They already carry the gap,\n` +
  `the radius, the border and the hover.`)

/* The registry decides how big its own title is. Twenty-three call sites said
   text-base on an ItemTitle whose own size is text-sm — one decision, taken
   twenty-three times without ever being taken once. */
const RESIZED = "ItemTitle|ItemDescription|CardTitle|CardDescription|SidebarGroupLabel"
const resized = authored
  .flatMap(f => [...stripTsxComments(f.text).matchAll(new RegExp(`<(${RESIZED})\\b[^>]*?className="[^"]*\\b(text-(?:xs|sm|base|lg|xl|2xl|3xl)|font-(?:normal|medium|semibold|bold))\\b`, "g"))]
    .map(m => `${f.path}: <${m[1]}> set to ${m[2]}`))
rule("no call site resizes a registry component's own title", resized,
  `Registry titles resized in src/web JSX:\n  ${resized.join("\n  ")}\n\n` +
  `Take the registry's size. If a different one is genuinely needed, give the component a\n` +
  `variant in ${FRAME} so it is decided once.`)

/* Headings come from PageHeader, SectionHeading and SubHeading. Seven were
   written by hand at three different sizes before those existed. */
const HEADINGS_ALLOWED: Record<string, string> = {
  // The error boundary renders when the app has crashed, deliberately outside
  // the sidebar, the topbar and the page frame — so it cannot take its heading
  // from a component that may be part of what just broke.
  "src/web/components/crash.tsx": "renders outside the app layout, by design",
}
const looseHeadings = authored
  .filter(f => f.path !== FRAME && !(f.path in HEADINGS_ALLOWED))
  .flatMap(f => [...stripTsxComments(f.text).matchAll(/<h([1-3])\b[^>]*className="[^"]*\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/g)]
    // The shared topbar now owns PageHeader's h1, using dashboard-01's
    // text-base title. Permit that one role; other headings and caption
    // overrides in the topbar remain subject to the same checks as pages.
    .filter(m => !(f.path === "src/web/components/topbar.tsx" && m[1] === "1" && m[0].endsWith("text-base")))
    .map(m => `${f.path}: <h${m[1]}> with its own size`))
rule("headings take their size from the page frame", looseHeadings,
  `Hand-sized headings in src/web JSX:\n  ${looseHeadings.join("\n  ")}\n\n` +
  `Use PageHeader, SectionHeading or SubHeading from ${FRAME}, which hold the ladder.`)

/* A secondary line is `Muted` (or the registry's own ItemDescription /
   CardDescription). Written by hand it was the same role at two sizes —
   `text-sm text-muted-foreground` 28 times and `text-xs` 4 more. */
const looseCaptions = authored
  .filter(f => f.path !== FRAME && !(f.path in HEADINGS_ALLOWED))
  .flatMap(f => [...stripTsxComments(f.text).matchAll(/\btext-(?:xs|sm) text-muted-foreground\b/g)]
    .map(() => f.path))
rule("a muted caption is Muted, not a size and a colour", [...new Set(looseCaptions)],
  `Hand-styled muted captions in src/web JSX:\n  ${[...new Set(looseCaptions)].join("\n  ")}\n\n` +
  `Use Muted from ${FRAME}, or ItemDescription/CardDescription inside a Row or Card.`)
