import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

// Shared by the repository check and the generated domain coverage report.
export const BLOCKED: Record<string, string> = {
  // Decision 006 supplies the rules. Schema/API/UI implementation is still missing.
  VIEW_BRACKET: "Decision 006 accepted; persisted draw/view implementation pending",
  GENERATE_BRACKETS: "Decision 006 accepted; pool/championship generation implementation pending",
  AI_BRACKET_SUGGESTIONS: "Decision 006 accepted; validated suggestion and review pipeline pending",
  VIEW_RANKINGS_HISTORY: "Decision 006 accepted; cross-event team Elo and revisioned history pending",
  MODERATE_LISTINGS: "Decision 006 accepted; event publication, revisions and visibility implementation pending",
}

/**
 * Granted, buildable today, and nobody has built it.
 *
 * A different thing from `BLOCKED`, and worth keeping separate: these need no
 * model change and no decision from the Product Owner — only somebody to do
 * them. Collapsing the two lists would let "we cannot" hide work that is really
 * "we have not", which is the honest half of a coverage number.
 */
export const NOT_BUILT: Record<string, string> = {
  // Empty, and worth keeping. It held four entries when this check was written;
  // two of those turned out to be built already and badly measured, and the
  // other two — a teams directory and an admin creating an account — were built
  // the same day rather than left in a list. An empty list is the state to
  // return to, not a reason to delete the mechanism.
}

/** Every `@answers` tag under src/web, and the file that carries it. */
export function declared(): Map<string, string[]> {
  const found = new Map<string, string[]>()

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      if (!/\.tsx?$/.test(name)) continue
      const lines = readFileSync(path, "utf8").split("\n")

      /**
       * A tag may wrap. A screen answering seven actions on one line is a line
       * nobody can read, and the first version of this silently dropped
       * everything after the wrap — the check went green while two actions had
       * no screen. So continuation lines count: after `@answers`, every
       * following line that is only codes and commas belongs to the same tag.
       */
      for (let i = 0; i < lines.length; i++) {
        const start = /@answers\s+(.*)$/.exec(lines[i]!)
        if (!start) continue

        let text = start[1]!
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j]!.replace(/^\s*\*?/, "").trim()
          // Only codes and separators continue a tag. A blank comment line, a
          // sentence, or `*/` ends it.
          if (!next || !/^[A-Z0-9_,\s]+$/.test(next)) break
          text += " " + next
        }

        for (const code of text.replace(/\*\/.*$/, "").split(/[,\s]+/).filter(Boolean)) {
          found.set(code, [...(found.get(code) ?? []), path])
        }
      }
    }
  }

  walk("src/web")
  return found
}
