import type { MessageKey } from './en';

const zh: Record<MessageKey, string> = {
  // ---------- App-level ----------
  'app.loading': '加载中…',

  // ---------- Header ----------
  'header.new_group_button': '新建分组',
  'header.new_group_title': '新建分组',
  'header.new_group_prompt_title': '新分组名称',
  'header.new_group_default_name': '新分组',
  'header.new_stash_folder_button': '新建文件夹',
  'header.new_stash_folder_title': '新建收藏堆文件夹',
  'header.new_stash_folder_prompt_title': '新文件夹名称',
  'header.new_stash_folder_default_name': '新文件夹',
  'header.settings': '设置',

  // ---------- Switcher ----------
  'switcher.tabs': '标签',
  'switcher.stash': '收藏堆',
  'switcher.aria_label': '切换视图',

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
  'stats.folders': '文件夹',
  'stats.items': '项目',

  // ---------- Group ----------
  'group.empty_hint': '空分组 — 拖标签到这里',
  'group.add_tab_title': '在该分组内新建标签页',
  'group.menu_aria': '更多操作',
  'group.manual_title': '手动分组',
  'group.auto_title': '自动分组（域名：{domain}）',
  'group.menu_rename': '重命名',
  'group.menu_close_all': '关闭所有',
  'group.menu_delete': '删除分组',
  'group.menu_save_to_stash': '保存到收藏堆',
  'group.confirm_delete':
    '删除分组「{name}」？\n（已打开的标签会移到"未分类"）',
  'group.confirm_close_all': '关闭分组「{name}」里的 {count} 个已打开标签？',

  // ---------- Untracked ----------
  'untracked.title': '未分类',
  'untracked.auto_group_button': '按域名分组',
  'untracked.auto_group_title': '按域名自动整理成分组',
  'untracked.menu_aria': '更多操作',
  'untracked.menu_close_all': '关闭所有',
  'untracked.confirm_close_all': '关闭"未分类"里的 {count} 个已打开标签？',

  // ---------- TabItem ----------
  'tab.save_to_stash_title': '保存到收藏堆',
  'tab.save_to_stash_aria': '保存到收藏堆',
  'tab.close_live_title': '关闭标签',
  'tab.menu_aria': '更多操作',
  'tab.menu_rename': '重命名',

  // ---------- Stash ----------
  'stash.empty_title': '收藏堆是空的',
  'stash.empty_subtitle':
    '在这里长期保存标签和分组。\n点 tab 行尾的 ☆，或用分组菜单。',
  'stash.folder_empty_hint': '空文件夹',
  'stash.folder_menu_aria': '更多操作',
  'stash.folder_menu_rename': '重命名',
  'stash.folder_menu_delete': '删除文件夹',
  'stash.folder_menu_open_as_group': '在当前窗口打开为分组',
  'stash.confirm_delete_folder':
    '删除收藏堆文件夹「{name}」及其 {count} 个项目？',
  'stash.item_remove_title': '从收藏堆移除',
  'stash.item_remove_aria': '从收藏堆移除',
  'stash.item_menu_aria': '更多操作',
  'stash.item_menu_rename': '重命名',
  'stash.new_folder_button': '新建文件夹',
  'stash.new_folder_title': '新建文件夹',

  // ---------- Empty state ----------
  'empty.title': '还没有分组',
  'empty.subtitle': '点击顶部的 + 新建分组\n或把浏览器标签拖到这里',

  // ---------- Options page ----------
  'options.title': 'Side Tab 设置',
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
  'options.stash_click_label': '点击收藏堆项目时',
  'options.stash_click_current': '在当前标签页打开',
  'options.stash_click_new_tab': '在新标签页打开',
  'options.stash_click_new_window': '在新窗口打开',
  'options.browser_settings_label': '浏览器设置入口',
  'options.shortcut_link_title': '自定义快捷键',
  'options.shortcut_link_desc':
    '默认 Cmd/Ctrl+B 切换侧边栏，可在 chrome://extensions/shortcuts 修改',
  'options.appearance_link_title': '侧边栏左 / 右位置',
  'options.appearance_link_desc':
    '在 chrome://settings/appearance 的"侧边栏"区切换',
};

export default zh;
