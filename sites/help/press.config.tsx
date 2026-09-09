import { defineConfig } from "fumapress";
import { fumadocsMdx } from "fumapress/adapters/mdx";
import { pageSchema, metaSchema } from "fumapress/adapters/mdx/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { llmsPlugin } from "fumapress/plugins/llms.txt";
import { sitemapPlugin } from "fumapress/plugins/sitemap";
import { robotsPlugin } from "fumapress/plugins/robots";
import { flexsearchPlugin } from "fumapress/plugins/flexsearch";
import { linkValidationPlugin } from "fumapress/plugins/link-validation";
import "./src/app.css";

const docs = defineDocs({
  dir: "content",
  docs: { schema: pageSchema, postprocess: { includeProcessedMarkdown: true } },
  meta: { schema: metaSchema },
});

export default defineConfig({
  mode: "static",
  preset: false,
  content: docs.toFumadocsSource(),
  // Reserved domain: this proof does not choose or publish a production host.
  site: { name: "Remy Sport Help — isolation proof", baseUrl: "https://help.remy.invalid" },
}).adapters(fumadocsMdx()).plugins(
  llmsPlugin(), sitemapPlugin(), robotsPlugin(), flexsearchPlugin(), linkValidationPlugin(),
);
