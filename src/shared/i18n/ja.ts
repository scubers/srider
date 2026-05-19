import type { MessageKey } from './en';

const ja: Record<MessageKey, string> = {
  // ---------- App-level ----------
  'app.loading': '読み込み中…',

  // ---------- Header ----------
  'header.new_group_button': '新規グループ',
  'header.new_group_title': '新しいグループを作成',
  'header.new_group_prompt_title': '新しいグループの名前',
  'header.new_group_default_name': '新しいグループ',
  'header.new_stash_folder_button': '新規フォルダ',
  'header.new_stash_folder_title': '新しいスタッシュフォルダを作成',
  'header.new_stash_folder_prompt_title': '新しいフォルダの名前',
  'header.new_stash_folder_default_name': '新しいフォルダ',
  'header.settings': '設定',

  // ---------- Switcher ----------
  'switcher.tabs': 'タブ',
  'switcher.stash': 'スタッシュ',
  'switcher.aria_label': 'ビューを切り替え',

  // ---------- Search box ----------
  'search.placeholder': 'タブを検索…',
  'search.aria_label': 'タブを検索',
  'search.clear_title': 'クリア (Esc)',
  'search.clear_aria': '検索をクリア',

  // ---------- Stats bar ----------
  'stats.aria_label': 'サイドパネルの統計',
  'stats.tabs': 'タブ',
  'stats.groups': 'グループ',
  'stats.memory': 'メモリ',
  'stats.folders': 'フォルダ',
  'stats.items': 'アイテム',

  // ---------- Group ----------
  'group.empty_hint': '空のグループ — タブをここにドラッグ',
  'group.add_tab_title': 'このグループで新しいタブを開く',
  'group.menu_aria': 'その他の操作',
  'group.manual_title': '手動グループ',
  'group.auto_title': '自動グループ（ドメイン: {domain}）',
  'group.menu_rename': '名前を変更',
  'group.menu_close_all': 'すべて閉じる',
  'group.menu_delete': 'グループを削除',
  'group.menu_save_to_stash': 'スタッシュに保存',
  'group.confirm_delete':
    'グループ「{name}」を削除しますか？\n（開いているタブは未分類に移動します）',
  'group.confirm_close_all': '「{name}」内の開いている {count} 個のタブを閉じますか？',

  // ---------- Untracked ----------
  'untracked.title': '未分類',
  'untracked.auto_group_button': 'ドメインで分類',
  'untracked.auto_group_title': '未分類のタブをドメインごとに自動整理',
  'untracked.menu_aria': 'その他の操作',
  'untracked.menu_close_all': 'すべて閉じる',
  'untracked.confirm_close_all': '未分類の開いている {count} 個のタブを閉じますか？',

  // ---------- TabItem ----------
  'tab.save_to_stash_title': 'スタッシュに保存',
  'tab.save_to_stash_aria': 'スタッシュに保存',
  'tab.close_live_title': 'タブを閉じる',
  'tab.menu_aria': 'その他の操作',
  'tab.menu_rename': '名前を変更',

  // ---------- Stash ----------
  'stash.empty_title': 'スタッシュは空です',
  'stash.empty_subtitle':
    'タブやグループをここに長期保存できます。\nタブの☆をクリックするか、グループメニューから保存。',
  'stash.folder_empty_hint': '空のフォルダ',
  'stash.folder_menu_aria': 'その他の操作',
  'stash.folder_menu_rename': '名前を変更',
  'stash.folder_menu_delete': 'フォルダを削除',
  'stash.folder_menu_open_as_group': 'このウィンドウでグループとして開く',
  'stash.confirm_delete_folder':
    'スタッシュフォルダ「{name}」とその {count} 個のアイテムを削除しますか？',
  'stash.item_remove_title': 'スタッシュから削除',
  'stash.item_remove_aria': 'スタッシュから削除',
  'stash.item_menu_aria': 'その他の操作',
  'stash.item_menu_rename': '名前を変更',
  'stash.new_folder_button': '新規フォルダ',
  'stash.new_folder_title': '新しいフォルダを作成',

  // ---------- Empty state ----------
  'empty.title': 'まだグループがありません',
  'empty.subtitle': '上部の + でグループを作成、\nまたはブラウザタブをここにドラッグしてください。',

  // ---------- Options page ----------
  'options.title': 'Side Tab 設定',
  'options.loading': '読み込み中…',
  'options.language_label': '言語',
  'options.language_auto': 'ブラウザに従う',
  'options.language_en': 'English',
  'options.language_zh': '简体中文',
  'options.language_ja': '日本語',
  'options.theme_label': 'テーマ',
  'options.theme_light': 'ライト',
  'options.theme_dark': 'ダーク',
  'options.theme_system': 'システムに従う',
  'options.show_favicons_label': 'ファビコンを表示',
  'options.show_favicons_desc': 'タブのタイトルの横にサイトアイコンを表示',
  'options.default_expanded_label': '新しいグループを展開状態で作成',
  'options.default_expanded_desc': '新規作成のグループを初期状態で展開する',
  'options.stash_click_label': 'スタッシュアイテムをクリックしたとき',
  'options.stash_click_current': '現在のタブで開く',
  'options.stash_click_new_tab': '新しいタブで開く',
  'options.stash_click_new_window': '新しいウィンドウで開く',
  'options.browser_settings_label': 'ブラウザの設定',
  'options.shortcut_link_title': 'キーボードショートカットをカスタマイズ',
  'options.shortcut_link_desc':
    'デフォルトでは Cmd/Ctrl+B でサイドパネルを切り替えます。chrome://extensions/shortcuts で変更可能',
  'options.appearance_link_title': 'サイドパネルの位置（左 / 右）',
  'options.appearance_link_desc':
    'chrome://settings/appearance の「サイドパネル」セクションで切り替え',
};

export default ja;
