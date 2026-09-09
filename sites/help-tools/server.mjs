import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

export function validateSource(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('Expected a loopback help origin');
  return url.origin;
}
export async function createDocsServer(source) {
  const base = validateSource(source);
  async function read(path) {
    const result = await fetch(base + path, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!result.ok) throw new Error(`Help retrieval failed: ${result.status}`);
    const text = await result.text();
    if (text.length > 2_000_000) throw new Error('Help response too large');
    return text;
  }
  const catalog = JSON.parse(await read('/help-index.json'));
  const pages = catalog.pages;
  const server = new McpServer({ name: 'remy-help', version: '1.0.0' }, { instructions: 'Read-only Remy Sport documentation. Cite source pages. Local preview; translations may be drafts. Never infer account data, live scores or privileges.' });
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
      const score = (title.includes(needle) ? 20 : 0) + (content.includes(needle) ? 5 : 0) + words.filter(word => content.includes(word)).length;
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
  return server;
}

export async function startServer({ source, port = 8792 }) {
  validateSource(source);
  const http = createServer(async (req, res) => {
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? '') || req.headers.origin) { res.writeHead(403).end(); return; }
    if (req.url === '/health' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"service":"remy-help-mcp"}'); return; }
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    let server;
    let transport;
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) { res.writeHead(413).end(); return; } chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      server = await createDocsServer(source);
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) res.writeHead(error instanceof SyntaxError ? 400 : 503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Help service unavailable or invalid request' }));
      await transport?.close(); await server?.close();
    }
  });
  await new Promise((resolve, reject) => { http.once('error', reject); http.listen(port, '127.0.0.1', resolve); });
  return http;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const http = await startServer({ source: process.argv[2] ?? 'http://127.0.0.1:8791', port: Number(process.argv[3] ?? 8792) });
  console.log(`docs: MCP ready at http://127.0.0.1:${http.address().port}/mcp`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { http.close(); http.closeAllConnections(); });
}
