import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config';

// emptyOutDir esvazia o conteúdo de dist/ mas mantém a pasta que o Chrome carrega.
export default defineConfig({
  plugins: [svelte(), crx({ manifest })],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  css: { preprocessorOptions: { scss: { api: 'modern' } } },
});
