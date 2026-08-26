/**
 * Print every outstanding follow-up recorded in the ADRs, in one list.
 *
 * The items were always written down — the ADRs have carried a **Follow-ups**
 * section since 009. They were just spread across eleven files, so nobody could
 * see the whole thing at once, and a backlog you cannot look at reads as "lots
 * of tech debt" rather than as a list.
 *
 * Deliberately NOT a generated file. A committed follow-ups.md is one more
 * artifact that can go stale, which is the exact failure ADR 020 exists to
 * stop. This reads the ADRs live, so it cannot disagree with them.
 *
 * Closing an item means deleting its bullet from the ADR that owns it. That
 * keeps the ADR honest as a record of what is still outstanding, rather than
 * an archive of everything ever considered.
 */

import { readdirSync, readFileSync } from "fs"
import { join, resolve } from "path"

const ADR_DIR = resolve(import.meta.dir, "../docs/dev/adr")

interface Item {
  adr: string
  title: string
  text: string
}

const items: Item[] = []

for (const file of readdirSync(ADR_DIR).filter((f) => f.endsWith(".md")).sort()) {
  const body = readFileSync(join(ADR_DIR, file), "utf-8")
  const title = body.split("\n")[0]!.replace(/^#\s*/, "")

  // From the **Follow-ups** heading to the next heading of any kind. Bullets
  // may wrap, so continuation lines are folded into the item above.
  const section = body.split(/^\*\*Follow-ups\*\*\s*$/m)[1]
  if (!section) continue
  const untilNextHeading = section.split(/^(?:##\s|\*\*[A-Z])/m)[0]!

  let current: string | null = null
  for (const line of untilNextHeading.split("\n")) {
    if (/^-\s+/.test(line)) {
      if (current) items.push({ adr: file, title, text: current })
      current = line.replace(/^-\s+/, "").trim()
    } else if (current && line.trim()) {
      current += " " + line.trim()
    } else if (current && !line.trim()) {
      items.push({ adr: file, title, text: current })
      current = null
    }
  }
  if (current) items.push({ adr: file, title, text: current })
}

/** Strip markdown so a terminal list stays readable. */
const plain = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")

let lastAdr = ""
for (const item of items) {
  if (item.adr !== lastAdr) {
    console.log(`\n${plain(item.title)}`)
    lastAdr = item.adr
  }
  const text = plain(item.text)
  // Wrap at 96 so long items stay legible next to their ADR heading.
  const wrapped = text.replace(/(.{1,92})(\s|$)/g, "    $1\n").trimEnd()
  console.log(wrapped.replace(/^ {4}/, "  · "))
}

console.log(
  `\n${items.length} outstanding follow-ups across ${new Set(items.map((i) => i.adr)).size} ADRs.` +
    `\nClose one by deleting its bullet from the ADR that owns it.`,
)
