import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

// Shared by the repository check and the generated domain coverage report.
export const BLOCKED: Record<string, string> = {
  /**
   * The three bracket actions are parked on a *format*, not on a decision.
   *
   * Asked and answered on 2026-09-04, from the Product Owner's own research
   * rather than from an opinion. Of 66 events catalogued in
   * remy-sport-biz/research/events-raw, twelve are 5x5 — the pilot's only
   * format. **One** states a knockout, and not a plain one: "5x5, knockout with
   * second-chance round — minimum 2 guaranteed games per team". One states
   * round-robin. The other ten state no format at all.
   *
   * What repeats across the catalogue is not the shape of the draw but a floor
   * on it: "minimum 2 guaranteed games", "3 games guaranteed per team", "round
   * robin, 3 games per team". Parents paying for a day want their child to play
   * more than once, which is exactly why the one knockout bolts a second chance
   * onto it — and why a single-elimination bracket would not model it anyway.
   *
   * Knockouts are everywhere in 3x3 ("single elimination, 16 teams per
   * category"), and 3x3 is outside PILOT_SCOPE. So these wait on a format the
   * platform does not run yet. That is why they are parked and not deleted, and
   * it is a different reason from the one the AI actions had.
   */
  VIEW_BRACKET: "no bracket table — a knockout draw is structure the schema does not have",
  GENERATE_BRACKETS: "no bracket table",
  AI_BRACKET_SUGGESTIONS: "no bracket table — parked with the other three",
  VIEW_RANKINGS_HISTORY:
    "PLATFORM-scoped: rankings across events over time. Standings are per event and division, " +
    "so there is no cross-event ranking to have a history of",
  MODERATE_LISTINGS:
    "no listing entity, no event status vocabulary, and no moderation state on any table — " +
    "building it means inventing both the noun and the verb",
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
