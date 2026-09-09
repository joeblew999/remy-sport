import { z } from 'zod';

// Explicit public-read allowlist, verified against the app's generated OpenAPI.
// No application imports, credentials, arbitrary paths or write operations.
export const operations = ['events', 'teams', 'games'].flatMap(resource => [
  { name: `list_${resource}`, path: `/${resource}`, resource, detail: false },
  { name: `get_${resource.slice(0, -1)}`, path: `/${resource}/{id}`, resource, detail: true },
]);
export function apiOrigin(value) {
  const url = new URL(value);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('Application origin must be HTTPS or local 127.0.0.1, without credentials or a path');
  return url.origin;
}
export async function json(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error(`Public API failed: ${response.status} at ${url}`);
  return response.json();
}
export async function contract(origin) {
  const base = apiOrigin(origin);
  const spec = await json(`${base}/api/openapi.json`);
  for (const operation of operations) {
    const endpoint = spec.paths?.[operation.path]?.get;
    if (!endpoint || (endpoint.security ?? spec.security ?? []).some(requirement => Object.keys(requirement).length)) throw new Error(`Public GET contract missing or requires authentication: ${operation.path}`);
  }
  return { base, spec };
}
const id = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/);
export function inputFor(operation) {
  return operation.detail ? { id } : operation.resource === 'games' ? { eventId: id.optional(), teamId: id.optional() } : {};
}
export function declarations() {
  return operations.map(operation => ({
    name: operation.name,
    description: `${operation.detail ? 'Read one' : 'List'} public Remy Sport ${operation.resource}. Returns current API data; never modifies an account or score.`,
    parameters: { type: 'object', properties: Object.fromEntries(Object.keys(inputFor(operation)).map(name => [name, { type: 'string', description: `${name}: use an identifier returned by the API` }])), ...(operation.detail ? { required: ['id'] } : {}) },
  }));
}
export async function callApplication(origin, name, args = {}) {
  const operation = operations.find(item => item.name === name);
  if (!operation) throw new Error('Unknown public operation');
  const input = z.object(inputFor(operation)).strict().parse(args);
  const { base } = await contract(origin);
  const path = operation.detail ? operation.path.replace('{id}', encodeURIComponent(input.id)) : operation.path;
  const url = new URL(`${base}/api${path}`);
  for (const [key, value] of Object.entries(input)) if (key !== 'id' && value !== undefined) url.searchParams.set(key, value);
  return { source: url.href, retrievedAt: new Date().toISOString(), data: await json(url) };
}
export function registerApplication(server, origin) {
  const base = apiOrigin(origin);
  for (const operation of operations) server.registerTool(operation.name, {
    description: declarations().find(item => item.name === operation.name).description,
    inputSchema: inputFor(operation),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async args => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await callApplication(base, operation.name, args)) }] }; }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  });
}
