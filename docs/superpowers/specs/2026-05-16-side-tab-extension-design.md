# Side Tab — Chrome 扩展设计文档

**日期**：2026-05-16
**状态**：草案，待实现

## 1. 目标与范围

一个 Chrome 浏览器扩展，在浏览器侧边栏中以"分组"的形式管理标签页。每个分组可以包含若干标签项，标签项既可以是当前打开的（live），也可以是已关闭但保留的（saved）。

**核心功能**：

- 在 Chrome 侧边栏显示分组列表
- 分组可展开/折叠
- 分组可重命名
- 分组可拖动重排
- 标签可在组内重排，可跨组拖动
- 浏览器原生标签可拖入侧边栏分组
- 新打开的标签自动进入"未归类"区段，用户手动拖入分组
- 分组内的标签可以"固定"（pin）；关闭时未 pin 的从分组里删除，pin 过的留作 saved（灰色）
- 每个浏览器窗口拥有独立的分组集
- 用户设置项（主题、favicon 显示、saved 点击行为、默认展开状态）
- "未归类"区段：所有 live 但未分组的标签都在这里
- 键盘快捷键 `Cmd/Ctrl+B`（可在 `chrome://extensions/shortcuts` 自定义）切换侧边栏显示/隐藏

**非目标（v1 不做）**：

- 与 Chrome 原生标签分组（`chrome.tabGroups`）双向同步
- 跨设备同步分组数据
- 全文/URL 搜索
- 标签颜色/图标自定义
- 工作区切换式（Workona/Toby 风格的"激活某组时关闭其他组"）
- 端到端测试

## 2. 架构总览

```
┌────────────────────────────────────────────────────────┐
│                  Chrome Extension (MV3)                │
│                                                         │
│  ┌──────────────────┐         ┌──────────────────┐    │
│  │  Service Worker  │◄────────│   Side Panel UI  │    │
│  │  (background)    │ message │   (Svelte 5)     │    │
│  │                  │         │                  │    │
│  │ • 监听 tab 事件  │         │ • 渲染分组列表    │    │
│  │ • 维护数据一致性 │         │ • 拖拽交互        │    │
│  │ • 窗口指纹匹配   │         │ • 用户操作分发    │    │
│  │ • 启动时恢复     │         │                  │    │
│  └────────┬─────────┘         └────────┬─────────┘    │
│           │                            │              │
│           └──────────┬─────────────────┘              │
│                      ▼                                 │
│           ┌─────────────────────┐                     │
│           │  chrome.storage     │                     │
│           │  ├─ local: 分组数据 │                     │
│           │  └─ sync: 设置项    │                     │
│           └─────────────────────┘                     │
│                                                         │
│  ┌──────────────────┐                                  │
│  │   Options Page   │ ── 写入 sync 存储                │
│  │   (Svelte)       │                                  │
│  └──────────────────┘                                  │
└────────────────────────────────────────────────────────┘
```

**核心约束**：

- **Service Worker 是数据的唯一权威**。Side Panel 关闭时它也要工作（监听 tab 关闭/创建），所以一切 Chrome 事件由 SW 处理，UI 只读取并发出操作指令。
- **存储是 SW 和 UI 的共享通信媒介**。变更写入 storage 后，通过 `chrome.storage.onChanged` 自动通知 UI 刷新（避免手写消息总线）。
- **Side Panel 是 reactive 的**：Svelte 5 runes 订阅 storage，storage 变 → UI 自动更新。

## 3. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 扩展模型 | Manifest V3 | Chrome 当前标准 |
| 侧边栏 | `chrome.sidePanel` API | 不干扰网页布局；位置由 Chrome 设置控制 |
| 前端框架 | Svelte 5（runes） | 编译型小运行时，适合扩展场景的体积要求 |
| 构建 | Vite + `vite-plugin-svelte` | 多入口、HMR 体验好 |
| 拖拽 | `@atlaskit/pragmatic-drag-and-drop` | 框架无关、对嵌套列表 + 跨容器场景支持好、轻量 |
| 语言 | TypeScript | 强类型对消息和存储 schema 至关重要 |
| 测试 | Vitest + `@testing-library/svelte` | 单元 + 组件测试 |

## 4. 数据模型

存储在 `chrome.storage.local`：

