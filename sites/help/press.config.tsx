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
import { translations, languages } from "./i18n";
import mdxComponents, { createRelativeLink } from "fumadocs-ui/mdx";
import { Steps, Step } from "fumadocs-ui/components/steps";
import { Tabs, Tab } from "fumadocs-ui/components/tabs";
import { Troubleshooter } from "./src/components/troubleshooter";
import { blogPlugin } from "fumapress/plugins/blog";
import { rssPlugin } from "fumapress/plugins/rss";
import { createOpenAPI } from "fumadocs-openapi/server";
import { openapiPlugin } from "fumapress/plugins/openapi";
import fonts from "./assets/fonts/fonts.json";
import schema from "./schema/openapi.json";
import { z } from "zod";
import { site } from "./site.mjs";
import "./src/app.css";

const docs = defineDocs({
  dir: "content",
  docs: { schema: pageSchema.extend({ kind: z.string().optional(), date: z.string().optional(), tags: z.array(z.string()).optional() }), postprocess: { includeProcessedMarkdown: {
    stringify(node, _parent, state, info) {
      if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") return;
      const attr = name => node.attributes.find(item => item.type === "mdxJsxAttribute" && item.name === name)?.value;
      const title = attr("title");
      const href = attr("href");
      const heading = typeof title === "string" ? (typeof href === "string" ? `[${title}](${href})` : `**${title}**`) : "";
      // Keep tutorial prose, links and tab headings; the interactive checklist
      // has a complete static equivalent directly below it in each language.
      return `${heading}\n\n${state.containerFlow(node, info) || ""}\n`;
    },
  } } },
  meta: { schema: metaSchema },
});

const openapi = createOpenAPI({ input: { help: schema } });
const apiSource = await openapi.staticSource({ baseDir: "api-reference" });
// The reference uses the same public protocol in each locale. Keep technical
// operation names stable; translated introductory guides explain its scope.
apiSource.files = apiSource.files.flatMap(file => languages.map(locale => ({
  ...file, path: file.path.replace(/\.mdx?$/, locale === "en" ? ".mdx" : `.${locale}.mdx`),
})));

export default defineConfig({
  mode: "static",
  preset: false,
  content: { docs: docs.toFumadocsSource(), api: apiSource },
  translations,
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
        inLanguage: page.locale, dateModified: site.reviewedAt,
        isPartOf: { "@type": "WebSite", name: site.name, url: site.origin },
      };
      return <>
        <meta name="description" content={page.data.description} />
        <link rel="canonical" href={url} />
        {languages.map(lang => <link key={lang} rel="alternate" hrefLang={lang} href={new URL(`/${lang}${page.url.replace(/^\/(en|th|ja)/, "")}`, site.origin).href} />)}
        <link rel="alternate" type="text/markdown" href={markdownUrl} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />
      </>;
    },
  },
 }).adapters(fumadocsMdx({ async getMdxComponents(page) {
  return { ...mdxComponents, a: createRelativeLink(await this.getLoader(), page), Steps, Step, Tabs, Tab, Troubleshooter };
} }), {
  "core:get-text"(page) {
    if ("getSchema" in page.data) return `${page.data.description ?? ""}\n\nPublic help retrieval only.\n\n\`\`\`json\n${JSON.stringify(page.data.getSchema().bundled, null, 2)}\n\`\`\``;
  },
}).plugins(
  {
    name: "remy-preserve-route-params",
    prepareCreatePages(fns) {
      const create = fns.createApiIsomorphic;
      fns.createApiIsomorphic = (route) => create({
        ...route,
        // Fumapress 1.2.0 mutates Markdown slugs; Waku reuses them.
        // FUMA-001: ../../docs/2026-09-09-05-fumapress-source-review.md
        // Remove only after verifying an upstream release fixes repeated requests.
        handler: async (request, context) => {
          if (route.path === "/llms.txt") {
            const pages = (await this.getLoader()).getPages();
            return new Response(`# Remy Sport Help\n\nReviewed: ${site.reviewedAt}. Local preview; Thai/Japanese translations await human review.\n\n${languages.map(lang => `## ${lang}\n\n${pages.filter(page => page.locale === lang).map(page => `- [${page.data.title}](${page.url}): ${page.data.description}`).join("\n")}`).join("\n\n")}`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
          }
          return route.handler(request, { params: structuredClone(context.params) });
        },
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
  {
    name: "remy-public-catalogue",
    async createPages({ createApiIsomorphic, createPage }) {
      createPage({ path: "/", render: "static", component: () => <main className="mx-auto max-w-3xl p-12"><h1 className="text-4xl font-bold">Remy Sport Help</h1><p className="my-6">Choose your language / เลือกภาษา / 言語を選択</p><nav className="flex gap-8"><a href="/en">English</a><a href="/th">ไทย</a><a href="/ja">日本語</a></nav></main> });
      createApiIsomorphic({ path: "/openapi.json", render: "static", handler: async () => Response.json(schema) });
      createApiIsomorphic({ path: "/help-index.json", render: "static", handler: async () => Response.json({ product: site.name, reviewedAt: site.reviewedAt, pages: (await this.getLoader()).getPages().map(page => ({ url: page.url, markdown: `${page.url}.md`, locale: page.locale, title: page.data.title, description: page.data.description })) }) });
    },
  },
  openapiPlugin({ server: openapi, createProxy: false }),
  blogPlugin({ isBlog: page => page.data.kind === "news", paths: { index: "/updates", tags: "/updates/tags" } }),
  rssPlugin({ title: "Remy Sport Help Updates", description: "Local documentation milestones; not app release announcements", getItem(page) {
    if (page.data.kind !== "news" || page.locale !== "en") return;
    return { title: page.data.title, description: page.data.description, link: new URL(page.url, site.origin).href, pubDate: page.data.date, categories: page.data.tags };
  } }),
  sitemapPlugin(), robotsPlugin(), flexsearchPlugin(),
  linkValidationPlugin({ report: "both" }),
  takumiPlugin({ generate(page) {
    const subset = fonts[page.locale];
    return {
      node: <div style={{ display: "flex", flexDirection: "column", padding: 64, width: "100%", height: "100%", background: "#101a20", color: "#f5f7fa", fontFamily: subset?.family, borderBottom: "18px solid #6ee7b7" }}>
        <div style={{ fontSize: 28, color: "#6ee7b7", marginBottom: 28 }}>REMY SPORT · HELP · {page.locale.toUpperCase()}</div>
        <div style={{ fontSize: 60, lineHeight: 1.25, marginBottom: 28 }}>{page.data.title}</div>
        <div style={{ fontSize: 30, lineHeight: 1.45, color: "#c7d3d9" }}>{page.data.description}</div>
        <div style={{ fontSize: 22, marginTop: "auto", color: "#6ee7b7" }}>GUIDES · REMY SPORT</div>
      </div>,
      options: subset ? { fonts: subset.fonts.map(font => ({ name: font.name, weight: font.weight, data: Buffer.from(font.data, "base64") })) } : {},
    };
  } }),
);
