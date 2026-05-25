/**
 * Shared serialized read-modify-write queues.
 *
 * BOTH tab event handlers and UI message handlers must funnel writes through
 * here so concurrent mutations from Chrome events and UI commands serialize
 * through a single chain per storage area. Two independent chains would race
 * on get → set and lose updates.
 *
 * Separate chains for AppData (local, Stash) and SessionData (session,
 * per-window state). They don't share data, so they don't need to share a
 * chain.
 */
import {
  getAppData,
  setAppData,
  getSessionData,
  setSessionData,
  setSessionMirror,
} from '$shared/storage';
import type { AppData, SessionData, WindowState } from '$shared/types';
import { projectToMirror } from './session-restore';

// ---------- AppData chain ----------

let appChain: Promise<unknown> = Promise.resolve();

export function withAppData<T>(fn: (data: AppData) => T | Promise<T>): Promise<T> {
  const next = appChain.then(async () => {
    const data = await getAppData();
    const result = await fn(data);
    await setAppData(data);
    return result;
  });
  appChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// ---------- SessionData chain ----------

let sessionChain: Promise<unknown> = Promise.resolve();

export function withSessionData<T>(
  fn: (data: SessionData) => T | Promise<T>,
): Promise<T> {
  const next = sessionChain.then(async () => {
    const data = await getSessionData();
    const result = await fn(data);
    await setSessionData(data);
    scheduleMirrorFlush();
    return result;
  });
  sessionChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// ---------- Cross-restart mirror (write-through, debounced) ----------
//
// Every session write schedules a debounced flush that projects the latest
// SessionData into chrome.storage.local (key `sessionMirror`). Debouncing
// collapses bursts (e.g. onUpdated during navigation) into one write and is
// naturally last-write-wins, so no separate serialization chain is needed —
// `sessionMirror` is a different key from AppData/Stash. The mirror is only
// consumed at startup (session-restore.ts); losing the last <debounce window of
// structural changes if the SW dies before flushing is acceptable.

const MIRROR_FLUSH_DEBOUNCE_MS = 300;
let mirrorFlushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleMirrorFlush(): void {
  if (mirrorFlushTimer !== null) clearTimeout(mirrorFlushTimer);
  mirrorFlushTimer = setTimeout(() => {
    mirrorFlushTimer = null;
    void flushSessionMirror();
  }, MIRROR_FLUSH_DEBOUNCE_MS);
}

/** Project current SessionData into the mirror immediately. */
export async function flushSessionMirror(): Promise<void> {
  const data = await getSessionData();
  await setSessionMirror(projectToMirror(data));
}

/**
 * Cancel any pending debounced mirror flush. Used by startup rehydration (which
 * must not echo its own reconstruction back into the mirror) and by tests (so a
 * pending timer doesn't leak past teardown).
 */
export function cancelMirrorFlush(): void {
  if (mirrorFlushTimer !== null) {
    clearTimeout(mirrorFlushTimer);
    mirrorFlushTimer = null;
  }
}

// Exposed for tests.
export const __testing__ = {
  flushSessionMirror,
  cancelMirrorFlush,
};

/**
 * Convenience: operate on one specific window's state. Creates an empty entry
 * if missing (caller can opt into "return null if absent" by using
 * withSessionData directly).
 */
export function withWindow<T>(
  chromeWindowId: number,
  fn: (state: WindowState) => T | Promise<T>,
): Promise<T> {
  return withSessionData(async (data) => {
    let state = data.windows[chromeWindowId];
    if (!state) {
      state = {
        chromeWindowId,
        groups: [],
        untrackedTabs: [],
      };
      data.windows[chromeWindowId] = state;
    }
    return fn(state);
  });
}
