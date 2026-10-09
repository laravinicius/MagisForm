import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: path.resolve(root, 'management'),
  base: '/',
  publicDir: path.resolve(root, 'public'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(root, '.') } },
  build: { outDir: path.resolve(root, 'dist-manager'), emptyOutDir: true, sourcemap: false },
  server: { host: '127.0.0.1', port: 3003, proxy: { '/api': { target: 'http://127.0.0.1:3004', changeOrigin: false } } },
});
