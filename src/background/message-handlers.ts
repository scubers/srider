/**
 * Handlers for messages dispatched from the UI (Side Panel / Options).
 *
 * Mutations to per-window state go through `withWindow / withSessionData`.
 * Mutations to Stash go through `withAppData`.
 */
import { getAppData, getSessionData, getSettings } from '$shared/storage';
import { uuid } from '$shared/id';
import { extractGroupingDomain, isSafeNavigationUrl } from '$shared/url';
import { formatAutoGroupName } from '$shared/group-naming';
import type {
  Group,
  StashFolder,
  StashItem,
  TabRef,
  WindowState,
} from '$shared/types';
import type { Message, MessageResponse } from '$shared/messages';
import { withAppData, withSessionData, withWindow } from './write-queue';
import { cleanupEmptyAutoGroups } from './group-cleanup';
import {
  pushPendingTabSlots,
  reservePendingTabAlias,
  reservePendingTabRoute,
} from './tab-handlers';

const DEFAULT_STASH_FOLDER_NAME = 'Unsorted';

// ---------- Input bounds ----------
// Defense against UI bugs / compromised extension pages that could otherwise
// exhaust chrome.storage quota (local & session caps are ~10MB each).
const MAX_NAME_LEN = 200;
const MAX_GROUPS_PER_WINDOW = 100;
const MAX_TABS_PER_GROUP = 500;
const MAX_STASH_FOLDERS = 200;
const MAX_STASH_ITEMS_PER_FOLDER = 1000;
const MAX_STASH_OPEN_AT_ONCE = 50;

function validName(s: unknown): string {
  if (typeof s !== 'string') throw new Error('name must be a string');
  const trimmed = s.trim();
  if (!trimmed) throw new Error('name cannot be empty');
  if (trimmed.length > MAX_NAME_LEN) {
    throw new Error(`name too long (max ${MAX_NAME_LEN})`);
  }
  return trimmed;
}

/** Like validName but treats empty/whitespace as a request to clear (returns undefined). */
function validAliasName(s: unknown): string | undefined {
  if (typeof s !== 'string') throw new Error('name must be a string');
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_NAME_LEN) {
    throw new Error(`name too long (max ${MAX_NAME_LEN})`);
  }
  return trimmed;
}

function findGroup(state: WindowState, groupId: string): Group | null {
  return state.groups.find((g) => g.id === groupId) ?? null;
}

function findContainer(
  state: WindowState,
  groupId: string | null,
): TabRef[] | null {
  if (groupId === null) return state.untrackedTabs;
  return state.groups.find((g) => g.id === groupId)?.tabs ?? null;
}

