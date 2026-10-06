// Servidor de captura: usa o renderer atual sem iniciar Electron ou acessar MariaDB.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const server = await createServer({
  configFile: false,
  root,
  plugins: [react(), tailwindcss(), {
    name: 'magisform-captura-isolada',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        { tag: 'script', children: `window.MAGISFORM_CAPTURE_VERSION = ${JSON.stringify(version)};`, injectTo: 'head-prepend' },
        { tag: 'script', attrs: { src: '/website/tools/demo-bridge.js' }, injectTo: 'head-prepend' },
      ],
    },
  }],
  resolve: { alias: { '@': path.resolve(root) } },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
});
await server.listen();
console.log('Renderer isolado: http://127.0.0.1:5175/ — somente dados fictícios.');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await server.close(); process.exit(0); });
}
