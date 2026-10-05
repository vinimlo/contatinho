import { defineManifest } from '@crxjs/vite-plugin';

const ICONS = { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };

export default defineManifest({
  manifest_version: 3,
  name: 'Contatinho',
  description: 'A folha de contato dos seus contatinhos que não te seguem de volta no Instagram. Só leitura.',
  version: '0.1.0',
  minimum_chrome_version: '116',
  permissions: ['sidePanel', 'storage'],
  host_permissions: ['https://www.instagram.com/*'],
  background: { service_worker: 'src/background.ts', type: 'module' },
  side_panel: { default_path: 'src/panel/index.html' },
  icons: ICONS,
  action: { default_title: 'Contatinho', default_icon: ICONS },
  content_scripts: [
    { matches: ['https://www.instagram.com/*'], js: ['src/content/index.ts'], run_at: 'document_idle' },
  ],
});
