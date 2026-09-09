import { defineConfig, type Plugin } from "vite";
import press from "fumapress/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import tailwindcss from "@tailwindcss/vite";
import { isAbsolute, relative, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

// Fail the content build if a Vite module is loaded from the app or its install.
// This is dependency isolation, not an OS sandbox for malicious build scripts.
const root = import.meta.dirname;
const loaded = new Set<string>();
const boundary: Plugin = {
  name: "remy-help-package-boundary",
  enforce: "pre",
  load(id) {
    const file = id.split("?")[0];
    if (!file || !isAbsolute(file) || file.startsWith("/@")) return;
    const rel = relative(root, file);
    if (rel.startsWith("../") || isAbsolute(rel)) throw new Error(`Help build escaped its package: ${file}`);
    loaded.add(rel);
  },
  closeBundle() {
    mkdirSync(resolve(root, ".proof"), { recursive: true });
    writeFileSync(resolve(root, ".proof/modules.json"), JSON.stringify([...loaded].sort(), null, 2));
  },
};

export default defineConfig({
  root,
  cacheDir: ".vite",
  plugins: [boundary, press({ adapter: "waku/adapters/cloudflare" }), fumadocsMdx(), tailwindcss()],
});
