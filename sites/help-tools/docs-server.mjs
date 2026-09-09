import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerApplication } from './application.mjs';
export async function createDocsServer(read, application, cacheMs = 0) {
  const catalog = JSON.parse(await read('/help-index.json'));
  const pages = catalog.pages;
  const server = new McpServer({ name: 'remy-help', version: '1.0.0' }, { instructions: 'Read-only Remy Sport documentation. Cite source pages. Translations may be drafts. Never infer account data or privileges. Documentation is not live data; when application tools are available, use their timestamped responses for public events, teams and games.' });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const locale = z.enum(['en', 'th', 'ja']).default('en');
  const textResult = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
  server.registerTool('search_docs', { description: 'Search public help in a chosen language. Returns guide URLs and excerpts, not live account information.', inputSchema: { query: z.string().min(1).max(200), locale, limit: z.number().int().min(1).max(10).default(5) }, annotations }, async ({ query, locale, limit }) => {
    const needle = query.toLocaleLowerCase(locale).normalize('NFKC');
    const words = [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(needle)].filter(item => item.isWordLike).map(item => item.segment);
    const documents = await Promise.all(pages.filter(page => page.locale === locale).map(async page => {
      const markdown = await read(page.markdown);
      const content = markdown.toLocaleLowerCase(locale).normalize('NFKC');
      const title = page.title.toLocaleLowerCase(locale).normalize('NFKC');
      const description = (page.description ?? '').toLocaleLowerCase(locale).normalize('NFKC');
      const score = (title.includes(needle) ? 20 : 0) + (description.includes(needle) ? 12 : 0) + (content.includes(needle) ? 5 : 0) + words.filter(word => content.includes(word)).length;
      const index = content.indexOf(needle);
      return { ...page, score, excerpt: markdown.slice(Math.max(0, index - 60), Math.max(0, index - 60) + 450) };
    }));
    return textResult(documents.filter(page => page.score > 0).sort((a,b) => b.score - a.score).slice(0,limit));
  });
  server.registerTool('read_guide', { description: 'Read a guide by its exact catalogue URL, such as /en/sign-in. Arbitrary URLs and paths are rejected.', inputSchema: { path: z.string().max(200) }, annotations }, async ({ path }) => {
    const page = pages.find(page => page.url === path);
    if (!page) return { isError: true, ...textResult('Unknown guide. Use search_docs or the catalogue resource.') };
    return textResult(await read(page.markdown));
  });
  server.registerResource('catalogue', 'remy-help://catalogue', { description: 'All guide URLs and languages', mimeType: 'application/json' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(catalog) }] }));
  for (const page of pages) {
    server.registerResource(page.url, `remy-help://guide${page.url}`, { title: page.title, description: page.description, mimeType: 'text/markdown' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await read(page.markdown) }] }));
  }
  if (application) registerApplication(server, application, cacheMs);
  return server;
}
