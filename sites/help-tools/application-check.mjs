import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { operations, apiOrigin, callApplication, declarations } from './application.mjs';
import { startServer } from './server.mjs';
const requests = [];
let protectedRead = false;
const app = createServer((req, res) => {
  requests.push({ method: req.method, path: req.url, cookie: req.headers.cookie, authorization: req.headers.authorization });
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/openapi.json') return res.end(JSON.stringify({ openapi: '3.1.0', paths: Object.fromEntries(operations.map(operation => [operation.path, { get: { security: protectedRead ? [{ Session: [] }] : [] } }])) }));
  res.end(JSON.stringify({ id: 'evt_1', events: [{ id: 'evt_1' }], games: [], teams: [] }));
});
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.address().port}`;
let mcp, client;
try {
  assert.equal(declarations().length, 6);
  assert.throws(() => apiOrigin('https://name:secret@example.com'));
  for (const [name, args] of [['delete_event', {}], ['get_event', { id: '../me' }], ['list_events', { url: '/api/me' }]]) await assert.rejects(callApplication(origin, name, args));
  assert.equal(requests.length, 0);
  const result = await callApplication(origin, 'list_games', { eventId: 'evt_1' });
  assert(result.source.endsWith('/api/games?eventId=evt_1'));
  assert(requests.every(request => request.method === 'GET' && !request.cookie && !request.authorization));
  protectedRead = true;
  const before = requests.length;
  await assert.rejects(callApplication(origin, 'list_events'), /requires authentication/);
  assert.equal(requests.length, before + 1); // schema only; no protected data request
  protectedRead = false;
  mcp = await startServer({ source: process.argv[2], application: origin, port: 0 });
  client = new Client({ name: 'remy-application-check', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcp.address().port}/mcp`)));
  assert.equal((await client.listTools()).tools.length, 8);
  const response = await client.callTool({ name: 'get_event', arguments: { id: 'evt_1' } });
  assert.equal(JSON.parse(response.content[0].text).data.id, 'evt_1');
  assert((await client.callTool({ name: 'get_event', arguments: { id: '../me' } })).isError);
  console.log('docs application: MCP public reads, contract authentication changes, argument validation and no credential forwarding passed');
} finally {
  await client?.close();
  for (const server of [mcp, app].filter(Boolean)) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
