import { defineServerConfig } from '@fumadocs-editor/studio';
import { resolve } from 'node:path';
import { createAuthorise } from './access.mjs';
export default defineServerConfig({
  authenticate: createAuthorise(resolve(import.meta.dirname, '../help/content')),
  vite: { cacheDir: '.vite', server: { strictPort: true, headers: { 'X-Robots-Tag': 'noindex' } } },
});