```typescript
interface AppData {
  windows: Record<WindowUUID, WindowState>;
  schemaVersion: number;  // 第一版为 1
}

type WindowUUID = string;

interface WindowState {
  id: WindowUUID;
  chromeWindowId: number | null;  // 当前会话的 Chrome windowId，重启后会变
  groups: Group[];                 // 顺序即显示顺序
  untrackedTabs: TabRef[];         // 所有不在分组里的 live 标签都在这
  fingerprint: string[];           // 标签 URL 集合，用于窗口重新关联
  fingerprintUpdatedAt: number;
}

interface Group {
  id: string;
  name: string;
  collapsed: boolean;
  tabs: TabRef[];      // 顺序即显示顺序
  createdAt: number;
}

interface TabRef {
  id: string;          // 稳定 UUID（不是 Chrome 的 tabId）
  url: string;
  title: string;
  favIconUrl?: string;
  chromeTabId: number | null;  // null = saved；number = live
  pinned?: boolean;            // 仅分组内有意义；关闭时 pin 过的留作 saved，未 pin 的删除
  addedAt: number;
}
```

存储在 `chrome.storage.sync`：

```typescript
interface Settings {
  theme: 'light' | 'dark' | 'system';
  showFavicons: boolean;
  savedTabClickBehavior: 'current-tab' | 'new-tab' | 'new-window';
  defaultGroupExpanded: boolean;
}
```

**关键设计点**：

1. `TabRef.id` 是稳定 UUID，而非 Chrome 的 tabId。Chrome 的 tabId 在会话重启后会变化，所以必须有自己的标签身份标识。`chromeTabId` 是"当前这个 TabRef 对应哪个真实 tab"的映射，会随会话变化。
2. `fingerprint`（标签 URL 列表）用于窗口匹配。浏览器重启后 Chrome windowId 会变，靠"这个新窗口里的标签 URLs 是不是和某个存储的 WindowState 高度相似"重新关联。
3. **没有"活动分组"概念**。所有新打开的 Chrome 标签都进入 `untrackedTabs`；用户手动把它们拖入想要的分组。
4. **pin 决定关闭行为**。分组内的 TabRef 关闭时：pin 过的 `chromeTabId` 置 null 留作 saved；未 pin 的直接从 `tabs` 数组删除。`untrackedTabs` 里的标签没有 pin 概念，关闭即丢弃（spec §6.2）。
5. 顺序由数组顺序决定，不引入 `order: number` 字段。
6. `schemaVersion` 留好升级口子。`pinned` 是可选字段，旧数据读出来 `undefined` 视为未 pin。

## 5. UI 设计

### 5.1 Side Panel 布局

```
┌──────────────────────────────────────┐
│ ★ Side Tab          [+]  [⚙]         │  Header
├──────────────────────────────────────┤
│                                       │
│ ▼ 📂 工作 (5)              · · ·     │  Group header
│    🌐  GitHub PR #42                 │   TabItem (live - 实色)
│    🌐  Linear Issue                  │
│    🌐  Notion Doc                    │
│    ○   Old Stack Overflow            │   TabItem (saved - 灰色)
│    🌐  Slack                         │
│                                       │
│ ▶ 📁 学习 (3)              · · ·     │  Group header（折叠）
│                                       │
│ ▼ ⭐ 临时                    · · ·   │
│    🌐  Google              📌 ×      │  pin 状态图标（hover 才显示 × 关闭）
│                                       │
├── 未归类 (2) ────────────────────────┤  untrackedTabs 区段
│    🌐  about:blank                   │
│    🌐  some-random-page              │
└──────────────────────────────────────┘
```

**组件**：

- **Header**：新建分组按钮 `+`，进入设置按钮 `⚙`
- **GroupHeader**：折叠箭头、组名（双击进入重命名输入框）、标签计数徽章 `(live/total)`、"…" 菜单（重命名 / 删除组）
- **TabItem**：favicon、标题（单行截断）、状态徽（live = 实色 / saved = 灰色）、pin 图标（pin 后常显示，未 pin 仅 hover 时显示）、关闭/移除按钮
- 当前正在浏览器里聚焦的 Chrome 标签在面板里高亮显示（左侧 accent 竖条 + 浅色背景）
- **EmptyState**：当无任何分组时显示"拖动标签到这里、或新建分组"提示
- **未归类区段**：面板底部固定区段，显示 `untrackedTabs` 中的标签。区段标题不可编辑，区段内的标签可拖入任意 Group。仅在 `untrackedTabs.length > 0` 时显示。

**TabItem 单击行为**：

