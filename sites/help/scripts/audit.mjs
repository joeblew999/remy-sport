import assert from "node:assert/strict";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { site } from "../site.mjs";

const root = resolve(import.meta.dirname, "..");
const publicDir = resolve(root, "dist/public");
const base = process.argv.find((arg) => arg.startsWith("http://127.0.0.1:"));
assert(base, "audit must run against the local preview started by ops docs");
const decode = (value) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "g"))].map((match) => Object.fromEntries(
    [...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((attr) => [attr[1].toLowerCase(), decode(attr[2])]),
  ));
}
async function get(path, type) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(8000) });
  assert.equal(response.status, 200, `${path}: HTTP status`);
  assert(response.headers.get("content-type")?.includes(type), `${path}: content type ${type}`);
  assert.equal(response.headers.get("x-robots-tag")?.includes("noindex") ?? false, site.environment !== "production", `${path}: environment index policy`);
  return response;
}

const catalog = await (await get("/help-index.json", "application/json")).json();
const paths = catalog.pages.map(page => page.url);
assert.equal(new Set(paths).size, paths.length, "unique catalogue routes");
const sourceFiles = (await readdir(resolve(root, "content"), { recursive: true })).filter(file => file.endsWith(".mdx"));
const expected = sourceFiles.map(file => {
  const match = file.match(/^(.*?)(?:\.(th|ja))?\.mdx$/);
  return `/${match[2] ?? "en"}${match[1] === "index" ? "" : `/${match[1].replace(/\/index$/, "")}`}`;
});
assert(expected.every(path => paths.includes(path)), "every source guide is in the catalogue");
assert.equal(paths.length, expected.length + 6, "source guides plus two API operations in three locales");
const llms = await (await get("/llms.txt", "text/plain")).text();
assert(llms.includes("Remy Sport"), "LLM index identifies the product");

const full = await (await get("/llms-full.txt", "text/plain")).text();
const sitemap = await (await get("/sitemap.xml", "xml")).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1])).sort();
assert(paths.every(path => urls.includes(new URL(path, site.origin).href)), "sitemap includes all public guides");
const robots = await (await get("/robots.txt", "text/plain")).text();
assert(robots.includes(`Sitemap: ${site.origin}/sitemap.xml`), "robots advertises the correct sitemap");

