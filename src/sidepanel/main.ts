import { mount } from 'svelte';
import App from './App.svelte';
import './styles.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('#app root not found');
}

mount(App, { target });

// Register with the service worker so it can route the toggle-side-panel
// keyboard command (Cmd/Ctrl+B by default) to close this panel.
// chrome.sidePanel has no programmatic close — the panel page closes itself
// via window.close() when the SW asks it to.
(async () => {
  try {
    const port = chrome.runtime.connect({ name: 'sidepanel' });
    port.onMessage.addListener((msg: unknown) => {
      if (
        msg &&
        typeof msg === 'object' &&
        (msg as { type?: unknown }).type === 'close'
      ) {
        window.close();
      }
    });
    const win = await chrome.windows.getCurrent();
    if (win.id !== undefined) {
      port.postMessage({ type: 'hello', chromeWindowId: win.id });
    }
  } catch (e) {
    console.warn('[side-tab] failed to register panel port', e);
  }
})();
