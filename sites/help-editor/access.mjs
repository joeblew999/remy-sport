import { lstatSync, realpathSync } from 'node:fs';
import { resolve, relative, sep, isAbsolute } from 'node:path';

export function createAuthorise(root) {
  const base = realpathSync(root);
  function allowed(path) {
    if (!/\.mdx?$/.test(path) || isAbsolute(path) || path.split('/').some(segment => segment.startsWith('.'))) return false;
    try {
      const file = resolve(base, path);
      const rel = relative(base, file);
      if (rel.startsWith('..') || isAbsolute(rel)) return false;
      // Upstream's root check is lexical. Refuse symlinked files/directories as
      // well so an author cannot accidentally edit outside the content tree.
      let cursor = base;
      for (const part of rel.split(sep)) {
        cursor = resolve(cursor, part);
        if (lstatSync(cursor).isSymbolicLink()) return false;
      }
      return lstatSync(file).isFile() && realpathSync(file).startsWith(base + sep);
    } catch { return false; }
  }
  return ({ request }) => {
    const host = request.headers.host;
    if (!/^127\.0\.0\.1:\d+$/.test(host ?? '')) return null;
    if (request.headers.origin && request.headers.origin !== `http://${host}`) return null;
    return { read: allowed, write: allowed };
  };
}
