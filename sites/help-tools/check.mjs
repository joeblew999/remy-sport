import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startServer, validateSource } from './server.mjs';
const source = process.argv[2];
assert.throws(() => validateSource('https://example.com'));
assert.throws(() => validateSource('http://127.0.0.1:8787/api'));
const http = await startServer({ source, port: 0 });
const base = `http://127.0.0.1:${http.address().port}`;
const client = new Client({ name: 'remy-help-check', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp')));
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['read_guide', 'search_docs']);
  assert(tools.tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
  const resources = await client.listResources();
  assert(resources.resources.some(resource => resource.uri === 'remy-help://catalogue'));
  const catalogue = await client.readResource({ uri: 'remy-help://catalogue' });
  assert(JSON.parse(catalogue.contents[0].text).pages.length === 39);
  for (const [locale, query] of [['en', 'email'], ['th', 'อีเมล'], ['ja', 'メール']]) {
    const result = await client.callTool({ name: 'search_docs', arguments: { query, locale, limit: 10 } });
    const hits = JSON.parse(result.content[0].text);
    assert(hits.length && hits.every(hit => hit.locale === locale));
    assert(hits.some(hit => hit.url === `/${locale}/sign-in`));
    const guide = await client.callTool({ name: 'read_guide', arguments: { path: `/${locale}/sign-in` } });
    assert(guide.content[0].text.includes(`Source: https://help.remy.invalid/${locale}/sign-in`));
  }
  for (const path of ['/../../AGENTS.md', '/api/auth/session', 'https://example.com']) {
    const result = await client.callTool({ name: 'read_guide', arguments: { path } }); assert(result.isError);
  }
  const absent = await client.callTool({ name: 'search_docs', arguments: { query: 'zzzznomatchzzzz', locale: 'en' } });
  assert.deepEqual(JSON.parse(absent.content[0].text), []);
  assert.equal((await fetch(base + '/mcp', { method: 'POST', headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(base + '/mcp', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await fetch(base + '/private')).status, 404);
  console.log('docs MCP: handshake, read-only tools/resources, three-language retrieval, invalid paths and origin checks passed');
} finally { await client.close(); await new Promise(resolve => http.close(resolve)); http.closeAllConnections(); }