const pages = [];
for (const record of catalog.pages) {
  const { url: path, locale } = record;
  const html = await (await get(path, "text/html")).text();
  const contentOnly = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "");
  assert.equal((contentOnly.match(/<h1\b/g) ?? []).length, 1, `${path}: one visible main heading`);
  assert.equal(tags(html, "html")[0].lang, locale, `${path}: language declared`);
  const titles = [...html.matchAll(/<title>([^<]+)<\/title>/g)];
  assert.equal(titles.length, 1, `${path}: one title`);
  const title = decode(titles[0][1]);
  const metas = tags(html, "meta");
  const meta = (key) => metas.find((item) => item.name === key || item.property === key)?.content;
  const description = meta("description");
  assert(description?.length >= 15 && description.length <= 500, `${path}: useful description`);
  assert.equal(meta("og:title"), title, `${path}: Open Graph title`);
  assert.equal(meta("og:description"), description, `${path}: Open Graph description`);
  const url = new URL(path, site.origin).href;
  const links = tags(html, "link");
  assert.deepEqual(links.filter((link) => link.rel === "canonical").map((link) => link.href), [url], `${path}: canonical`);
  assert.equal(meta("og:url"), url, `${path}: social canonical`);
  assert(links.some((link) => link.rel === "icon" && link.href === "/favicon.svg"), `${path}: favicon`);
  assert(links.some((link) => link.rel === "alternate" && link.type === "text/markdown" && link.href === `${site.origin}${record.markdown}`), `${path}: Markdown discovery`);
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  assert(jsonLd.some((item) => item["@type"] === "WebPage" && item.name === title && item.url === url && item.description === description), `${path}: structured data matches visible content`);
  const imagePath = new URL(meta("og:image")).pathname;
  const image = Buffer.from(await (await get(imagePath, "image/webp")).arrayBuffer());
  assert.equal(image.subarray(0, 4).toString(), "RIFF", `${path}: generated image signature`);
  assert.equal(image.subarray(8, 12).toString(), "WEBP", `${path}: generated WebP`);
  assert.equal(meta("og:image:width"), "1200");
  assert.equal(meta("og:image:height"), "630");
  const markdown = await (await get(record.markdown, "text/markdown")).text();
  assert(markdown.startsWith(`# ${title}\n`), `${path}: readable Markdown heading`);
  assert(markdown.includes(`Source: ${url}`) && markdown.includes(`Reviewed: ${site.reviewedAt}`), `${path}: source and review context`);
  assert(!/<(?:script|[A-Z][A-Za-z]*)\b/.test(markdown), `${path}: no executable/unrendered MDX in Markdown`);
  assert(full.includes(markdown), `${path}: full LLM text includes the exact page`);
  assert(llms.includes(`](${path})`), `${path}: linked by the LLM index`);
  assert(decode(contentOnly).includes(description), `${path}: description is present without JavaScript`);
  assert(!full.includes("/Users/") && !full.includes("BETTER_AUTH_SECRET"), "LLM text has no build path or app binding names");
  for (const lang of ["en", "th", "ja"]) {
    assert(links.some(link => link.rel === "alternate" && link.hreflang === lang && link.href === new URL(path.replace(/^\/(en|th|ja)/, `/${lang}`), site.origin).href), `${path}: ${lang} alternate`);
  }
  pages.push({ path, locale, title, htmlBytes: Buffer.byteLength(html), markdownBytes: Buffer.byteLength(markdown), imageBytes: image.length });
}
const search = await (await get("/api/search", "application/json")).json();
assert.equal(search.type, "i18n", "locale-aware static search index");
assert.deepEqual(Object.keys(search.raw).sort(), ["en", "ja", "th"]);
assert(paths.every((path) => JSON.stringify(search).includes(path)), "every guide appears in search data");
for (const path of ["/not-a-page", "/api/auth/session", "/rpc", ...(process.argv.includes("--worker") ? [] : ["/mcp"]), "/AGENTS.md"]) {
  assert.equal((await fetch(base + path, { signal: AbortSignal.timeout(8000) })).status, 404, `${path}: no app/private/runtime endpoint`);
}
await get("/favicon.svg", "image/svg+xml");
const rss = await (await get("/rss.xml", "xml")).text();
assert(rss.includes("<item>") && rss.includes("2026") && rss.includes("/en/news/local-help-preview"), "dated RSS release with source link");
const schema = await (await get("/openapi.json", "application/json")).json();
assert.deepEqual(Object.keys(schema.paths).sort(), ["/help-index.json", "/llms-full.txt"]);
assert(Object.values(schema.paths).every(item => Object.keys(item).join() === "get"), "schema is read-only");
for (const locale of ["en", "th", "ja"]) {
  for (const route of ["updates", "updates/tags"]) await get(`/${locale}/${route}`, "text/html");
}
// Parameters must stay reusable: this also runs against dev in its readiness checks.
for (let i = 0; i < 3; i++) await get("/en.md", "text/markdown");
// Compare the served index with the artifact, catching a preview of stale output.
assert.equal(await readFile(resolve(publicDir, "llms.txt"), "utf8"), llms);
await mkdir(resolve(root, ".proof"), { recursive: true });
await writeFile(resolve(root, ".proof/seo-llm.json"), JSON.stringify({ checkedAt: new Date().toISOString(), scope: `local ${site.environment} artifact; indexable: ${site.environment === "production"}`, pages, llmsBytes: Buffer.byteLength(llms), fullBytes: Buffer.byteLength(full), checks: "passed" }, null, 2));
console.log(`docs audit: ${pages.length} pages passed HTML, metadata, canonical, JSON-LD, social image, Markdown, sitemap and endpoint checks`);
