/**
 * English catalog. English is the fallback for every key, so this file is the
 * canonical key list — every other catalog must keep parity with these keys.
 */
const en = {
  // ---------- App-level ----------
  'app.loading': 'Loading…',
  'app.matching_window': 'Matching window…',

  // ---------- Header ----------
  'header.new_group_button': 'New group',
  'header.new_group_title': 'Create new group',
  'header.new_group_prompt_title': 'New group name',
  'header.new_group_default_name': 'New Group',
  'header.settings': 'Settings',

  // ---------- Search box ----------
  'search.placeholder': 'Search tabs…',
  'search.aria_label': 'Search tabs',
  'search.clear_title': 'Clear (Esc)',
  'search.clear_aria': 'Clear search',

  // ---------- Stats bar ----------
  'stats.aria_label': 'Side panel stats',
  'stats.tabs': 'Tabs',
  'stats.groups': 'Groups',
  'stats.memory': 'Memory',

  // ---------- Group ----------
  'group.empty_hint': 'Empty group — drag a tab here',
  'group.add_tab_title': 'New tab in this group',
  'group.menu_aria': 'More actions',
  'group.manual_title': 'Manual group',
  'group.auto_title': 'Auto group (domain: {domain})',
  'group.menu_rename': 'Rename',
  'group.menu_close_all': 'Close all',
  'group.menu_delete': 'Delete group',
  'group.confirm_delete':
    'Delete group「{name}」?\n(Open tabs move to Untracked; saved tabs are discarded.)',
  'group.confirm_close_all':
    'Close {count} open tab(s) in 「{name}」?\n(Pinned items become saved; unpinned ones are removed from the group.)',

  // ---------- Untracked ----------
  'untracked.title': 'Untracked',
  'untracked.auto_group_button': 'Group by domain',
  'untracked.auto_group_title': 'Sort untracked tabs into per-domain groups',
  'untracked.menu_aria': 'More actions',
  'untracked.menu_close_all': 'Close all',
  'untracked.confirm_close_all': 'Close {count} open tab(s) in Untracked?',

  // ---------- TabItem ----------
  'tab.pin_title': 'Pin (keep as saved when closed)',
  'tab.unpin_title': 'Unpin (remove from group when closed)',
  'tab.pin_aria': 'Pin',
  'tab.unpin_aria': 'Unpin',
  'tab.close_live_title': 'Close tab',
  'tab.remove_saved_title': 'Remove from group',

  // ---------- Empty state ----------
  'empty.title': 'No groups yet',
  'empty.subtitle':
    'Click + at the top-right to create a group,\nor drag a browser tab here.',

  // ---------- Options page ----------
  'options.title': 'Srider Settings',
  'options.loading': 'Loading…',
  'options.language_label': 'Language',
  'options.language_auto': 'Follow browser',
  'options.language_en': 'English',
  'options.language_zh': '简体中文',
  'options.language_ja': '日本語',
  'options.theme_label': 'Theme',
  'options.theme_light': 'Light',
  'options.theme_dark': 'Dark',
  'options.theme_system': 'Follow system',
  'options.show_favicons_label': 'Show favicons',
  'options.show_favicons_desc': 'Show the site icon next to each tab title',
  'options.default_expanded_label': 'New groups expanded',
  'options.default_expanded_desc': 'New groups start expanded by default',
  'options.click_saved_label': 'Click on a saved tab',
  'options.click_saved_current': 'Open in the current tab',
  'options.click_saved_new_tab': 'Open in a new tab',
  'options.click_saved_new_window': 'Open in a new window',
  'options.browser_settings_label': 'Browser settings',
  'options.shortcut_link_title': 'Customize keyboard shortcut',
  'options.shortcut_link_desc':
    'Default Cmd/Ctrl+B toggles the side panel; change at chrome://extensions/shortcuts',
  'options.appearance_link_title': 'Side panel position (left / right)',
  'options.appearance_link_desc':
    'Switch left or right under the "Side panel" section of chrome://settings/appearance',
} as const;

export default en;
export type MessageKey = keyof typeof en;
