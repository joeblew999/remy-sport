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
    [...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((attr) => [attr[1], decode(attr[2])]),
  ));
}
async function get(path, type) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(8000) });
  assert.equal(response.status, 200, `${path}: HTTP status`);
  assert(response.headers.get("content-type")?.includes(type), `${path}: content type ${type}`);
  assert(response.headers.get("x-robots-tag")?.includes("noindex"), `${path}: preview noindex`);
  return response;
}

const slugs = (await readdir(resolve(root, "content"))).filter((file) => file.endsWith(".mdx")).map((file) => file.slice(0, -4)).sort();
const paths = slugs.map((slug) => slug === "index" ? "/" : `/${slug}`);
const llms = await (await get("/llms.txt", "text/plain")).text();
assert(llms.startsWith("# Remy Sport Help"), "LLM index identifies the product");
assert(llms.includes("2026-09-09"), "LLM index includes review context");
const full = await (await get("/llms-full.txt", "text/plain")).text();
const sitemap = await (await get("/sitemap.xml", "xml")).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1])).sort();
assert.deepEqual(urls, paths.map((path) => new URL(path, site.origin).href).sort(), "sitemap contains exactly the public guides");
const robots = await (await get("/robots.txt", "text/plain")).text();
assert(robots.includes(`Sitemap: ${site.origin}/sitemap.xml`), "robots advertises the correct sitemap");

const pages = [];
for (const [index, path] of paths.entries()) {
  const slug = slugs[index];
  const html = await (await get(path, "text/html")).text();
  const contentOnly = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "");
  assert.equal((contentOnly.match(/<h1\b/g) ?? []).length, 1, `${path}: one visible main heading`);
  assert(/<html\b[^>]*lang="en"/.test(html), `${path}: English language declared`);
  const titles = [...html.matchAll(/<title>([^<]+)<\/title>/g)];
  assert.equal(titles.length, 1, `${path}: one title`);
  const title = decode(titles[0][1]);
  const metas = tags(html, "meta");
  const meta = (key) => metas.find((item) => item.name === key || item.property === key)?.content;
  const description = meta("description");
  assert(description?.length >= 50 && description.length <= 180, `${path}: useful description`);
  assert.equal(meta("og:title"), title, `${path}: Open Graph title`);
  assert.equal(meta("og:description"), description, `${path}: Open Graph description`);
  const url = new URL(path, site.origin).href;
  const links = tags(html, "link");
  assert.deepEqual(links.filter((link) => link.rel === "canonical").map((link) => link.href), [url], `${path}: canonical`);
  assert.equal(meta("og:url"), url, `${path}: social canonical`);
  assert(links.some((link) => link.rel === "icon" && link.href === "/favicon.svg"), `${path}: favicon`);
  assert(links.some((link) => link.rel === "alternate" && link.type === "text/markdown" && link.href === `${site.origin}/${slug}.md`), `${path}: Markdown discovery`);
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  assert(jsonLd.some((item) => item["@type"] === "WebPage" && item.name === title && item.url === url && item.description === description), `${path}: structured data matches visible content`);
  const imagePath = new URL(meta("og:image")).pathname;
  const image = Buffer.from(await (await get(imagePath, "image/webp")).arrayBuffer());
  assert.equal(image.subarray(0, 4).toString(), "RIFF", `${path}: generated image signature`);
  assert.equal(image.subarray(8, 12).toString(), "WEBP", `${path}: generated WebP`);
  assert.equal(meta("og:image:width"), "1200");
  assert.equal(meta("og:image:height"), "630");
  const markdown = await (await get(`/${slug}.md`, "text/markdown")).text();
  assert(markdown.startsWith(`# ${title}\n`), `${path}: readable Markdown heading`);
  assert(markdown.includes(`Source: ${url}`) && markdown.includes(`Reviewed: ${site.reviewedAt}`), `${path}: source and review context`);
  assert(!/<(?:script|[A-Z][A-Za-z]*)\b/.test(markdown), `${path}: no executable/unrendered MDX in Markdown`);
  assert(full.includes(markdown), `${path}: full LLM text includes the exact page`);
  assert(llms.includes(`](${path})`), `${path}: linked by the LLM index`);
  assert(decode(contentOnly).includes(description), `${path}: description is present without JavaScript`);
  assert(!full.includes("/Users/") && !full.includes("BETTER_AUTH_SECRET"), "LLM text has no build path or app binding names");
  pages.push({ path, title, htmlBytes: Buffer.byteLength(html), markdownBytes: Buffer.byteLength(markdown), imageBytes: image.length });
}
const search = await (await get("/api/search", "application/json")).json();
assert.equal(search.type, "default", "static English search index");
assert(paths.every((path) => JSON.stringify(search).includes(path)), "every guide appears in search data");
for (const path of ["/not-a-page", "/api/auth/session", "/rpc", "/mcp", "/AGENTS.md"]) {
  assert.equal((await fetch(base + path, { signal: AbortSignal.timeout(8000) })).status, 404, `${path}: no app/private/runtime endpoint`);
}
await get("/favicon.svg", "image/svg+xml");
// Compare the served index with the artifact, catching a preview of stale output.
assert.equal(await readFile(resolve(publicDir, "llms.txt"), "utf8"), llms);
await mkdir(resolve(root, ".proof"), { recursive: true });
await writeFile(resolve(root, ".proof/seo-llm.json"), JSON.stringify({ checkedAt: new Date().toISOString(), scope: "local generated output; preview remains noindex", pages, llmsBytes: Buffer.byteLength(llms), fullBytes: Buffer.byteLength(full), checks: "passed" }, null, 2));
console.log(`docs audit: ${pages.length} pages passed HTML, metadata, canonical, JSON-LD, social image, Markdown, sitemap and endpoint checks`);
