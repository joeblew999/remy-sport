import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile, readdir, symlink, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSyncServer } from '@fumadocs-editor/core/node';
import { wsTransport } from '@fumadocs-editor/core/sync';
import { createCollabSession } from '@fumadocs-editor/core/collab';
import { parseMdxToDoc } from '@fumadocs-editor/core/parse';
import { serializeDocToMdx } from '@fumadocs-editor/core/serialize';
import { createAuthorise } from './access.mjs';

await mkdir('.proof', { recursive: true });
const fixture = await mkdtemp(resolve('.proof/editor-'));
const root = resolve(fixture, 'content');
await mkdir(root);
await writeFile(resolve(root, 'sample.mdx'), '---\ntitle: Test\n---\n\nOriginal paragraph.\n');
await writeFile(resolve(root, 'collab.mdx'), 'Hello collaboration.\n');
await writeFile(resolve(fixture, 'outside.mdx'), 'Outside must remain unchanged.\n');
await symlink(resolve(fixture, 'outside.mdx'), resolve(root, 'escape.mdx'));
const authorise = createAuthorise(root);
const allowed = authorise({ request: { headers: { host: '127.0.0.1:8793' } } });
assert(!allowed.read('escape.mdx'));
assert(!allowed.write('../outside.mdx'));
assert.equal(authorise({ request: { headers: { host: '127.0.0.1:8793', origin: 'https://example.com' } } }), null);
const connections = [];
const sessions = [];
let http, sync;
async function start() {
  sync = createSyncServer({ root, authenticate: authorise, evictAfterMs: 100 });
  http = createServer((_req,res) => res.writeHead(404).end());
  http.on('upgrade', (req, socket, head) => sync.handleUpgrade(req, socket, head));
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
}
async function stop() {
  for (const session of sessions.splice(0)) session.destroy();
  for (const connection of connections.splice(0)) connection.close();
  await sync?.close();
  if (http) await new Promise(resolve => http.close(resolve));
}
function connect() {
  const transport = wsTransport({ url: `ws://127.0.0.1:${http.address().port}/__fde_sync` });
  connections.push(transport); return transport;
}
async function until(test) {
  const deadline = Date.now() + 10000;
  while (!(await test())) {
    if (Date.now() > deadline) throw new Error('Editor convergence timed out');
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}
try {
  // Verify real authored documents survive an untouched parse/serialize cycle.
  const content = resolve('../help/content');
  const files = (await readdir(content, { recursive: true })).filter(file => file.endsWith('.mdx'));
  for (const file of files) {
    const source = await readFile(resolve(content, file), 'utf8');
    const parsed = parseMdxToDoc(source);
    assert.equal(serializeDocToMdx(parsed.doc, parsed.snapshot), source, `${file}: untouched round trip`);
  }
  const unknown = '---\ntitle: Kept\n---\n\n<Unregistered variant="x" />\n\n[Link](./sample.mdx)\n\n![Image](./picture.png)\n';
  const parsed = parseMdxToDoc(unknown);
  assert.equal(serializeDocToMdx(parsed.doc, parsed.snapshot), unknown);
  await start();
  const a = connect(), b = connect();
  assert.deepEqual((await a.list()).sort(), ['collab.mdx', 'sample.mdx']);
  for (const path of ['../outside.mdx', 'escape.mdx', '.private.mdx']) {
    await assert.rejects(a.read(path));
    await assert.rejects(a.write(path, 'forbidden', ''));
  }
  const before = await a.read('sample.mdx');
  const first = await b.write('sample.mdx', before.text + '\nSaved from B.\n', before.version);
  assert(first.ok);
  const stale = await a.write('sample.mdx', 'stale overwrite', before.version);
  assert.equal(stale.ok, false);
  assert(stale.current.text.includes('Saved from B.'));
  let changed;
  const unwatch = a.watch('sample.mdx', state => { changed = state; });
  await a.read('sample.mdx');
  await writeFile(resolve(root, 'sample.mdx'), before.text + '\nExternal editor.\n');
  await until(() => changed?.text.includes('External editor.'));
  unwatch();
  const ca = createCollabSession({ transport: a, path: 'collab.mdx', components: [] });
  const cb = createCollabSession({ transport: b, path: 'collab.mdx', components: [] });
  sessions.push(ca, cb);
  await Promise.all([ca.whenSynced, cb.whenSynced]);
  ca.doc.getXmlFragment('default').get(0).get(0).insert(0, 'First peer. ');
  await until(() => cb.doc.getXmlFragment('default').toString().includes('First peer.'));
  const secondText = cb.doc.getXmlFragment('default').get(0).get(0);
  secondText.insert(secondText.length, ' Second peer.');
  await until(() => ca.doc.getXmlFragment('default').toString().includes('Second peer.'));
  await until(async () => (await readFile(resolve(root, 'collab.mdx'), 'utf8')).includes('Second peer.'));
  await stop();
  await start();
  const reopened = connect();
  assert((await reopened.read('collab.mdx')).text.includes('First peer.'));
  assert((await reopened.read('collab.mdx')).text.includes('Second peer.'));
  assert((await reopened.read('sample.mdx')).text.includes('External editor.'));
  assert.equal(await readFile(resolve(fixture, 'outside.mdx'), 'utf8'), 'Outside must remain unchanged.\n');
  console.log(`docs editor: ${files.length} real-document round trips, unknown MDX, save/conflict/watch, two-peer collaboration, persisted restart and boundary checks passed`);
} finally {
  await stop();
  await rm(fixture, { recursive: true, force: true });
}