- live → `chrome.tabs.update(chromeTabId, { active: true })` + 切到对应窗口
- saved → 按 `savedTabClickBehavior` 设置打开

**拖拽视觉反馈**：

| 操作 | 视觉 |
|---|---|
| 拖分组重排 | 整个 group header 升起，目标插入线 |
| 拖标签组内重排 | 标签升起，组内插入线 |
| 拖标签跨组 | 标签升起，目标组高亮 + 插入线 |
| 拖浏览器标签进来 | 整个面板边框高亮，目标组高亮 |

### 5.2 Options Page

```
┌── Side Tab 设置 ─────────────────────┐
│                                       │
│  主题       ( ) 浅色 ( ) 深色 (●) 跟随系统│
│                                       │
│  显示 favicon         [ ✓ ]           │
│                                       │
│  默认分组展开         [ ✓ ]           │
│                                       │
│  点击已保存标签时:                     │
│   ( ) 在当前标签页打开                │
│   (●) 在新标签页打开                  │
│   ( ) 在新窗口打开                    │
└───────────────────────────────────────┘
```

独立页面（`options_ui.open_in_tab: true`），保存即写入 `chrome.storage.sync`。

## 6. 关键交互流程

### 6.1 新标签创建（一律进未归类）

```
chrome.tabs.onCreated 触发
  └─> Service Worker:
       1. 从 chromeTabId 找出所属 chromeWindowId
       2. 查 chromeWindowId 对应的 WindowState（由 6.6 / 6.8 维护）
          ├─> 若窗口刚开还在匹配中（见 6.8）→ 把事件入队，等匹配完再回放
          └─> 若没有对应 WindowState → 延迟重试（有限次）
       3. 检查 pendingOpens：URL 命中则关联现有 TabRef（6.4 触发的）→ 完成
       4. 检查 state 里是否已有同 chromeTabId 的 TabRef（recovery 可能已建）
          → 有 → 仅更新字段，不重复创建
       5. 在 state.untrackedTabs 尾部追加新 TabRef { chromeTabId, url, title }
          （没有"活动分组"，新标签一律进 untrackedTabs）
       6. 写入 storage.local
            └─> storage.onChanged → Side Panel UI 自动刷新
```

**"未归类"区段**：UI 显示 `state.untrackedTabs` 的内容。用户用拖拽或右键菜单把标签移入想要的分组。

`pendingOpens` 是 SW 维护的短期映射：

```typescript
pendingOpens: Map<url, { tabRefId, timestamp }>
// 调 chrome.tabs.create() 前写入
// onCreated 时若命中 URL → 关联到现有 TabRef
// 10s 后无人认领则清理
```

存储在 `chrome.storage.session` 中，SW 重启时不丢，浏览器重启时丢。

### 6.2 标签关闭 → 看 pin

```
chrome.tabs.onRemoved 触发
  └─> SW: 扫描所有 WindowState，对所有 chromeTabId 命中的 TabRef:
        分组内的 TabRef:
          ├─> tab.pinned === true  → chromeTabId 置 null（变 saved，灰色保留）
          └─> tab.pinned 非 true   → 从 group.tabs 数组里删除
        untrackedTabs 内的 TabRef:
          └─> 一律删除（live-only 设计，没有 pin 概念）
        立即写入 storage（不 debounce，防止 SW 被回收时丢数据）
```

只有用户主动 pin 过的标签关闭后才会留在面板里。这避免了未 pin 标签关掉后还要再手动清理。

### 6.3 标签 URL/标题变更

```
chrome.tabs.onUpdated 触发（status === 'complete' 时）
  └─> SW: 找到 TabRef
        ├─> 更新 url、title、favIconUrl
        └─> debounced 写入 storage
```

标签内导航会改 TabRef 的 URL —— 因为 TabRef 代表"那个标签"，标签去哪它就去哪。

### 6.4 点击 saved 标签

```
UI 收到 click
  └─> 发指令到 SW（包含 tabRefId + 用户设置的打开方式）
       ├─> SW 把 URL 写入 pendingOpens
       └─> 调 chrome.tabs.create({ url, ... })
             └─> Chrome 触发 onCreated → 流程 A 命中 pendingOpens
                   只更新现有 TabRef.chromeTabId，不新增
```

### 6.5 拖浏览器标签到面板

