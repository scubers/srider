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
} from '$shared/storage';
import type { AppData, SessionData, WindowState } from '$shared/types';

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
    return result;
  });
  sessionChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

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
