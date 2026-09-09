import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { contract, operations, declarations, callApplication, apiOrigin } from './application.mjs';
const origin = apiOrigin(process.argv[2] ?? 'http://127.0.0.1:8787');
const report = { checkedAt: new Date().toISOString(), application: origin, api: [], discovery: process.argv[3] ? 'pending API verification' : 'not checked: public help origin not supplied', googleIndexed: 'not established', geminiInvocation: 'not established' };
await mkdir('.proof', { recursive: true });
try {
  await contract(origin);
  for (const resource of ['events', 'teams', 'games']) {
    const list = await callApplication(origin, `list_${resource}`);
    if (!Array.isArray(list.data[resource])) throw new Error(`Unexpected ${resource} response`);
    report.api.push({ operation: `list_${resource}`, status: 'passed', count: list.data[resource].length });
    const first = list.data[resource][0];
    if (first) {
      const name = `get_${resource.slice(0,-1)}`;
      const detail = await callApplication(origin, name, { id: first.id });
      if (detail.data.id !== first.id) throw new Error(`Unexpected ${resource} detail`);
      report.api.push({ operation: name, status: 'passed' });
    }
  }
  await writeFile('.proof/gemini-tools.json', JSON.stringify({ functionDeclarations: declarations() }, null, 2));
  if (process.argv[3]) {
    const help = apiOrigin(process.argv[3]);
    if (!help.startsWith('https://') || new URL(help).hostname.endsWith('.invalid')) throw new Error('Discovery requires a real public HTTPS help origin');
    for (const path of ['/en', '/llms.txt', '/llms-full.txt', '/sitemap.xml', '/robots.txt']) {
      const response = await fetch(help + path, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      const text = await response.text();
      if (!response.ok || /noindex/i.test(response.headers.get('x-robots-tag') ?? '') || /<meta\b[^>]*content=["'][^"']*noindex/i.test(text)) throw new Error(`Not publicly indexable: ${path}`);
      if (path === '/en' && !text.includes(help + '/en')) throw new Error('Canonical does not identify the public help origin');
      if (path === '/robots.txt' && /Disallow:\s*\/\s*$/m.test(text)) throw new Error('robots.txt blocks crawling');
    }
    report.discovery = 'public accessibility smoke checks passed; use Search Console URL Inspection to establish indexing';
  }
  console.log(`docs discovery: verified ${report.api.length}/${operations.length} public API calls at ${origin}; Gemini declarations: ${resolve('.proof/gemini-tools.json')}`);
  console.log(`docs discovery: ${report.discovery}; no Google/Gemini success inferred`);
} catch (error) { report.error = error.message; throw error; }
finally { await writeFile('.proof/discovery.json', JSON.stringify(report, null, 2)); }
