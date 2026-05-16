/**
 * Shared serialized read-modify-write queue for AppData.
 *
 * BOTH tab-handlers and message-handlers must import `withAppData` from here so
 * concurrent writes from Chrome events and UI commands serialize through one
 * chain. Two independent chains would race on getAppData → setAppData and lose
 * updates.
 */
import { getAppData, setAppData } from '$shared/storage';
import type { AppData } from '$shared/types';

let chain: Promise<unknown> = Promise.resolve();

export function withAppData<T>(fn: (data: AppData) => T | Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const data = await getAppData();
    const result = await fn(data);
    await setAppData(data);
    return result;
  });
  // Decouple the chain from rejections; otherwise one failure poisons subsequent writes.
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
