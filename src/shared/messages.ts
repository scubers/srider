/**
 * Typed message protocol between Side Panel / Options UI and the Service Worker.
 *
 * Per spec §2 / CLAUDE.md: most state flow goes through chrome.storage.onChanged.
 * Messages are reserved for COMMANDS that require side effects only the SW can
 * perform (creating Chrome tabs, focusing windows, capturing query results).
 */
import type { GroupId, SavedTabClickBehavior, TabRefId, WindowUUID } from './types';

export type Message =
  | { type: 'createGroup'; windowId: WindowUUID; name: string }
  | { type: 'renameGroup'; windowId: WindowUUID; groupId: GroupId; name: string }
  | { type: 'deleteGroup'; windowId: WindowUUID; groupId: GroupId }
  | { type: 'setActiveGroup'; windowId: WindowUUID; groupId: GroupId | null }
  | { type: 'toggleGroupCollapsed'; windowId: WindowUUID; groupId: GroupId; collapsed: boolean }
  | { type: 'reorderGroups'; windowId: WindowUUID; orderedIds: GroupId[] }
  | {
      type: 'moveTab';
      windowId: WindowUUID;
      tabRefId: TabRefId;
      fromGroupId: GroupId | null; // null = untrackedTabs
      toGroupId: GroupId | null;
      toIndex: number;
    }
  | {
      type: 'removeTab';
      windowId: WindowUUID;
      tabRefId: TabRefId;
      fromGroupId: GroupId | null; // null = untrackedTabs
    }
  | {
      type: 'activateLiveTab';
      tabRefId: TabRefId;
      windowId: WindowUUID;
    }
  | {
      type: 'openSavedTab';
      windowId: WindowUUID;
      tabRefId: TabRefId;
      behavior: SavedTabClickBehavior;
    }
  | {
      type: 'closeLiveTab';
      windowId: WindowUUID;
      tabRefId: TabRefId;
    }
  | {
      type: 'addUrlToGroup';
      windowId: WindowUUID;
      groupId: GroupId;
      url: string;
      title?: string;
      chromeTabId?: number;
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
