/**
 * Typed message protocol between Side Panel / Options UI and the Service Worker.
 *
 * Most state flow goes through chrome.storage.onChanged. Messages are reserved
 * for COMMANDS that require side effects only the SW can perform (creating
 * Chrome tabs, focusing windows, capturing query results, mutating session /
 * local storage).
 *
 * Windows are referenced by their Chrome `chromeWindowId` (a number) — the
 * UUID-based windowId is gone since the redesign.
 */
import type {
  ChromeWindowId,
  GroupId,
  StashFolderId,
  StashItemId,
  StashClickBehavior,
  TabRefId,
} from './types';

export type Message =
  // ---------- Window-scoped: groups & tabs ----------
  | { type: 'createGroup'; chromeWindowId: ChromeWindowId; name: string }
  | { type: 'renameGroup'; chromeWindowId: ChromeWindowId; groupId: GroupId; name: string }
  | { type: 'deleteGroup'; chromeWindowId: ChromeWindowId; groupId: GroupId }
  | {
      type: 'toggleGroupCollapsed';
      chromeWindowId: ChromeWindowId;
      groupId: GroupId;
      collapsed: boolean;
    }
  | { type: 'reorderGroups'; chromeWindowId: ChromeWindowId; orderedIds: GroupId[] }
  | {
      type: 'moveTab';
      chromeWindowId: ChromeWindowId;
      tabRefId: TabRefId;
      fromGroupId: GroupId | null; // null = untrackedTabs
      toGroupId: GroupId | null;
      toIndex: number;
    }
  | {
      type: 'removeTab';
      chromeWindowId: ChromeWindowId;
      tabRefId: TabRefId;
      fromGroupId: GroupId | null;
    }
  | {
      type: 'activateLiveTab';
      chromeWindowId: ChromeWindowId;
      tabRefId: TabRefId;
    }
  | {
      type: 'closeLiveTab';
      chromeWindowId: ChromeWindowId;
      tabRefId: TabRefId;
    }
  | {
      type: 'addUrlToGroup';
      chromeWindowId: ChromeWindowId;
      groupId: GroupId;
      url: string;
      title?: string;
      chromeTabId?: number;
    }
  | { type: 'autoGroupByDomain'; chromeWindowId: ChromeWindowId }
  | {
      type: 'closeAllInGroup';
      chromeWindowId: ChromeWindowId;
      groupId: GroupId | null; // null targets untrackedTabs
    }
  | { type: 'newTabInGroup'; chromeWindowId: ChromeWindowId; groupId: GroupId }

  // ---------- Stash (global) ----------
  | { type: 'createStashFolder'; name: string }
  | { type: 'renameStashFolder'; folderId: StashFolderId; name: string }
  | { type: 'deleteStashFolder'; folderId: StashFolderId }
  | { type: 'toggleStashFolderCollapsed'; folderId: StashFolderId; collapsed: boolean }
  | { type: 'reorderStashFolders'; orderedIds: StashFolderId[] }
  | { type: 'deleteStashItem'; folderId: StashFolderId; itemId: StashItemId }
  | {
      type: 'reorderStashItems';
      folderId: StashFolderId;
      orderedIds: StashItemId[];
    }
  | {
      type: 'saveGroupToStash';
      chromeWindowId: ChromeWindowId;
      groupId: GroupId;
    }
  | {
      type: 'saveTabToStash';
      chromeWindowId: ChromeWindowId;
      tabRefId: TabRefId;
      fromGroupId: GroupId | null; // null = untrackedTabs
      targetFolderId?: StashFolderId; // defaults to a folder named "Unsorted"
    }
  | {
      type: 'openStashItem';
      itemId: StashItemId;
      behavior: StashClickBehavior;
      chromeWindowId: ChromeWindowId;
    }
  | {
      type: 'openStashFolderAsGroup';
      folderId: StashFolderId;
      targetChromeWindowId: ChromeWindowId;
    };

export type MessageResponse = { ok: true } | { ok: false; error: string };

export async function sendMessage(msg: Message): Promise<MessageResponse> {
  try {
    const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse | undefined;
    return response ?? { ok: false, error: 'no response from service worker' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
