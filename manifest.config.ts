import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Side Tab',
  version: pkg.version,
  description: pkg.description,
  minimum_chrome_version: '114',
  permissions: ['tabs', 'storage', 'sidePanel', 'sessions'],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  action: {
    default_title: 'Open Side Tab',
  },
});
