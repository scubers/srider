import type { MessageKey } from './en';

const ja: Record<MessageKey, string> = {
  // ---------- App-level ----------
  'app.loading': '読み込み中…',
  'app.matching_window': 'ウィンドウを照合中…',

  // ---------- Header ----------
  'header.new_group_button': '新規グループ',
  'header.new_group_title': '新しいグループを作成',
  'header.new_group_prompt_title': '新しいグループの名前',
  'header.new_group_default_name': '新しいグループ',
  'header.settings': '設定',

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

  // ---------- Group ----------
  'group.empty_hint': '空のグループ — タブをここにドラッグ',
  'group.add_tab_title': 'このグループで新しいタブを開く',
  'group.menu_aria': 'その他の操作',
  'group.manual_title': '手動グループ',
  'group.auto_title': '自動グループ（ドメイン: {domain}）',
  'group.menu_rename': '名前を変更',
  'group.menu_close_all': 'すべて閉じる',
  'group.menu_delete': 'グループを削除',
  'group.confirm_delete':
    'グループ「{name}」を削除しますか？\n（開いているタブは未分類に移動し、保存済みのタブは破棄されます）',
  'group.confirm_close_all':
    '「{name}」内の開いている {count} 個のタブを閉じますか？\n（ピン留めされたものは saved として残り、それ以外はグループから削除されます）',

  // ---------- Untracked ----------
  'untracked.title': '未分類',
  'untracked.auto_group_button': 'ドメインで分類',
  'untracked.auto_group_title': '未分類のタブをドメインごとに自動整理',
  'untracked.menu_aria': 'その他の操作',
  'untracked.menu_close_all': 'すべて閉じる',
  'untracked.confirm_close_all': '未分類の開いている {count} 個のタブを閉じますか？',

  // ---------- TabItem ----------
  'tab.pin_title': 'ピン留め（閉じても saved として保持）',
  'tab.unpin_title': 'ピン留めを解除（閉じるとグループから削除）',
  'tab.pin_aria': 'ピン留め',
  'tab.unpin_aria': 'ピン留めを解除',
  'tab.close_live_title': 'タブを閉じる',
  'tab.remove_saved_title': 'グループから削除',

  // ---------- Empty state ----------
  'empty.title': 'まだグループがありません',
  'empty.subtitle': '右上の + でグループを作成、\nまたはブラウザタブをここにドラッグしてください。',

  // ---------- Options page ----------
  'options.title': 'Srider 設定',
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
  'options.click_saved_label': '保存済みタブをクリックしたとき',
  'options.click_saved_current': '現在のタブで開く',
  'options.click_saved_new_tab': '新しいタブで開く',
  'options.click_saved_new_window': '新しいウィンドウで開く',
  'options.browser_settings_label': 'ブラウザの設定',
  'options.shortcut_link_title': 'キーボードショートカットをカスタマイズ',
  'options.shortcut_link_desc':
    'デフォルトでは Cmd/Ctrl+B でサイドパネルを切り替えます。chrome://extensions/shortcuts で変更可能',
  'options.appearance_link_title': 'サイドパネルの位置（左 / 右）',
  'options.appearance_link_desc':
    'chrome://settings/appearance の「サイドパネル」セクションで切り替え',
};

export default ja;
