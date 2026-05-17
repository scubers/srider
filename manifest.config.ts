import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  // The user-facing strings below resolve at install/display time from
  // _locales/<lang>/messages.json. Chrome picks the locale based on the
  // browser's UI language, falling back to `default_locale` if there's no
  // match. The in-extension UI uses its own runtime i18n (src/shared/i18n)
  // so the user-pinned Language setting can switch live.
  name: '__MSG_extension_name__',
  default_locale: 'en',
  version: pkg.version,
  description: '__MSG_extension_description__',
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
    default_title: '__MSG_action_default_title__',
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
      description: '__MSG_command_toggle_panel__',
    },
  },
});
