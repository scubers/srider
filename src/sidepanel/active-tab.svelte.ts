/**
 * Tracks which Chrome tab is currently active in this side panel's window.
 *
 * Side-panel-only concern: ephemeral, not persisted. We listen to
 * chrome.tabs.onActivated/onUpdated directly from the side-panel context
 * rather than going through the service worker, because nothing else needs
 * this signal.
 */

class ActiveTabStore {
  chromeTabId = $state<number | null>(null);

  private chromeWindowId: number | null = null;
  private cleanups: Array<() => void> = [];

  async init(chromeWindowId: number): Promise<void> {
    this.destroy();
    this.chromeWindowId = chromeWindowId;

    const initial = await chrome.tabs.query({ active: true, windowId: chromeWindowId });
    this.chromeTabId = initial[0]?.id ?? null;

    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      if (info.windowId !== this.chromeWindowId) return;
      this.chromeTabId = info.tabId;
    };
    chrome.tabs.onActivated.addListener(onActivated);
    this.cleanups.push(() => chrome.tabs.onActivated.removeListener(onActivated));

    // If the active tab is replaced (e.g. discarded → restored), keep the
    // pointer fresh by re-checking on tab replacement.
    const onReplaced = (addedTabId: number, removedTabId: number) => {
      if (this.chromeTabId === removedTabId) {
        this.chromeTabId = addedTabId;
      }
    };
    chrome.tabs.onReplaced.addListener(onReplaced);
    this.cleanups.push(() => chrome.tabs.onReplaced.removeListener(onReplaced));

    // Window focus change: re-query the active tab when our window regains
    // focus, in case onActivated didn't fire (e.g. focus changed before SW
    // wake).
    const onFocusChanged = (windowId: number) => {
      if (windowId !== this.chromeWindowId) return;
      void chrome.tabs
        .query({ active: true, windowId })
        .then((tabs) => {
          this.chromeTabId = tabs[0]?.id ?? null;
        })
        .catch(() => {});
    };
    chrome.windows.onFocusChanged.addListener(onFocusChanged);
    this.cleanups.push(() =>
      chrome.windows.onFocusChanged.removeListener(onFocusChanged),
    );
  }

  destroy(): void {
    for (const c of this.cleanups) c();
    this.cleanups = [];
    this.chromeWindowId = null;
    this.chromeTabId = null;
  }
}

export const activeTabStore = new ActiveTabStore();
