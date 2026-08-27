/**
 * One job: no user-visible string may be written directly into the UI.
 *
 * This is not a general lint setup and should not become one. Every rule below
 * earns its place by catching a class this repo has actually shipped.
 *
 * ── Why a linter at all ──
 *
 * `check-messages.ts` verifies that every released locale carries every
 * message, and reports 147/147. That is true, and it is the wrong question: it
 * cannot see a string that was never a message. It returned green while ~99
 * hardcoded English strings shipped — an English status chip on every Thai
 * event card, English column headers on the admin console, "Venue TBC" inside a
 * Thai sentence.
 *
 * The first attempt at catching that was a regex scanner over the source. It
 * was rightly called slop: text matching cannot tell a person's name in a
 * fixture from a label on a button, so it reported "Phongphan" and `Promise<T>`
 * as untranslated copy. A check that is mostly false positives gets ignored and
 * takes the real findings with it — mise.toml says exactly that about
 * check:dead, and it was already the lesson here.
 *
 * `react/jsx-no-literals` is not a heuristic. It walks the AST and flags a
 * JSXText node — a string in a *rendered position*. It cannot confuse that with
 * a comment, a type, an identifier, a className or a data-testid, because those
 * are different nodes. That is the difference between guessing and knowing, and
 * it is why this is a linter's job rather than a script's.
 */

import react from "eslint-plugin-react"
import tsParser from "@typescript-eslint/parser"

export default [
  {
    files: ["src/web/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: { react },
    settings: { react: { version: "detect" } },
    rules: {
      /**
       * A literal in a rendered position is a string no translator will ever
       * see. `allowedStrings` is for glyphs and separators that are the same in
       * every language — an em dash is not English.
       */
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          allowedStrings: ["—", "–", "·", "/", "|", ":", "×", "→", "←", "↗", "↻", "+", "-", "?", "*"],
          ignoreProps: true,
          noAttributeStrings: false,
        },
      ],
    },
  },
]
