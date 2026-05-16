/**
 * Handlers for messages dispatched from the UI (Side Panel / Options).
 *
 * Each handler mutates AppData via the shared serialized write queue so it
 * does not race with tab event handlers.
 */
import { getAppData } from '$shared/storage';
import { uuid } from '$shared/id';
import { isSafeNavigationUrl } from '$shared/url';
import type {
  AppData,
  Group,
  GroupId,
  TabRef,
  TabRefId,
  WindowState,
  WindowUUID,
} from '$shared/types';
import type { Message, MessageResponse } from '$shared/messages';
import { withAppData } from './write-queue';
import { registerPendingOpen } from './tab-handlers';

function getWindow(data: AppData, windowId: WindowUUID): WindowState | null {
  // Use Object.hasOwn to avoid prototype-chain access (`__proto__`, etc.).
  if (!Object.hasOwn(data.windows, windowId)) return null;
  return data.windows[windowId] ?? null;
}

function getGroup(window: WindowState, groupId: GroupId): Group | null {
  return window.groups.find((g) => g.id === groupId) ?? null;
}

function findTab(
  window: WindowState,
  tabRefId: TabRefId,
): { tab: TabRef; container: TabRef[]; groupId: GroupId | null } | null {
  for (const g of window.groups) {
    const tab = g.tabs.find((t) => t.id === tabRefId);
    if (tab) return { tab, container: g.tabs, groupId: g.id };
  }
  const tab = window.untrackedTabs.find((t) => t.id === tabRefId);
  if (tab) return { tab, container: window.untrackedTabs, groupId: null };
  return null;
}

function findContainer(
  window: WindowState,
  groupId: GroupId | null,
): TabRef[] | null {
  if (groupId === null) return window.untrackedTabs;
  return window.groups.find((g) => g.id === groupId)?.tabs ?? null;
}

