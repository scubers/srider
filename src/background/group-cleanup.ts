/**
 * Auto-domain groups are ephemeral organizers — when their last item is
 * removed, the group itself goes away. Manual groups stay even when empty
 * because the user created them deliberately.
 *
 * Call this after any mutation that may have emptied a group:
 *   - handleTabRemoved (unpinned items dropped from a group)
 *   - handleTabAttached (tab moved to another window)
 *   - moveTab / removeTab from the UI
 */
import type { WindowState } from '$shared/types';

/** Returns the number of groups removed (useful for tests / logging). */
export function cleanupEmptyAutoGroups(window: WindowState): number {
  const before = window.groups.length;
  window.groups = window.groups.filter(
    (g) => !(g.kind === 'auto-domain' && g.tabs.length === 0),
  );
  return before - window.groups.length;
}
