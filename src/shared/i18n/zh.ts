import type { MessageKey } from './en';

const zh: Record<MessageKey, string> = {
  // ---------- App-level ----------
  'app.loading': '加载中…',
  'app.matching_window': '正在匹配窗口…',

  // ---------- Header ----------
  'header.new_group_button': '新建分组',
  'header.new_group_title': '新建分组',
  'header.new_group_prompt_title': '新分组名称',
  'header.new_group_default_name': '新分组',
  'header.settings': '设置',

  // ---------- Search box ----------
  'search.placeholder': '搜索标签…',
  'search.aria_label': '搜索标签',
  'search.clear_title': '清空 (Esc)',
  'search.clear_aria': '清空搜索',

  // ---------- Stats bar ----------
  'stats.aria_label': '侧边栏统计',
  'stats.tabs': '标签',
  'stats.groups': '分组',
  'stats.memory': '内存',

  // ---------- Group ----------
  'group.empty_hint': '空分组 — 拖标签到这里',
  'group.add_tab_title': '在该分组内新建标签页',
  'group.menu_aria': '更多操作',
  'group.manual_title': '手动分组',
  'group.auto_title': '自动分组（域名：{domain}）',
  'group.menu_rename': '重命名',
  'group.menu_close_all': '关闭所有',
  'group.menu_delete': '删除分组',
  'group.confirm_delete':
    '删除分组「{name}」？\n（已打开的标签会移到"未归类"，已保存的标签将丢失）',
  'group.confirm_close_all':
    '关闭分组「{name}」里的 {count} 个已打开标签？\n（pin 过的会保留为 saved；未 pin 的会从分组里删除）',

  // ---------- Untracked ----------
  'untracked.title': '未分类',
  'untracked.auto_group_button': '按域名分组',
  'untracked.auto_group_title': '按域名自动整理成分组',
  'untracked.menu_aria': '更多操作',
  'untracked.menu_close_all': '关闭所有',
  'untracked.confirm_close_all': '关闭"未分类"里的 {count} 个已打开标签？',

  // ---------- TabItem ----------
  'tab.pin_title': '固定（关闭后保留为 saved）',
  'tab.unpin_title': '取消固定（关闭时一并删除）',
  'tab.pin_aria': '固定',
  'tab.unpin_aria': '取消固定',
  'tab.close_live_title': '关闭标签',
  'tab.remove_saved_title': '从分组移除',

  // ---------- Empty state ----------
  'empty.title': '还没有分组',
  'empty.subtitle': '点击右上角的 + 新建分组\n或把浏览器标签拖到这里',

  // ---------- Options page ----------
  'options.title': 'Srider 设置',
  'options.loading': '加载中…',
  'options.language_label': '语言',
  'options.language_auto': '跟随浏览器',
  'options.language_en': 'English',
  'options.language_zh': '简体中文',
  'options.language_ja': '日本語',
  'options.theme_label': '主题',
  'options.theme_light': '浅色',
  'options.theme_dark': '深色',
  'options.theme_system': '跟随系统',
  'options.show_favicons_label': '显示 favicon',
  'options.show_favicons_desc': '在标签前显示网站图标',
  'options.default_expanded_label': '新建分组默认展开',
  'options.default_expanded_desc': '新创建的分组初始为展开状态',
  'options.click_saved_label': '点击已保存标签时',
  'options.click_saved_current': '在当前标签页打开',
  'options.click_saved_new_tab': '在新标签页打开',
  'options.click_saved_new_window': '在新窗口打开',
  'options.browser_settings_label': '浏览器设置入口',
  'options.shortcut_link_title': '自定义快捷键',
  'options.shortcut_link_desc':
    '默认 Cmd/Ctrl+B 切换侧边栏，可在 chrome://extensions/shortcuts 修改',
  'options.appearance_link_title': '侧边栏左 / 右位置',
  'options.appearance_link_desc':
    '在 chrome://settings/appearance 的"侧边栏"区切换',
};

export default zh;
