import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createDocsServer } from './docs-server.mjs';

export function validateSource(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('Expected a loopback help origin');
  return url.origin;
}

export async function startServer({ source, port = 8792, application }) {
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
      server = await createDocsServer(async path => {
        const response = await fetch(validateSource(source) + path, { redirect: 'error', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Help unavailable');
        return response.text();
      }, application);
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
  const http = await startServer({ source: process.argv[2] ?? 'http://127.0.0.1:8791', port: Number(process.argv[3] ?? 8792), application: 'http://127.0.0.1:8787' });
  console.log(`docs: MCP ready at http://127.0.0.1:${http.address().port}/mcp`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { http.close(); http.closeAllConnections(); });
}
