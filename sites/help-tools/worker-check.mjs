import { networkFetch as fetch } from './network.mjs';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const base = process.argv[2], environment = process.argv[3];
const health = await (await fetch(base + '/health')).json();
assert.equal(health.environment, environment);
const remote = !base.startsWith('http://127.0.0.1:');
if (remote) assert.equal(health.origin, base);
for (const path of ['/en', '/llms.txt', '/llms-full.txt', '/application-openapi.json', '/gemini-tools.json']) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('x-robots-tag')?.includes('noindex') ?? false, environment !== 'production');
  const text = await response.text();
  assert(!text.includes('help.remy.invalid'), `${path}: no reserved production links`);
  if (path === '/en') { assert(text.includes(health.origin + '/en')); assert.equal(/<meta[^>]+content="noindex"/.test(text), environment !== 'production'); }
}
const spec = await (await fetch(base + '/application-openapi.json')).json();
assert.equal(Object.keys(spec.paths).length, 6);
assert(Object.values(spec.paths).every(path => Object.keys(path).join() === 'get'));
assert.equal(spec.servers[0].url, health.origin);
assert.equal((await fetch(base + '/api/events', { method: 'POST' })).status, 405);
assert.equal((await fetch(base + '/api/me')).status, 404);
assert.equal((await fetch(base + '/mcp', { method: 'POST', headers: { Origin: 'https://example.com' }, body: '{}' })).status, 403);
assert.equal((await fetch(base + '/mcp', { method: 'POST', body: '{' })).status, 400);
assert.equal((await fetch(base + '/mcp', { method: 'POST', body: 'x'.repeat(65537) })).status, 413);
const client = new Client({ name: 'remy-worker-proof', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { fetch }));
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 8);
  assert(tools.tools.every(tool => tool.annotations.readOnlyHint));
  for (const [locale, query] of [['en', 'email'], ['th', 'อีเมล'], ['ja', 'メール']]) {
    const search = await client.callTool({ name: 'search_docs', arguments: { query, locale } });
    assert(!search.isError, JSON.stringify(search));
    assert(JSON.parse(search.content[0].text).some(page => page.url === `/${locale}/sign-in`), `${locale}: sign-in must be in the top five email results`);
  }
  const guide = await client.callTool({ name: 'read_guide', arguments: { path: '/en/sign-in' } });
  assert(!guide.isError, JSON.stringify(guide));
  assert(guide.content[0].text.includes('Source: ' + health.origin));
  for (const resource of ['events', 'teams', 'games']) {
    const result = await client.callTool({ name: `list_${resource}`, arguments: {} });
    assert(!result.isError, JSON.stringify(result));
    const data = JSON.parse(result.content[0].text);
    assert.equal(new URL(data.source).origin, health.appOrigin);
    assert(Array.isArray(data.data[resource]));
    if (data.data[resource][0]) {
      const detail = await client.callTool({ name: `get_${resource.slice(0,-1)}`, arguments: { id: data.data[resource][0].id } });
      assert(!detail.isError, JSON.stringify(detail));
      assert.equal(JSON.parse(detail.content[0].text).data.id, data.data[resource][0].id);
    }
  }
  const proxy = await (await fetch(base + '/api/events')).json();
  assert.equal(new URL(proxy.source).origin, health.appOrigin);
  console.log(`docs Worker: ${environment}, static docs, MCP handshake/guide/application calls, same-origin proxy, index policy and rejected writes passed`);
} finally { await client.close(); }