```
用户从 Chrome 标签栏拖标签
  └─> Side Panel 收到 drop event
        ├─> 读 dataTransfer："text/uri-list" 或 "text/plain" 拿到 URL
        ├─> 通过 chrome.tabs.query({ url }) 找到该 chromeTabId
        └─> 发指令给 SW：把这个 tab 加入目标组
              └─> SW: 在目标组追加 TabRef，并把它从原所属组（如有）移除
```

**已知限制**：Chrome 拖出的标签 dataTransfer 里只有 URL，没有可靠的 tabId。匹配靠 URL，同 URL 多开时取最近活动的那个。

### 6.6 浏览器重启后的窗口重新关联

```
SW 启动 (chrome.runtime.onStartup)
  ├─> chrome.windows.getAll({ populate: true })
  ├─> 读 storage.local 拿到所有 WindowState
  └─> 对每个 Chrome 窗口：
        计算它当前标签的 URL 集合
        与每个 WindowState.fingerprint 求 Jaccard 相似度
        贪心匹配（取最高分，阈值 0.5）
        ├─> 命中：
        │    1. 更新 chromeWindowId
        │    2. TabRef ↔ Chrome tab 配对：按 URL 匹配
        │       - 多个 TabRef 同 URL 时按数组顺序消费 Chrome 标签
        │       - 匹配上的 TabRef.chromeTabId 设为对应 Chrome tabId
        │       - 没匹配上的 TabRef.chromeTabId 设为 null（变 saved）
        │       - 没匹配上的 Chrome 标签放入 untrackedTabs
        └─> 未命中 → 创建新 WindowState（无分组，当前所有标签放入 untrackedTabs）

未被匹配的旧 WindowState：
  ├─> 标记为"孤立"
  ├─> 30 天后清理（启动时检查 fingerprintUpdatedAt）
  └─> v1 不做手动恢复 UI
```

### 6.7 窗口关闭

```
chrome.windows.onRemoved 触发
  └─> SW: 找到对应 WindowState
        ├─> 保留 groups、fingerprint
        ├─> chromeWindowId 设为 null
        ├─> 所有 group 内 TabRef.chromeTabId 置 null（变 saved）
        └─> untrackedTabs 清空（live-only 设计，无可恢复语义；
            其 URLs 已经在上次更新的 fingerprint 里，6.6 重新匹配时
            会从 snapshot 重建）

→ 下次同 fingerprint 的窗口出现时（6.6），会重新关联
```

### 6.8 新窗口打开

```
chrome.windows.onCreated 触发
  ├─> SW 开启此窗口的"事件缓冲"模式：
  │     该窗口 chromeWindowId 的 onCreated/onUpdated/onRemoved 事件先入队
  └─> 等待标签稳定（短延时 ~500ms 等 onCreated 风暴结束）
        ├─> 计算新窗口的 URL 集合
        ├─> 与现存 WindowState.fingerprint 匹配（同 6.6）
        ├─> 命中 → 关联
        └─> 未命中 → 创建新 WindowState（无分组，已存在标签进 untrackedTabs）
        ──> 关闭缓冲模式，按顺序回放队列里的事件
```

**会话恢复时的关键差异**：如果用户开启了 Chrome 的"恢复上次会话"，浏览器启动时多个 `onCreated` 几乎同时来。`onStartup` 会先跑（6.6 处理批量），随后的窗口都已匹配。但若用户手动开了个新窗口同时启动也在进行，可能出现窗口竞速——以 `chromeWindowId` 作为缓冲 key，互不干扰即可。

### 6.9 删除分组

```
UI 发出删除指令（含 groupId）
  └─> SW:
        ├─> 找到 Group
        ├─> 把 Group 里 chromeTabId !== null 的 TabRef 移到 untrackedTabs
        │    （这些 live 标签不关闭，只是脱离分组，pin 状态丢弃）
        ├─> 丢弃 Group 里所有 saved TabRef
        ├─> 从 groups 数组移除 Group
        └─> 写入 storage
```

**为什么 live 标签转到 untrackedTabs 而不是直接丢弃**：丢弃后 chromeTabId 索引就找不到这些 tab，它们的关闭/导航事件会被忽略——但 tab 还开着，状态不一致。保留在 untrackedTabs 让追踪保持完整。

### 6.10 Side Panel 知道自己属于哪个窗口

```
Side Panel 启动时：
  ├─> 调 chrome.windows.getCurrent() → 拿到当前 chromeWindowId
  ├─> 查 AppData.windows 找 chromeWindowId 匹配的 WindowState
  └─> 仅渲染该 WindowState 的 groups
```

