import { defineConfig } from '@fumadocs-editor/studio';
export default defineConfig({
  root: '../help/content',
  host: '127.0.0.1',
  port: 8793,
  open: false,
  media: false,
  server: './studio.server.ts',
});
