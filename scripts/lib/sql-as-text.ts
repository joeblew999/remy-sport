import type { Plugin } from "vite"

/**
 * `.sql` imports as text.
 *
 * src/db/seed.ts does `import seedSql from "./seed.sql"`. wrangler's module
 * rules (`[[rules]] type = "Text"` in wrangler.toml) make that the file's
 * contents when wrangler bundles the Worker, and workerd in the test pool sees
 * the same. Vite has no such rule and would try to parse the SQL as
 * JavaScript, so the Vite build of the Worker, and the repo tests that import
 * it, say it here. `pre`, so it runs before import analysis.
 */
export const sqlAsText: Plugin = {
  name: "sql-as-text",
  enforce: "pre",
  transform(code, id) {
    if (id.endsWith(".sql")) return { code: `export default ${JSON.stringify(code)}`, map: null }
    return null
  },
}
