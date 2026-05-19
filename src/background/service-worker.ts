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
  void handleWindowCreated(window);
});

chrome.windows.onRemoved.addListener((windowId) => {
  void handleWindowRemoved(windowId);
});

// ---------- Lifecycle ----------

chrome.runtime.onInstalled.addListener(() => {
  void recoverOnInstall();
});

chrome.runtime.onStartup.addListener(() => {
  void recoverOnStartup();
});

// Side panel opens via toolbar-icon click (and via the `_execute_action`
// keyboard shortcut, which Chrome dispatches as a synthetic action click).
void chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('[side-tab] setPanelBehavior failed', e));

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