`chrome.windows.getCurrent()` 在侧边栏里返回包含侧边栏的窗口。

### 6.11 键盘快捷键切换侧边栏

Chrome 的 `chrome.sidePanel` API 没有提供"关闭"方法。利用 Chrome `commands` API + 一个长连 port 实现 toggle：

```
manifest commands:
  toggle-side-panel: 默认 Ctrl+B / Cmd+B（用户可在 chrome://extensions/shortcuts 改）

侧边栏挂载时：
  chrome.runtime.connect({ name: 'sidepanel' })
  → 向 SW 发 { type: 'hello', chromeWindowId }
  → 监听 port.onMessage：收到 { type: 'close' } 时调 window.close()

SW：
  chrome.runtime.onConnect 收到 'sidepanel' 命名的 port
    └─> 缓存 Map<chromeWindowId, Port>
        port.onDisconnect 触发时清理（用户关闭侧边栏会触发）

  chrome.commands.onCommand('toggle-side-panel'):
    └─> 取当前窗口的 chromeWindowId
        ├─> Map 有 port → postMessage({ type: 'close' })
        └─> Map 没有 port → chrome.sidePanel.open({ windowId })
```

`chrome.commands` 事件算作用户手势，满足 `chrome.sidePanel.open` 对手势的要求。

## 7. 存储与 Service Worker 生命周期

### 7.1 存储分布

| 内容 | 存储 | 理由 |
|---|---|---|
| 分组、标签、窗口状态 | `chrome.storage.local` | 数据量可能大，sync 配额撑不住 |
| 设置项 | `chrome.storage.sync` | 体积小，跨设备同步是期望行为 |
| 短期运行态（`pendingOpens`） | `chrome.storage.session` | SW 重启时不丢，浏览器重启时丢 |

### 7.2 写入策略

- 默认 `debouncedWrite()`：150ms 合并连续写
- 用户主动操作（拖拽、重命名、删除）立即写
- `onRemoved` 立即写，防 SW 回收丢数据

### 7.3 Service Worker 被回收的应对

MV3 SW 空闲 ~30 秒后可能被回收。要做到：

1. 不在内存里持有不能恢复的状态。短期态用 `chrome.storage.session`
2. `onStartup` 和 `onInstalled` 都要处理初始化
3. **所有 Chrome 事件监听器必须在 SW 顶层立即注册**，不能在 async 函数里 await 后才注册——否则 SW 被回收后再启动时事件可能错过

```typescript
// 正确
chrome.tabs.onCreated.addListener(handleTabCreated);
chrome.tabs.onRemoved.addListener(handleTabRemoved);

// 错误
async function init() {
  await loadStuff();
  chrome.tabs.onCreated.addListener(...);  // 太晚了
}
init();
```

### 7.4 Storage 抽象

```typescript
// shared/storage.ts
export async function getAppData(): Promise<AppData>;
export async function setAppData(data: AppData): Promise<void>;
export async function updateAppData(fn: (data: AppData) => void): Promise<void>;
export function onAppDataChange(cb: (data: AppData) => void): () => void;
```

UI 用 Svelte 5 runes 包一层：

```typescript
// shared/stores.svelte.ts
export const appData = $state<AppData>(emptyAppData());
// 启动时 getAppData() → 赋值；onAppDataChange → 同步更新
```

## 8. 项目结构

```
chrome-side-tab/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── svelte.config.js
├── README.md
│
├── src/
│   ├── background/
│   │   ├── service-worker.ts
│   │   ├── tab-handlers.ts
│   │   ├── window-matcher.ts
│   │   └── message-handlers.ts
│   │
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.svelte
│   │   └── components/
│   │       ├── GroupList.svelte
│   │       ├── Group.svelte
│   │       ├── GroupHeader.svelte
│   │       ├── TabItem.svelte
│   │       ├── RenameInput.svelte
│   │       └── EmptyState.svelte
│   │
│   ├── options/
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── Options.svelte
│   │
│   ├── shared/
│   │   ├── types.ts
│   │   ├── storage.ts
│   │   ├── stores.svelte.ts
│   │   ├── messages.ts
│   │   ├── id.ts
│   │   └── theme.ts
│   │
│   └── assets/
│       └── icons/                   # 16/32/48/128 px
│
└── public/
```

## 9. manifest.json

