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
  /**
   * The view-model layer, which `jsx-no-literals` cannot see.
   *
   * That rule walks JSX, and `src/web/lib/api.ts` has none — it is plain
   * TypeScript that MANUFACTURES the strings JSX later renders. That is exactly
   * where `statusLabel` returned "Live now", "Finished" and "Registration open"
   * as literals, so every Thai event card carried an English status chip. The
   * JSX rule was green throughout, because there was no JSX involved.
   *
   * So: a string literal in a `return` is an error here. That is narrow on
   * purpose — it is the shape a label takes on its way to the screen, and it
   * does not object to a literal used as a key, a code, a class name or a
   * comparison, which is most of what this layer otherwise does.
   *
   * It cannot catch a label built by concatenation or assigned to a variable
   * first, and pretending otherwise would be the bullshit. What it does catch
   * is the exact shape that shipped.
   */
  {
    files: ["src/web/lib/api.ts", "src/web/lib/localizer.ts", "src/web/lib/devices.ts"],
    languageOptions: { parser: tsParser, parserOptions: { sourceType: "module" } },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ReturnStatement > Literal[value=/[A-Za-z]{2,}\\s+[A-Za-z]{2,}/]",
          message:
            "A user-visible string returned from the view-model layer. Wrap it in a paraglide message — this is where statusLabel shipped 'Live now' to every Thai reader.",
        },
      ],
    },
  },
]
