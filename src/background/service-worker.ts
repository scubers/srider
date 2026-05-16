/**
 * Service Worker entry point.
 *
 * CRITICAL (CLAUDE.md "Architecture invariants"): ALL chrome.* listeners must
 * be attached at module top level, synchronously. Do not await before
 * addListener — MV3 may recycle the SW and miss events on next cold start.
 */
import {
  handleTabCreated,
  handleTabRemoved,
  handleTabUpdated,
  handleTabAttached,
  handleWindowCreated,
  handleWindowRemoved,
  recoverOnStartup,
  recoverOnInstall,
  gcPendingOpens,
} from './tab-handlers';
import { handleMessage } from './message-handlers';
import type { Message } from '$shared/messages';

// ---------- Tab events ----------

chrome.tabs.onCreated.addListener((tab) => {
  void handleTabCreated(tab);
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  void handleTabRemoved(tabId, removeInfo);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void handleTabUpdated(tabId, changeInfo, tab);
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  void handleTabAttached(tabId, attachInfo);
});

// ---------- Window events ----------

chrome.windows.onCreated.addListener((window) => {
  // handleWindowCreated is sync up to the buffer install; the rest is
  // scheduled via setTimeout from inside.
  handleWindowCreated(window);
});

chrome.windows.onRemoved.addListener((windowId) => {
  void handleWindowRemoved(windowId);
});

// ---------- Lifecycle ----------

chrome.runtime.onInstalled.addListener(() => {
  void recoverOnInstall().then(gcPendingOpens);
});

chrome.runtime.onStartup.addListener(() => {
  void recoverOnStartup().then(gcPendingOpens);
});

// Side panel opens via toolbar-icon click.
void chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('[side-tab] setPanelBehavior failed', e));

// ---------- Side panel toggle (keyboard command) ----------

/**
 * Open panels register a runtime port so the SW knows which windows currently
 * have the side panel open. The Chrome side-panel API has no programmatic
 * "close"; we tell the panel page to call window.close() on itself.
 */
const openPanelPorts = new Map<number, chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;

  let windowId: number | null = null;

  port.onMessage.addListener((msg: unknown) => {
    if (
      msg &&
      typeof msg === 'object' &&
      (msg as { type?: unknown }).type === 'hello'
    ) {
      const id = (msg as { chromeWindowId?: unknown }).chromeWindowId;
      if (typeof id === 'number') {
        windowId = id;
        openPanelPorts.set(id, port);
      }
    }
  });

  port.onDisconnect.addListener(() => {
    if (windowId !== null && openPanelPorts.get(windowId) === port) {
      openPanelPorts.delete(windowId);
    }
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-side-panel') return;
  void toggleSidePanel();
});

async function toggleSidePanel(): Promise<void> {
  const win = await chrome.windows.getCurrent();
  if (win.id === undefined) return;
  const existing = openPanelPorts.get(win.id);
  if (existing) {
    // Ask the panel to close itself.
    try {
      existing.postMessage({ type: 'close' });
    } catch {
      // Port already dead — fall through to open.
      openPanelPorts.delete(win.id);
      await chrome.sidePanel.open({ windowId: win.id });
    }
  } else {
    await chrome.sidePanel.open({ windowId: win.id });
  }
}

// ---------- Messages from UI ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages from this extension's own contexts. External
  // pages cannot reach onMessage without `externally_connectable`, but
  // another installed extension could; reject those.
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'unauthorized sender' });
    return false;
  }
  // Shape-validate before dispatch.
  if (!message || typeof (message as { type?: unknown }).type !== 'string') {
    sendResponse({ ok: false, error: 'invalid message' });
    return false;
  }
  void handleMessage(message as Message).then(sendResponse);
  return true; // keep channel open for async response
});

// Defensive cold-start recovery. recoverOnStartup is idempotent per SW
// lifetime, so this is safe even if onStartup fires immediately after.
void recoverOnStartup().catch((e) =>
  console.error('[side-tab] initial recovery failed', e),
);