function findTabRef(
  state: WindowState,
  tabRefId: string,
): { tab: TabRef; container: TabRef[]; groupId: string | null } | null {
  for (const g of state.groups) {
    const tab = g.tabs.find((t) => t.id === tabRefId);
    if (tab) return { tab, container: g.tabs, groupId: g.id };
  }
  const tab = state.untrackedTabs.find((t) => t.id === tabRefId);
  if (tab) return { tab, container: state.untrackedTabs, groupId: null };
  return null;
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
      case 'activateLiveTab':
        return await activateLiveTab(msg);
      case 'closeLiveTab':
        return await closeLiveTab(msg);
      case 'addUrlToGroup':
        return await addUrlToGroup(msg);
      case 'autoGroupByDomain':
        return await autoGroupByDomain(msg);
      case 'closeAllInGroup':
        return await closeAllInGroup(msg);
      case 'newTabInGroup':
        return await newTabInGroup(msg);
      case 'renameTab':
        return await renameTab(msg);
      case 'createStashFolder':
        return await createStashFolder(msg);
      case 'renameStashFolder':
        return await renameStashFolder(msg);
      case 'deleteStashFolder':
        return await deleteStashFolder(msg);
      case 'toggleStashFolderCollapsed':
        return await toggleStashFolderCollapsed(msg);
      case 'reorderStashFolders':
        return await reorderStashFolders(msg);
      case 'deleteStashItem':
        return await deleteStashItem(msg);
      case 'renameStashItem':
        return await renameStashItem(msg);
      case 'reorderStashItems':
        return await reorderStashItems(msg);
      case 'saveGroupToStash':
        return await saveGroupToStash(msg);
      case 'saveTabToStash':
        return await saveTabToStash(msg);
      case 'openStashItem':
        return await openStashItem(msg);
      case 'openStashFolderAsGroup':
        return await openStashFolderAsGroup(msg);
      default: {
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

// ---------- Per-window: groups & tabs ----------

async function createGroup(msg: Extract<Message, { type: 'createGroup' }>): Promise<MessageResponse> {
  const name = validName(msg.name.trim() || 'New Group');
  // Seed the new group's collapsed state from the user's "default expanded"
  // preference instead of hardcoding it.
  const { defaultGroupExpanded } = await getSettings();
  await withWindow(msg.chromeWindowId, (state) => {
    if (state.groups.length >= MAX_GROUPS_PER_WINDOW) {
      throw new Error(`too many groups (max ${MAX_GROUPS_PER_WINDOW})`);
    }
    const group: Group = {
      id: uuid(),
      name,
      collapsed: !defaultGroupExpanded,
      tabs: [],
      createdAt: Date.now(),
      kind: 'manual',
    };
    state.groups.push(group);
  });
  return { ok: true };
}

async function renameGroup(msg: Extract<Message, { type: 'renameGroup' }>): Promise<MessageResponse> {
  const name = validName(msg.name);
  await withWindow(msg.chromeWindowId, (state) => {
    const group = findGroup(state, msg.groupId);
    if (!group) throw new Error(`group ${msg.groupId} not found`);
    group.name = name;
  });
  return { ok: true };
}

async function deleteGroup(msg: Extract<Message, { type: 'deleteGroup' }>): Promise<MessageResponse> {
  await withWindow(msg.chromeWindowId, (state) => {
    const idx = state.groups.findIndex((g) => g.id === msg.groupId);
    if (idx === -1) throw new Error(`group ${msg.groupId} not found`);
    const [group] = state.groups.splice(idx, 1);
    // Live tabs go to untracked (don't close them); no saved tabs to discard
    // in the new model.
    for (const tab of group.tabs) state.untrackedTabs.push(tab);
  });
  return { ok: true };
}

async function toggleGroupCollapsed(
  msg: Extract<Message, { type: 'toggleGroupCollapsed' }>,
): Promise<MessageResponse> {
  await withWindow(msg.chromeWindowId, (state) => {
    const group = findGroup(state, msg.groupId);
    if (!group) throw new Error(`group ${msg.groupId} not found`);
    group.collapsed = msg.collapsed;
  });
  return { ok: true };
}

async function reorderGroups(
  msg: Extract<Message, { type: 'reorderGroups' }>,
): Promise<MessageResponse> {
  await withWindow(msg.chromeWindowId, (state) => {
    const byId = new Map(state.groups.map((g) => [g.id, g]));
    if (msg.orderedIds.length !== state.groups.length) {
      throw new Error('reorderGroups: id list length mismatch');
    }
    const next: Group[] = [];
    for (const id of msg.orderedIds) {
      const g = byId.get(id);
      if (!g) throw new Error(`reorderGroups: group ${id} not found`);
      next.push(g);
    }
    state.groups = next;
  });
  return { ok: true };
}

async function moveTab(msg: Extract<Message, { type: 'moveTab' }>): Promise<MessageResponse> {
  await withWindow(msg.chromeWindowId, (state) => {
    const from = findContainer(state, msg.fromGroupId);
    const to = findContainer(state, msg.toGroupId);
    if (!from) throw new Error(`source container ${msg.fromGroupId} not found`);
    if (!to) throw new Error(`target container ${msg.toGroupId} not found`);
    // Only cap when moving INTO a group (not when reordering within the same
    // group, and not when moving to untracked).
    if (
      msg.toGroupId !== null &&
      msg.toGroupId !== msg.fromGroupId &&
      to.length >= MAX_TABS_PER_GROUP
    ) {
      throw new Error(`group full (max ${MAX_TABS_PER_GROUP} tabs)`);
    }
    const idx = from.findIndex((t) => t.id === msg.tabRefId);
    if (idx === -1) throw new Error(`tab ${msg.tabRefId} not found in source`);
    const [tab] = from.splice(idx, 1);
    const insertAt = Math.max(0, Math.min(msg.toIndex, to.length));
    to.splice(insertAt, 0, tab);
    cleanupEmptyAutoGroups(state);
  });
  return { ok: true };
}

async function removeTab(msg: Extract<Message, { type: 'removeTab' }>): Promise<MessageResponse> {
  await withWindow(msg.chromeWindowId, (state) => {
    const container = findContainer(state, msg.fromGroupId);
    if (!container) throw new Error(`container ${msg.fromGroupId} not found`);
    const idx = container.findIndex((t) => t.id === msg.tabRefId);
    if (idx === -1) throw new Error(`tab ${msg.tabRefId} not found`);
    container.splice(idx, 1);
    cleanupEmptyAutoGroups(state);
  });
  return { ok: true };
}

async function activateLiveTab(
  msg: Extract<Message, { type: 'activateLiveTab' }>,
): Promise<MessageResponse> {
  const data = await getSessionData();
  const state = data.windows[msg.chromeWindowId];
  if (!state) return { ok: false, error: 'window not found' };
  const located = findTabRef(state, msg.tabRefId);
  if (!located) return { ok: false, error: 'tab not found' };
  await chrome.tabs.update(located.tab.chromeTabId, { active: true });
  await chrome.windows.update(msg.chromeWindowId, { focused: true });
  return { ok: true };
}

async function closeLiveTab(
  msg: Extract<Message, { type: 'closeLiveTab' }>,
): Promise<MessageResponse> {
  const data = await getSessionData();
  const state = data.windows[msg.chromeWindowId];
  if (!state) return { ok: false, error: 'window not found' };
  const located = findTabRef(state, msg.tabRefId);
  if (!located) return { ok: false, error: 'tab not found' };
  await chrome.tabs.remove(located.tab.chromeTabId);
  return { ok: true };
}

async function addUrlToGroup(
  msg: Extract<Message, { type: 'addUrlToGroup' }>,
): Promise<MessageResponse> {
  if (!isSafeNavigationUrl(msg.url)) {
    return { ok: false, error: `refusing to add unsafe URL ${msg.url}` };
  }

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

  if (chromeTabId === undefined) {
    return { ok: false, error: 'could not locate Chrome tab for URL' };
  }
  const resolvedChromeTabId = chromeTabId;

  await withWindow(msg.chromeWindowId, (state) => {
    const group = findGroup(state, msg.groupId);
    if (!group) throw new Error(`group ${msg.groupId} not found`);
    if (group.tabs.length >= MAX_TABS_PER_GROUP) {
      throw new Error(`group full (max ${MAX_TABS_PER_GROUP} tabs)`);
    }

    // If a TabRef already tracks this chromeTabId, move it instead of duplicating.
    for (const g of state.groups) {
      const idx = g.tabs.findIndex((t) => t.chromeTabId === resolvedChromeTabId);
      if (idx !== -1) {
        const [tab] = g.tabs.splice(idx, 1);
        group.tabs.push(tab);
        cleanupEmptyAutoGroups(state);
        return;
      }
    }
    const idx = state.untrackedTabs.findIndex((t) => t.chromeTabId === resolvedChromeTabId);
    if (idx !== -1) {
      const [tab] = state.untrackedTabs.splice(idx, 1);
      group.tabs.push(tab);
      return;
    }

    const newRef: TabRef = {
      id: uuid(),
      url: msg.url,
      title: title ?? msg.url,
      favIconUrl,
      chromeTabId: resolvedChromeTabId,
      addedAt: Date.now(),
    };
    group.tabs.push(newRef);
  });
  return { ok: true };
}

async function autoGroupByDomain(
  msg: Extract<Message, { type: 'autoGroupByDomain' }>,
): Promise<MessageResponse> {
  await withWindow(msg.chromeWindowId, (state) => {
    const autoByDomain = new Map<string, Group>();
    for (const g of state.groups) {
      if (g.kind === 'auto-domain' && g.autoDomain) {
        autoByDomain.set(g.autoDomain, g);
      }
    }

    const remaining: TabRef[] = [];
    const buckets = new Map<string, TabRef[]>();
    for (const tab of state.untrackedTabs) {
      const domain = extractGroupingDomain(tab.url);
      if (!domain) {
        remaining.push(tab);
        continue;
      }
      const list = buckets.get(domain);
      if (list) list.push(tab);
      else buckets.set(domain, [tab]);
    }
    state.untrackedTabs = remaining;

    for (const [domain, tabs] of buckets) {
      let group = autoByDomain.get(domain);
      if (!group) {
        group = {
          id: uuid(),
          name: formatAutoGroupName(domain, tabs.map((t) => t.title)),
          collapsed: false,
          tabs: [],
          createdAt: Date.now(),
          kind: 'auto-domain',
          autoDomain: domain,
        };
        state.groups.push(group);
        autoByDomain.set(domain, group);
      }
      for (const tab of tabs) group.tabs.push(tab);
    }
  });
  return { ok: true };
}

async function closeAllInGroup(
  msg: Extract<Message, { type: 'closeAllInGroup' }>,
): Promise<MessageResponse> {
  const data = await getSessionData();
  const state = data.windows[msg.chromeWindowId];
  if (!state) return { ok: false, error: 'window not found' };

  let container: TabRef[];
  if (msg.groupId === null) {
    container = state.untrackedTabs;
  } else {
    const group = findGroup(state, msg.groupId);
    if (!group) return { ok: false, error: 'group not found' };
    container = group.tabs;
  }

  const liveTabIds = container.map((t) => t.chromeTabId);
  if (liveTabIds.length === 0) return { ok: true };
  await chrome.tabs.remove(liveTabIds);
  return { ok: true };
}

async function newTabInGroup(
  msg: Extract<Message, { type: 'newTabInGroup' }>,
): Promise<MessageResponse> {
  const data = await getSessionData();
  const state = data.windows[msg.chromeWindowId];
  if (!state) return { ok: false, error: 'window not found' };
  if (!findGroup(state, msg.groupId)) return { ok: false, error: 'group not found' };

  reservePendingTabRoute(msg.chromeWindowId, msg.groupId, 1);
  await chrome.tabs.create({ windowId: msg.chromeWindowId, active: true });
  return { ok: true };
}

async function renameTab(msg: Extract<Message, { type: 'renameTab' }>): Promise<MessageResponse> {
  const name = validAliasName(msg.name);
  await withWindow(msg.chromeWindowId, (state) => {
    const located = findTabRef(state, msg.tabRefId);
    if (!located) throw new Error(`tab ${msg.tabRefId} not found`);
    if (name === undefined) {
      delete located.tab.name;
    } else {
      located.tab.name = name;
    }
  });
  return { ok: true };
}

// ---------- Stash ----------

async function createStashFolder(
  msg: Extract<Message, { type: 'createStashFolder' }>,
): Promise<MessageResponse> {
  const name = validName(msg.name.trim() || DEFAULT_STASH_FOLDER_NAME);
  await withAppData((data) => {
    if (data.stash.length >= MAX_STASH_FOLDERS) {
      throw new Error(`too many stash folders (max ${MAX_STASH_FOLDERS})`);
    }
    data.stash.push({
      id: uuid(),
      name,
      collapsed: false,
      items: [],
      createdAt: Date.now(),
    });
  });
  return { ok: true };
}

async function renameStashFolder(
  msg: Extract<Message, { type: 'renameStashFolder' }>,
): Promise<MessageResponse> {
  const name = validName(msg.name);
  await withAppData((data) => {
    const folder = data.stash.find((f) => f.id === msg.folderId);
    if (!folder) throw new Error(`stash folder ${msg.folderId} not found`);
    folder.name = name;
  });
  return { ok: true };
}

async function deleteStashFolder(
  msg: Extract<Message, { type: 'deleteStashFolder' }>,
): Promise<MessageResponse> {
  await withAppData((data) => {
    data.stash = data.stash.filter((f) => f.id !== msg.folderId);
  });
  return { ok: true };
}

async function toggleStashFolderCollapsed(
  msg: Extract<Message, { type: 'toggleStashFolderCollapsed' }>,
): Promise<MessageResponse> {
  await withAppData((data) => {
    const folder = data.stash.find((f) => f.id === msg.folderId);
    if (!folder) throw new Error(`stash folder ${msg.folderId} not found`);
    folder.collapsed = msg.collapsed;
  });
  return { ok: true };
}

async function reorderStashFolders(
  msg: Extract<Message, { type: 'reorderStashFolders' }>,
): Promise<MessageResponse> {
  await withAppData((data) => {
    const byId = new Map(data.stash.map((f) => [f.id, f]));
    if (msg.orderedIds.length !== data.stash.length) {
      throw new Error('reorderStashFolders: id list length mismatch');
    }
    const next: StashFolder[] = [];
    for (const id of msg.orderedIds) {
      const f = byId.get(id);
      if (!f) throw new Error(`reorderStashFolders: folder ${id} not found`);
      next.push(f);
    }
    data.stash = next;
  });
  return { ok: true };
}

async function deleteStashItem(
  msg: Extract<Message, { type: 'deleteStashItem' }>,
): Promise<MessageResponse> {
  await withAppData((data) => {
    const folder = data.stash.find((f) => f.id === msg.folderId);
    if (!folder) throw new Error(`stash folder ${msg.folderId} not found`);
    folder.items = folder.items.filter((i) => i.id !== msg.itemId);
  });
  return { ok: true };
}

async function renameStashItem(
  msg: Extract<Message, { type: 'renameStashItem' }>,
): Promise<MessageResponse> {
  const name = validAliasName(msg.name);
  await withAppData((data) => {
    const folder = data.stash.find((f) => f.id === msg.folderId);
    if (!folder) throw new Error(`stash folder ${msg.folderId} not found`);
    const item = folder.items.find((i) => i.id === msg.itemId);
    if (!item) throw new Error(`stash item ${msg.itemId} not found`);
    if (name === undefined) {
      delete item.name;
    } else {
      item.name = name;
    }
  });
  return { ok: true };
}

async function reorderStashItems(
  msg: Extract<Message, { type: 'reorderStashItems' }>,
): Promise<MessageResponse> {
  await withAppData((data) => {
    const folder = data.stash.find((f) => f.id === msg.folderId);
    if (!folder) throw new Error(`stash folder ${msg.folderId} not found`);
    const byId = new Map(folder.items.map((i) => [i.id, i]));
    if (msg.orderedIds.length !== folder.items.length) {
      throw new Error('reorderStashItems: id list length mismatch');
    }
    const next: StashItem[] = [];
    for (const id of msg.orderedIds) {
      const item = byId.get(id);
      if (!item) throw new Error(`reorderStashItems: item ${id} not found`);
      next.push(item);
    }
    folder.items = next;
  });
  return { ok: true };
}

async function saveGroupToStash(
  msg: Extract<Message, { type: 'saveGroupToStash' }>,
): Promise<MessageResponse> {
  // 1. Snapshot the group from session storage.
  const captured: { folder: StashFolder | null } = { folder: null };
  await withSessionData((data) => {
    const state = data.windows[msg.chromeWindowId];
    if (!state) return;
    const group = state.groups.find((g) => g.id === msg.groupId);
    if (!group) return;
    captured.folder = {
      id: uuid(),
      name: group.name,
      collapsed: false,
      items: group.tabs.map((t) => ({
        id: uuid(),
        url: t.url,
        title: t.title,
        favIconUrl: t.favIconUrl,
        addedAt: Date.now(),
        ...(t.name ? { name: t.name } : {}),
      })),
      createdAt: Date.now(),
    };
  });

  if (!captured.folder) {
    return { ok: false, error: 'group or window not found' };
  }
  const newFolder = captured.folder;

  // 2. Append to Stash.
  await withAppData((data) => {
    if (data.stash.length >= MAX_STASH_FOLDERS) {
      throw new Error(`too many stash folders (max ${MAX_STASH_FOLDERS})`);
    }
    data.stash.push(newFolder);
  });
  return { ok: true };
}

async function saveTabToStash(
  msg: Extract<Message, { type: 'saveTabToStash' }>,
): Promise<MessageResponse> {
  // 1. Snapshot the tab.
  const captured: { item: StashItem | null } = { item: null };
  await withSessionData((data) => {
    const state = data.windows[msg.chromeWindowId];
    if (!state) return;
    const container =
      msg.fromGroupId === null
        ? state.untrackedTabs
        : state.groups.find((g) => g.id === msg.fromGroupId)?.tabs;
    if (!container) return;
    const tab = container.find((t) => t.id === msg.tabRefId);
    if (!tab) return;
    captured.item = {
      id: uuid(),
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      addedAt: Date.now(),
      ...(tab.name ? { name: tab.name } : {}),
    };
  });

  if (!captured.item) {
    return { ok: false, error: 'tab not found' };
  }
  const newItem = captured.item;

  // 2. Append to target folder (find existing, or create "Unsorted").
  await withAppData((data) => {
    let folder: StashFolder | undefined;
    if (msg.targetFolderId) {
      folder = data.stash.find((f) => f.id === msg.targetFolderId);
      if (!folder) throw new Error(`stash folder ${msg.targetFolderId} not found`);
    } else {
      folder = data.stash.find((f) => f.name === DEFAULT_STASH_FOLDER_NAME);
      if (!folder) {
        if (data.stash.length >= MAX_STASH_FOLDERS) {
          throw new Error(`too many stash folders (max ${MAX_STASH_FOLDERS})`);
        }
        folder = {
          id: uuid(),
          name: DEFAULT_STASH_FOLDER_NAME,
          collapsed: false,
          items: [],
          createdAt: Date.now(),
        };
        data.stash.push(folder);
      }
    }
    if (folder.items.length >= MAX_STASH_ITEMS_PER_FOLDER) {
      throw new Error(`folder full (max ${MAX_STASH_ITEMS_PER_FOLDER} items)`);
    }
    folder.items.push(newItem);
  });
  return { ok: true };
}

async function openStashItem(
  msg: Extract<Message, { type: 'openStashItem' }>,
): Promise<MessageResponse> {
  const data = await getAppData();
  let target: StashItem | null = null;
  for (const folder of data.stash) {
    const item = folder.items.find((i) => i.id === msg.itemId);
    if (item) {
      target = item;
      break;
    }
  }
  if (!target) return { ok: false, error: 'stash item not found' };
  if (!isSafeNavigationUrl(target.url)) {
    return { ok: false, error: `refusing to navigate to ${target.url}` };
  }

  switch (msg.behavior) {
    case 'current-tab': {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        windowId: msg.chromeWindowId,
      });
      if (activeTab?.id !== undefined) {
        // chrome.tabs.update can reject when the active tab is a chrome://
        // page or another restricted URL. Fall back to opening a new tab so
        // the user still gets their bookmarked URL.
        try {
          await chrome.tabs.update(activeTab.id, { url: target.url });
        } catch {
          if (target.name) reservePendingTabAlias(msg.chromeWindowId, target.name);
          await chrome.tabs.create({ url: target.url, windowId: msg.chromeWindowId });
        }
      } else {
        if (target.name) reservePendingTabAlias(msg.chromeWindowId, target.name);
        await chrome.tabs.create({ url: target.url, windowId: msg.chromeWindowId });
      }
      break;
    }
    case 'new-tab':
      if (target.name) reservePendingTabAlias(msg.chromeWindowId, target.name);
      await chrome.tabs.create({ url: target.url, windowId: msg.chromeWindowId });
      break;
    case 'new-window':
      // The new tab lands in a brand-new window; we don't know its id in
      // advance, so name propagation is best-effort skipped here.
      await chrome.windows.create({ url: target.url });
      break;
  }
  return { ok: true };
}

