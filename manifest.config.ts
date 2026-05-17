import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Srider',
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
    default_title: 'Open Srider',
    default_icon: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  icons: {
    16: 'icons/icon-16.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  commands: {
    'toggle-side-panel': {
      suggested_key: {
        default: 'Ctrl+B',
        mac: 'Command+B',
      },
      description: '切换 Srider 侧边栏 (Toggle Srider)',
    },
  },
});
