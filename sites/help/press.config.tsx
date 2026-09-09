import { defineConfig } from "fumapress";
import { fumadocsMdx } from "fumapress/adapters/mdx";
import { pageSchema, metaSchema } from "fumapress/adapters/mdx/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { llmsPlugin } from "fumapress/plugins/llms.txt";
import { sitemapPlugin } from "fumapress/plugins/sitemap";
import { robotsPlugin } from "fumapress/plugins/robots";
import { flexsearchPlugin } from "fumapress/plugins/flexsearch";
import { linkValidationPlugin } from "fumapress/plugins/link-validation";
import { takumiPlugin } from "fumapress/plugins/takumi";
import { site } from "./site.mjs";
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
  site: { name: site.name, baseUrl: site.origin },
  meta: {
    root: () => <>
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <meta name="robots" content="noindex" />
      <meta property="og:site_name" content={site.name} />
    </>,
    page(page) {
      const url = new URL(page.url, site.origin).href;
      const markdownUrl = new URL(page.url === "/" ? "/index.md" : `${page.url}.md`, site.origin).href;
      const structured = {
        "@context": "https://schema.org", "@type": "WebPage",
        name: page.data.title, description: page.data.description, url,
        inLanguage: "en", dateModified: site.reviewedAt,
        isPartOf: { "@type": "WebSite", name: site.name, url: site.origin },
      };
      return <>
        <meta name="description" content={page.data.description} />
        <link rel="canonical" href={url} />
        <link rel="alternate" type="text/markdown" href={markdownUrl} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />
      </>;
    },
  },
}).adapters(fumadocsMdx()).plugins(
  {
    name: "remy-preserve-route-params",
    prepareCreatePages(fns) {
      const create = fns.createApiIsomorphic;
      fns.createApiIsomorphic = (route) => create({
        ...route,
        // Fumapress 1.2.0 mutates Markdown slugs; Waku reuses them.
        // FUMA-001: ../../docs/2026-09-09-05-fumapress-source-review.md
        // Remove only after verifying an upstream release fixes repeated requests.
        handler: (request, context) => route.handler(request, { params: structuredClone(context.params) }),
      });
      return fns;
    },
  },
  llmsPlugin({
    async getLLMText(page) {
      // Use the supported content adapter hook; keep prose and code from the
      // processed source without inventing a separate agent-only product manual.
      for (const adapter of this.adapters) {
        const text = await adapter["core:get-text"]?.call(this, page);
        if (text !== undefined) return `# ${page.data.title}\n\nSource: ${new URL(page.url, site.origin).href}\nProduct: Remy Sport\nReviewed: ${site.reviewedAt}\nStatus: local documentation preview; not a published release.\n\n${page.data.description}\n\n${text}`;
      }
      throw new Error(`Missing Markdown representation: ${page.url}`);
    },
  }),
  sitemapPlugin(), robotsPlugin(), flexsearchPlugin(),
  linkValidationPlugin({ report: "both" }),
  takumiPlugin(),
);