export async function handleMessage(msg: Message): Promise<MessageResponse> {
  try {
    switch (msg.type) {
      case 'createGroup':
        return await createGroup(msg);
      case 'renameGroup':
        return await renameGroup(msg);
      case 'deleteGroup':
        return await deleteGroup(msg);
      case 'toggleGroupCollapsed':
        return await toggleGroupCollapsed(msg);
      case 'reorderGroups':
        return await reorderGroups(msg);
      case 'moveTab':
        return await moveTab(msg);
      case 'removeTab':
        return await removeTab(msg);
      case 'setTabPinned':
        return await setTabPinned(msg);
      case 'activateLiveTab':
        return await activateLiveTab(msg);
      case 'openSavedTab':
        return await openSavedTab(msg);
      case 'closeLiveTab':
        return await closeLiveTab(msg);
      case 'addUrlToGroup':
        return await addUrlToGroup(msg);
      default: {
        // Exhaustiveness check: adding a new Message variant must add a case here.
        const exhaustive: never = msg;
        return {
          ok: false,
          error: `unknown message type: ${(exhaustive as { type?: string }).type ?? 'unknown'}`,
        };
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function createGroup(msg: Extract<Message, { type: 'createGroup' }>): Promise<MessageResponse> {
  await withAppData((data) => {
    const window = getWindow(data, msg.windowId);
    if (!window) throw new Error(`window ${msg.windowId} not found`);
    const group: Group = {
      id: uuid(),
      name: msg.name.trim() || '新分组',
      collapsed: false,
      tabs: [],
      createdAt: Date.now(),
    };
    window.groups.push(group);
  });
  return { ok: true };
}

async function renameGroup(msg: Extract<Message, { type: 'renameGroup' }>): Promise<MessageResponse> {
  await withAppData((data) => {
    const window = getWindow(data, msg.windowId);
    if (!window) throw new Error(`window ${msg.windowId} not found`);
    const group = getGroup(window, msg.groupId);
    if (!group) throw new Error(`group ${msg.groupId} not found`);
    const trimmed = msg.name.trim();
    if (!trimmed) throw new Error('name cannot be empty');
    group.name = trimmed;
  });
  return { ok: true };
}

async function deleteGroup(msg: Extract<Message, { type: 'deleteGroup' }>): Promise<MessageResponse> {
  await withAppData((data) => {
    const window = getWindow(data, msg.windowId);
    if (!window) throw new Error(`window ${msg.windowId} not found`);
    const idx = window.groups.findIndex((g) => g.id === msg.groupId);
    if (idx === -1) throw new Error(`group ${msg.groupId} not found`);
    const [group] = window.groups.splice(idx, 1);

    // Spec §6.9: live tabs move to untrackedTabs, saved tabs are discarded.
    for (const tab of group.tabs) {
      if (tab.chromeTabId !== null) {
        window.untrackedTabs.push(tab);
      }
    }
  });
  return { ok: true };
}

async function setTabPinned(
  msg: Extract<Message, { type: 'setTabPinned' }>,
): Promise<MessageResponse> {
  await withAppData((data) => {
    const window = getWindow(data, msg.windowId);
    if (!window) throw new Error(`window ${msg.windowId} not found`);
    const group = getGroup(window, msg.groupId);
    if (!group) throw new Error(`group ${msg.groupId} not found`);
    const tab = group.tabs.find((t) => t.id === msg.tabRefId);
    if (!tab) throw new Error(`tab ${msg.tabRefId} not found in group ${msg.groupId}`);
    tab.pinned = msg.pinned;
  });
  return { ok: true };
}

async function toggleGroupCollapsed(
  msg: Extract<Message, { type: 'toggleGroupCollapsed' }>,
): Promise<MessageResponse> {
  await withAppData((data) => {
    const window = getWindow(data, msg.windowId);
    if (!window) throw new Error(`window ${msg.windowId} not found`);
    const group = getGroup(window, msg.groupId);
    if (!group) throw new Error(`group ${msg.groupId} not found`);
    group.collapsed = msg.collapsed;
  });
  return { ok: true };
}

async function reorderGroups(
  msg: Extract<Message, { type: 'reorderGroups' }>,
): Promise<MessageResponse> {
  await withAppData((data) => {
    const window = getWindow(data, msg.windowId);
    if (!window) throw new Error(`window ${msg.windowId} not found`);
    const byId = new Map(window.groups.map((g) => [g.id, g]));
    if (msg.orderedIds.length !== window.groups.length) {
      throw new Error('reorderGroups: id list length mismatch');
    }
    const next: Group[] = [];
    for (const id of msg.orderedIds) {
      const g = byId.get(id);
      if (!g) throw new Error(`reorderGroups: group ${id} not found`);
      next.push(g);
    }
    window.groups = next;
  });
  return { ok: true };
}

async function moveTab(msg: Extract<Message, { type: 'moveTab' }>): Promise<MessageResponse> {
  await withAppData((data) => {
    const window = getWindow(data, msg.windowId);
    if (!window) throw new Error(`window ${msg.windowId} not found`);
    const from = findContainer(window, msg.fromGroupId);
    const to = findContainer(window, msg.toGroupId);
    if (!from) throw new Error(`source container ${msg.fromGroupId} not found`);
    if (!to) throw new Error(`target container ${msg.toGroupId} not found`);
    const idx = from.findIndex((t) => t.id === msg.tabRefId);
    if (idx === -1) throw new Error(`tab ${msg.tabRefId} not found in source`);
    const [tab] = from.splice(idx, 1);
    const insertAt = Math.max(0, Math.min(msg.toIndex, to.length));
    to.splice(insertAt, 0, tab);
  });
  return { ok: true };
}

async function removeTab(msg: Extract<Message, { type: 'removeTab' }>): Promise<MessageResponse> {
  await withAppData((data) => {
    const window = getWindow(data, msg.windowId);
    if (!window) throw new Error(`window ${msg.windowId} not found`);
    const container = findContainer(window, msg.fromGroupId);
    if (!container) throw new Error(`container ${msg.fromGroupId} not found`);
    const idx = container.findIndex((t) => t.id === msg.tabRefId);
    if (idx === -1) throw new Error(`tab ${msg.tabRefId} not found`);
    container.splice(idx, 1);
  });
  return { ok: true };
}

async function activateLiveTab(
  msg: Extract<Message, { type: 'activateLiveTab' }>,
): Promise<MessageResponse> {
  const data = await getAppData();
  const window = getWindow(data, msg.windowId);
  if (!window) return { ok: false, error: 'window not found' };
  const located = findTab(window, msg.tabRefId);
  if (!located) return { ok: false, error: 'tab not found' };
  const chromeTabId = located.tab.chromeTabId;
  if (chromeTabId === null) return { ok: false, error: 'tab is not live' };
  await chrome.tabs.update(chromeTabId, { active: true });
  if (window.chromeWindowId !== null) {
    await chrome.windows.update(window.chromeWindowId, { focused: true });
  }
  return { ok: true };
}

async function openSavedTab(
  msg: Extract<Message, { type: 'openSavedTab' }>,
): Promise<MessageResponse> {
  const data = await getAppData();
  const window = getWindow(data, msg.windowId);
  if (!window) return { ok: false, error: 'window not found' };
  const located = findTab(window, msg.tabRefId);
  if (!located) return { ok: false, error: 'tab not found' };
  const url = located.tab.url;
  if (!url) return { ok: false, error: 'tab has no URL' };
  if (!isSafeNavigationUrl(url)) {
    return { ok: false, error: `refusing to navigate to ${url}` };
  }

  await registerPendingOpen(url, msg.tabRefId);

  switch (msg.behavior) {
    case 'current-tab': {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        windowId: window.chromeWindowId ?? undefined,
      });
      if (activeTab?.id !== undefined) {
        await chrome.tabs.update(activeTab.id, { url });
      } else {
        await chrome.tabs.create({ url, windowId: window.chromeWindowId ?? undefined });
      }
      break;
    }
    case 'new-tab':
      await chrome.tabs.create({ url, windowId: window.chromeWindowId ?? undefined });
      break;
    case 'new-window':
      await chrome.windows.create({ url });
      break;
  }
  return { ok: true };
}

async function closeLiveTab(
  msg: Extract<Message, { type: 'closeLiveTab' }>,
): Promise<MessageResponse> {
  const data = await getAppData();
  const window = getWindow(data, msg.windowId);
  if (!window) return { ok: false, error: 'window not found' };
  const located = findTab(window, msg.tabRefId);
  if (!located) return { ok: false, error: 'tab not found' };
  const chromeTabId = located.tab.chromeTabId;
  if (chromeTabId === null) return { ok: false, error: 'tab is not live' };
  // chrome.tabs.remove triggers onRemoved → handleTabRemoved → TabRef.chromeTabId becomes null.
  await chrome.tabs.remove(chromeTabId);
  return { ok: true };
}

async function addUrlToGroup(
  msg: Extract<Message, { type: 'addUrlToGroup' }>,
): Promise<MessageResponse> {
  if (!isSafeNavigationUrl(msg.url)) {
    return { ok: false, error: `refusing to add unsafe URL ${msg.url}` };
  }

  // Resolve URL → chromeTabId by enumerating all tabs. chrome.tabs.query({url})
  // requires a match-pattern; exact-URL matching is done in memory.
  let chromeTabId = msg.chromeTabId;
  let title = msg.title;
  let favIconUrl: string | undefined;
  if (chromeTabId === undefined) {
    const allTabs = await chrome.tabs.query({});
    const match = allTabs.find((t) => t.url === msg.url && t.id !== undefined);
    if (match?.id !== undefined) {
      chromeTabId = match.id;
      title ??= match.title ?? undefined;
      favIconUrl = match.favIconUrl ?? undefined;
    }
  }

  await withAppData((data) => {
    const window = getWindow(data, msg.windowId);
    if (!window) throw new Error(`window ${msg.windowId} not found`);
    const group = getGroup(window, msg.groupId);
    if (!group) throw new Error(`group ${msg.groupId} not found`);

    // If a TabRef with this chromeTabId already exists, move it rather than
    // duplicating.
    if (chromeTabId !== undefined) {
      const existing = findTabByChromeIdLocal(window, chromeTabId);
      if (existing) {
        const idx = existing.container.indexOf(existing.tab);
        existing.container.splice(idx, 1);
        group.tabs.push(existing.tab);
        return;
      }
    }

    const newRef: TabRef = {
      id: uuid(),
      url: msg.url,
      title: title ?? msg.url,
      favIconUrl,
      chromeTabId: chromeTabId ?? null,
      addedAt: Date.now(),
    };
    group.tabs.push(newRef);
  });
  return { ok: true };
}

function findTabByChromeIdLocal(
  window: WindowState,
  chromeTabId: number,
): { tab: TabRef; container: TabRef[] } | null {
  for (const g of window.groups) {
    const t = g.tabs.find((t) => t.chromeTabId === chromeTabId);
    if (t) return { tab: t, container: g.tabs };
  }
  const t = window.untrackedTabs.find((t) => t.chromeTabId === chromeTabId);
  if (t) return { tab: t, container: window.untrackedTabs };
  return null;
}
