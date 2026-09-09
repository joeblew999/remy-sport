import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createDocsServer } from './docs-server.mjs';
import { callApplication, declarations, operations } from './application.mjs';
import { textWithin } from './limits.mjs';
import deployment from './deployment.generated.json';

function reply(value, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
function schema() {
  return { openapi: '3.1.0', info: { title: 'Remy Sport public assistant API', version: '1.0.0' }, servers: [{ url: deployment.toolsOrigin ?? deployment.origin }], paths: Object.fromEntries(operations.map(op => [`/api${op.path}`, { get: { operationId: op.name, description: declarations().find(d => d.name === op.name).description, parameters: Object.entries(declarations().find(d => d.name === op.name).parameters.properties).map(([name, property]) => ({ name, in: name === 'id' ? 'path' : 'query', required: name === 'id', schema: property })), responses: { 200: { description: 'Timestamped public application result', content: { 'application/json': { schema: { type: 'object', properties: { source: { type: 'string' }, retrievedAt: { type: 'string' }, data: { type: 'object' } } } } } } } } }])) };
}
async function assets(request, env) {
  if (env.VITE_ORIGIN) {
    if (deployment.environment !== 'dev' || env.VITE_ORIGIN !== 'http://127.0.0.1:8791') throw new Error('Invalid development asset target');
    const path = new URL(request.url);
    const html = !path.pathname.includes('.') && !path.pathname.startsWith('/api/');
    return fetch(env.VITE_ORIGIN + path.pathname + path.search, { redirect: 'manual', headers: { Accept: html ? 'text/html' : '*/*' } });
  }
  return env.ASSETS.fetch(request);
}
async function route(request, env) {
  const url = new URL(request.url);
  if (env.ENVIRONMENT !== deployment.environment || env.APP_ORIGIN !== deployment.appOrigin || env.HELP_ORIGIN !== deployment.origin) return reply({ error: 'Deployment environment mismatch' }, 503);
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (!local && url.hostname !== new URL(deployment.origin).hostname) return reply({ error: 'Unexpected help hostname' }, 421);
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return reply({ error: 'Origin not allowed' }, 403);
  if (url.pathname === '/health') return reply({ service: 'remy-help', ...deployment, versionId: env.CF_VERSION_METADATA?.id });
  if (url.pathname === '/gemini-tools.json') return reply({ functionDeclarations: declarations() });
  if (url.pathname === '/application-openapi.json') return reply(schema());
  if (url.pathname === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nSitemap: ${deployment.origin}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain' } });
  if (url.pathname === '/mcp' || (url.pathname.startsWith('/api/') && url.pathname !== '/api/search')) {
    // Distributed Cloudflare limiter; no app bindings or credentials involved.
    if (env.RATE_LIMIT && !(await env.RATE_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'local' })).success) return reply({ error: 'Rate limit exceeded' }, 429);
    if (url.pathname === '/mcp') {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
      if (Number(request.headers.get('content-length') ?? 0) > 65536) return reply({ error: 'Request too large' }, 413);
      let body;
      try { body = await textWithin(request.body, 65536); } catch { return reply({ error: 'Request too large' }, 413); }
      if (new TextEncoder().encode(body).length > 65536) return reply({ error: 'Request too large' }, 413);
      let parsed;
      try { parsed = JSON.parse(body); } catch { return reply({ error: 'Invalid JSON' }, 400); }
      const read = async path => {
        const result = await assets(new Request(new URL(path, request.url)), env);
        if (!result.ok) throw new Error('Help asset unavailable');
        return result.text();
      };
      const server = await createDocsServer(read, deployment.appOrigin, 15000);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      try {
        await server.connect(transport);
        const response = await transport.handleRequest(new Request(request.url, { method: 'POST', headers: request.headers, body }), { parsedBody: parsed });
        // JSON mode is finite: consume before closing the transport, including
        // notification/initialize responses. Real workerd protocol tests cover it.
        const bytes = await response.arrayBuffer();
        return new Response(bytes.byteLength ? bytes : null, { status: response.status, headers: response.headers });
      } finally { await transport.close(); await server.close(); }
    }
    const op = operations.find(item => new RegExp(`^/api${item.path.replace('{id}', '[a-zA-Z0-9_-]+')}$`).test(url.pathname));
    if (!op) return reply({ error: 'Unknown public operation' }, 404);
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    const args = Object.fromEntries(url.searchParams);
    if (op.detail) args.id = url.pathname.split('/').at(-1);
    return reply(await callApplication(deployment.appOrigin, op.name, args, 15000));
  }
  return assets(request, env);
}
export default {
  async fetch(request, env) {
    let response;
    try { response = await route(request, env); }
    catch (error) { response = reply({ error: 'Help/API request failed', detail: error.message }, 503); }
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    if (deployment.environment !== 'production') headers.set('X-Robots-Tag', 'noindex');
    else headers.delete('X-Robots-Tag');
    if (new URL(request.url).pathname === '/api/search') headers.set('Content-Type', 'application/json');
    if (new URL(request.url).pathname.endsWith('.md')) headers.set('Content-Type', 'text/markdown; charset=utf-8');
    return new Response(response.body, { status: response.status, headers });
  },
};