```json
{
  "manifest_version": 3,
  "name": "Side Tab",
  "version": "0.1.0",
  "description": "在侧边栏管理标签分组",
  "permissions": [
    "tabs",
    "storage",
    "sidePanel",
    "sessions"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel/index.html"
  },
  "options_ui": {
    "page": "options/index.html",
    "open_in_tab": true
  },
  "action": {
    "default_title": "打开 Side Tab"
  },
  "commands": {
    "toggle-side-panel": {
      "suggested_key": { "default": "Ctrl+B", "mac": "Command+B" },
      "description": "切换 Side Tab 侧边栏"
    }
  },
  "icons": {
    "16": "assets/icons/16.png",
    "48": "assets/icons/48.png",
    "128": "assets/icons/128.png"
  },
  "minimum_chrome_version": "114"
}
```

不需要 `host_permissions`——只读 tab 元数据（URL/title），不访问页面内容。

`action` 没有 popup，点击图标的行为通过 SW 里 `chrome.sidePanel.open()` 触发打开侧边栏。

## 10. 构建配置

```typescript
// vite.config.ts 核心
export default defineConfig({
  plugins: [svelte()],
  build: {
    rollupOptions: {
      input: {
        sidepanel: 'src/sidepanel/index.html',
        options: 'src/options/index.html',
        background: 'src/background/service-worker.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
});
```

构建脚本把 `manifest.json` 复制到 `dist/`，路径指向编译后的产物。

## 11. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| 单元 | Vitest | `window-matcher`、`storage` 抽象、UUID 生成、消息序列化 |
| 组件 | Vitest + `@testing-library/svelte` | Group / TabItem 渲染、交互回调 |
| 集成 | 手动 | 装到真实 Chrome 走主要流程 |
| E2E | （v1 不做） | 未来用 Playwright 扩展模式 |

## 11.5 安全模型

少量必要的输入校验。详见 `src/shared/url.ts`。

| 攻击面 | 校验 |
|---|---|
| 点击 saved 标签（`openSavedTab`）/ 添加外部 URL（`addUrlToGroup`） | 协议必须是 `http`/`https`/`ftp`/`file`/`about`/`chrome-extension` 之一；否则拒绝 |
| 外部拖入侧边栏（`text/uri-list`、`text/plain`） | 同上 |
| favicon `<img src>` | 必须是 `http(s)`/`chrome://`/`chrome-extension://`；data:/javascript: 拒绝 |
| `chrome.runtime.onMessage` | 检查 `sender.id === chrome.runtime.id`，拒绝来自其他扩展的消息；并对 `msg.type` 做形状校验 |
| 存储读写（`AppData.windows[key]`、`pendingOpens[url]`） | 用 `Object.hasOwn` 访问，过滤 `__proto__` / `constructor` / `prototype` 这类危险 key |
| `pendingOpens` 容量 | 最多 100 条，超出按时间戳淘汰最旧的（避免无限增长） |

## 12. 已知风险与未决问题

1. **从 Chrome 标签栏拖入侧边栏**依赖 dataTransfer 里只能拿到 URL，不能精确匹配 tabId。同 URL 多开时按"最近活动"启发式匹配，可能不准。
2. **窗口指纹匹配是启发式的**：用户关掉窗口、用同样 URL 集合开了个新窗口时，可能误关联。可接受，因为损失只是"两个窗口共用了同一份分组数据"，不会丢数据。
3. **Service Worker 短期回收**带来的事件错过：所有事件监听器顶层注册可以缓解，但 SW 完全冷启动时第一个 onCreated 可能在事件分发前就发生——MV3 平台限制，无完美解。
4. **分组数据量上限**：`chrome.storage.local` 默认 10MB。若用户分组爆炸，应在 v2 加清理 UI 或 `unlimitedStorage` 权限。
5. **pendingOpens 同 URL 撞车**：用户连续点同一 URL 的两个 saved 标签时，`pendingOpens` 用 URL 作 key 会相互覆盖，导致第二次点击 relink 失败、在 untrackedTabs 里多出一个 TabRef，原 saved 状态没变化。v1 可接受；v2 改为给 URL 加查询参数指纹或换 Map 结构。

## 13. 后续可能的演进（不在 v1 范围）

- 跨设备同步分组数据（需要外部存储或 sync 分片）
- 工作区切换模式（活动组切换时关闭/打开标签）
- 分组颜色 / emoji
- 全文搜索
- 与 Chrome 原生标签分组联动
- 标签拖入/拖出窗口时的归属继承
- 撤销/重做
- 键盘快捷键自定义