async function openStashFolderAsGroup(
  msg: Extract<Message, { type: 'openStashFolderAsGroup' }>,
): Promise<MessageResponse> {
  // 1. Read the folder.
  const data = await getAppData();
  const folder = data.stash.find((f) => f.id === msg.folderId);
  if (!folder) return { ok: false, error: 'stash folder not found' };

  // Clamp how many tabs we'll open at once to avoid melting the user's
  // session on a huge folder.
  const safeItems = folder.items
    .filter((i) => isSafeNavigationUrl(i.url))
    .slice(0, MAX_STASH_OPEN_AT_ONCE);
  if (safeItems.length === 0) return { ok: false, error: 'no openable items in folder' };

  // 2. Create new manual group in target window.
  const newGroupId = uuid();
  await withWindow(msg.targetChromeWindowId, (state) => {
    state.groups.push({
      id: newGroupId,
      name: folder.name,
      collapsed: false,
      tabs: [],
      createdAt: Date.now(),
      kind: 'manual',
    });
  });

  // 3. Reserve one slot per item with the target group and (optional) alias.
  // FIFO order: each subsequent onCreated consumes one slot.
  pushPendingTabSlots(
    msg.targetChromeWindowId,
    safeItems.map((item) => ({
      groupId: newGroupId,
      ...(item.name ? { name: item.name } : {}),
    })),
  );

  // 4. Open every item. Don't wait for full load; just kick off create().
  for (const item of safeItems) {
    await chrome.tabs.create({
      url: item.url,
      windowId: msg.targetChromeWindowId,
      active: false,
    });
  }
  return { ok: true };
}
