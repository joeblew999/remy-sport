import { compile, type CompilerOptions } from "@inlang/paraglide-js"
import { resolve } from "node:path"

/** Shared by build preparation and Vite so typechecking a fresh checkout sees
 * the same generated messages and locale strategy that the application uses.
 * Message modules keep locale switches synchronous, avoiding an English flash.
 */
export const i18nOptions = {
  project: resolve(import.meta.dirname, "../../project.inlang"),
  outdir: resolve(import.meta.dirname, "../../src/paraglide"),
  outputStructure: "message-modules",
  cookieName: "remy_locale",
  strategy: ["localStorage", "cookie", "preferredLanguage", "baseLocale"],
} satisfies CompilerOptions

if (import.meta.main) await compile(i18nOptions)
