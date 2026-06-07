# Side Tab — 重新设计:Stash 模型

**日期**:2026-05-19
**状态**:草案,待实施
**替代**:`2026-05-16-side-tab-extension-design.md`(本文档生效后该文件作废)

## 0. 背景与动机

> **2026-05-26 修订**:本节"跨重启 = 重来"的决定已被 [`2026-05-26-restart-group-recovery-design.md`](2026-05-26-restart-group-recovery-design.md) 局部修订。该方案通过 write-through 镜像 + 仅启动时的一次性窗口匹配,把 Chrome 自己重开的 live tab 按上一会话归位,**不**重新引入 saved tab,也**不**在运行期做增量窗口匹配(故避开下文那个 bug 的整类问题)。

原 spec 采用 per-window `WindowState` + UUID + Jaccard 指纹的方案,在实际使用中暴露关键 bug:打开新窗口时 `matchWindows` 全量 reset 所有 `chromeWindowId` 而只重建新窗口的对应字段,导致已存在的窗口"无家可归",新窗口可能错配旧窗口的分组(原 spec §6.6 / §6.8 设计的全量匹配语义在"只传一个新 snapshot"的调用路径上是错的)。

深入讨论后确认:
- pin 概念本质上是"全局收藏",与 Chrome 原生 bookmark 行为重合——需要把"持久化"和"窗口内整理"分离
- 自动分组(按域名)在心智上属于"当前窗口的临时整理动作"
- 跨重启 = 重来。要保留的东西用户应显式存

由此引出三个干净分层的概念,**消除窗口身份这个易错抽象**。

## 1. 三个概念

### Manual group(per-window, ephemeral)
- 用户在当前 Chrome 窗口手动 `+` 创建
- 含 `tabs: TabRef[]`,全是 live(无 saved 概念)
- 关闭一个 tab → 直接从组里删除(**无 pin / saved**)
- 窗口关闭或浏览器重启 → 整组丢

### Auto-domain group(per-window, ephemeral)
- 点"按域名分组"按钮生成
- 行为同 manual,但带 `autoDomain` 字段,用于同窗口内多次点击合并
- 组内 tab 全删空时自动删除组
- 窗口关闭或浏览器重启 → 丢

### Stash(global, persistent)
- 跨窗口共享、跨浏览器重启持久化
- 结构:一层 `StashFolder`(不嵌套),每个 folder 含 `items: StashItem[]`
- `StashItem` 是纯 URL 快照,无 `chromeTabId`,无 live/saved 派生状态
- 点击 stash item: `chrome.tabs.create({ url, windowId: currentWindowId })` → 新 tab 落入当前窗口 untracked
- StashItem 本身永远不变(不被"消费")

**唯一的跨层动作:**
- 任意 group → "保存到 Stash" → 整组复制为新 `StashFolder`(源不动)
- 单个 tab → "保存到 Stash"(行尾 ☆)→ 加到目标 folder(默认 "Unsorted")
- Stash folder → "在当前窗口打开为分组" → 在当前窗口新建 manual group + 打开所有 tab(源 folder 不动)

## 2. 数据模型

### 持久层(`chrome.storage.local`)
```typescript
export const SCHEMA_VERSION = 2 as const;

interface AppData {
  stash: StashFolder[];   // 顺序即显示顺序
  schemaVersion: number;
}

interface StashFolder {
  id: string;           // UUID
  name: string;
  collapsed: boolean;
  items: StashItem[];   // 顺序即显示顺序
  createdAt: number;
}

interface StashItem {
  id: string;           // UUID
  url: string;
  title: string;
  favIconUrl?: string;
  addedAt: number;
}
```

### 会话层(`chrome.storage.session`,按 chromeWindowId 索引)
```typescript
interface SessionState {
  windows: Record<number /* chromeWindowId */, WindowState>;
}

interface WindowState {
  chromeWindowId: number;
  manualGroups: Group[];
  autoGroups: Group[];
  untrackedTabs: TabRef[];
}

interface Group {
  id: string;
  name: string;
  collapsed: boolean;
  tabs: TabRef[];
  createdAt: number;
  kind: 'manual' | 'auto-domain';
  autoDomain?: string;   // 仅 auto-domain
}

interface TabRef {
  id: string;
  url: string;
  title: string;
  favIconUrl?: string;
  chromeTabId: number;   // 总是有值;关闭时整个 TabRef 删除
  addedAt: number;
}
```

### 设置层(`chrome.storage.sync`)
```typescript
interface Settings {
  theme: 'light' | 'dark' | 'system';
  showFavicons: boolean;
  stashClickBehavior: 'current-tab' | 'new-tab' | 'new-window';  // 原 savedTabClickBehavior 改名
  defaultGroupExpanded: boolean;
  language: 'auto' | 'en' | 'zh' | 'ja';
}
```

### 删除的旧字段
- `WindowState.id` (UUID)、`fingerprint`、`fingerprintUpdatedAt`、`chromeWindowId: null`
- `TabRef.chromeTabId: null`(saved)、`TabRef.pinned`
- `AppData.windows`(改放 session,索引方式从 UUID 变成 chromeWindowId)
- `SessionState.pendingOpens`(saved 重开机制移除)

## 3. 存储 + 生命周期

### 存储分布
| Store | 内容 | 选择理由 |
|---|---|---|
| `chrome.storage.local` | `AppData`(只有 stash) | 跨重启持久,10MB 额度 |
| `chrome.storage.session` | `SessionState.windows` | SW 回收不丢、浏览器重启丢——正是 per-window 想要的语义 |
| `chrome.storage.sync` | `Settings` | 跨设备同步 |

### 关键简化
`chrome.storage.session` **天然就是**"per Chrome session 生存期",不需要自己写窗口身份/清理逻辑。

### Per-window 生命周期
```
chrome.windows.onCreated(window)
  → sessionStore.windows[window.id] = emptyWindowState(window.id)
  → chrome.tabs.query({windowId}) → 全部当 untracked

chrome.windows.onRemoved(chromeWindowId)
  → delete sessionStore.windows[chromeWindowId]

chrome.runtime.onStartup / onInstalled
  → 对每个 chrome.windows.getAll({populate:true}):
       建 emptyWindowState + 填 untracked
  → 无匹配、无 Jaccard、无 fingerprint
```

### SW 回收
- 所有 `chrome.*` 监听器在 SW 顶层同步注册(原约束不变)
- 数据在 session store → SW 醒来重读即可

### 写入策略
- 默认 debounced ~150ms(高频 `onUpdated` 等)
- 用户动作(建组、重命名、拖动、Save to Stash):立即写
- `onRemoved` / `onWindowRemoved`:立即写
- Stash 写入永远立即(唯一持久层)

## 4. 关键交互流程(与旧 spec 的差异点)

### 4.1 Tab 事件
- **onCreated**:找 WindowState by `tab.windowId`,不存在则同步建。检查 `pendingNewTabRoute`(命中 → 入指定 group;否则 untracked)。**无 pendingOpens(saved 重开)分支**。
- **onRemoved**:找到 TabRef → 直接删除。**无 pin 分支**。仍 `cleanupEmptyAutoGroups`。
- **onReplaced**(tab discard/restore、搜索预渲染):旧 chromeTabId 死亡**不发 onRemoved**,新 id 出现**不发 onCreated**。SW 必须把 TabRef.chromeTabId **原位重绑**到新 id(保位置、保 alias);若新 id 已被跟踪,旧 id 条目按重复删除。不处理它 = TabRef 永久指向死 id,成为幽灵行(见 4.9)。
- **onAttached**(跨窗口拖):源 WindowState 删 TabRef → 目标 `untrackedTabs.push`。push 前先清掉目标窗口中同 chromeTabId 的已有 TabRef——拖出成新窗口时 `windows.onCreated` 的 `tabs.query` 可能抢先 seed 一份;不清就是重复条目(onRemoved 只删第一个匹配,另一份成幽灵行)。

### 4.2 窗口事件
- **onCreated**:同步建 emptyWindowState + 填 untracked。**不需要 windowBuffers / NEW_WINDOW_SETTLE_MS**。
- **onRemoved**:`delete sessionStore.windows[id]`。无"保留 saved"。
- **onStartup / onInstalled**:全量扫所有 chrome.windows,各自建 state。无匹配。

### 4.3 Auto-group by domain(限当前窗口)
```
state = sessionStore.windows[currentWindowId]
以 state.autoGroups 已有 autoDomain 建索引
遍历 state.untrackedTabs → 按 host 分桶 → 入桶或留 untracked
对每个桶:已有 → 追加;未有 → 新建 auto-group
```
逻辑同旧 spec,但 scope 锁在当前窗口的 `autoGroups` + `untrackedTabs`。

### 4.4 Save group to Stash(新)
```
SW msg { type: 'saveGroupToStash', windowId, groupId }
→ 取 group → 新建 StashFolder { name: group.name, items: group.tabs.map(toStashItem) }
→ append 到 AppData.stash → 立即写 local
→ 源 group 不动(复制语义)
```

### 4.5 Save tab to Stash(新)
```
SW msg { type: 'saveTabToStash', sourceWindowId, tabRefId, targetFolderId? }
→ 找 TabRef → 转 StashItem
→ targetFolderId 缺省 → 默认 folder "Unsorted"(没有则自动创建)
→ append → 立即写
```
UI 入口:tab 行 hover 时尾部 ☆,点击 → 默认 Unsorted 或弹小 picker。

### 4.6 点击 Stash item(新)
```
SW msg { type: 'openStashItem', itemId }
→ 根据 settings.stashClickBehavior:
    'current-tab'  → chrome.tabs.update(activeTabId, { url })
    'new-tab'      → chrome.tabs.create({ url, windowId: currentWindowId })
    'new-window'   → chrome.windows.create({ url })
→ 新 tab 走 onCreated → 落 untracked
→ Stash item 本身不动
```

### 4.7 Open Stash folder as group(新)
```
SW msg { type: 'openStashFolderAsGroup', folderId, targetWindowId }
→ 在 targetWindowId 新建 manual group { name: folder.name, tabs: [] }
→ 对 folder.items 全部 chrome.tabs.create({ windowId: targetWindowId, url })
→ 借助扩展后的 pendingNewTabRoute(支持"接 N 个 tab,都进这个 group")
→ 源 folder 不动
```

### 4.8 拖拽
- 跨 group / 进 untracked:与旧 spec 一致,删 pin 分支
- 从 Chrome 标签栏拖入:与旧 spec 一致;URL→tab 解析**只查目标窗口**(`tabs.query({windowId})`)。全局查会把 TabRef 绑到别的窗口的同 URL tab——跨窗口重复条目,那个 tab 关闭时 onRemoved 的 fast path 只清真实窗口的,本窗口的成幽灵行(见 4.9)。
- 不支持 stash item 拖入 group(点击 / 菜单替代,UI 设计简化)

### 4.9 幽灵行自愈(ghost-row self-healing)

会话层是 Chrome tabs 的**事件驱动镜像**,隐含假设「每个 tab 的消失都恰好产生一次被成功处理的事件」。任何一次 miss——SW 在分发间隙被杀、旧版本未监听 onReplaced、重复 TabRef 而 onRemoved 只删第一个匹配——都会留下指向死 chromeTabId 的 TabRef:侧边栏里一行「Chrome tab 已经没了却怎么都关不掉」的幽灵。三层防御,缺一不可:

1. **堵注入**:onReplaced 原位重绑(4.1);onAttached 目标窗口去重(4.1);addUrlToGroup 限窗口解析(4.8)。
2. **冷启动对账**(`src/background/reconcile.ts`):`recoverOnStartup` 在同一次序列化写的末尾重新 `tabs.query({})` 取活集,恢复三条不变量——
   - 每个 `TabRef.chromeTabId` 指向活 tab(死的删);
   - 一个 chromeTabId 只有一个 TabRef(重复合并:实际窗口优先 > 组内优先 > 先到先得);
   - TabRef 必须在 tab 实际所在窗口的 state 里(错位的迁回实际窗口 untracked)。
   顺带清死窗口 state、空 auto 组。**fresh 与 mid-session 都跑**——mid-session 的「不碰已跟踪窗口」只指不从镜像重建组结构,对账照常。安全性:state 里存在 TabRef ⟸ 对应事件已处理 ⟸ tab 当时已存在;query 发生在其后,活集只可能「更新」不可能「滞后」,故不会误删刚创建 tab 的条目。
3. **关闭路径兜底**:`closeLiveTab` 的 `tabs.remove` 失败后用 `tabs.get` 鉴别——tab 仍在(瞬时失败,如用户拖拽中)→ 保留条目、透传错误;已不在 → 该行就是幽灵,直接从 state 清掉(用户意图本来就是让它消失),返回 ok。`closeAllInGroup` **逐个** remove(批量调用遇一个死 id 整体 reject,一只幽灵会卡死整组「全部关闭」),失败 id 一次 query 鉴别后同样清理。

## 5. UI 布局

### 整体结构(两视图,顶部 switcher)

#### Tabs view(默认)
```
┌────────────────────────────┐
│ ★ Side Tab          [+] [⚙] │  Header([+] 当前视图建)
├────────────────────────────┤
│  ●📑 Tabs    📦 Stash       │  Switcher
├────────────────────────────┤
│ 5 live · 2 untracked        │  StatsBar(随视图变)
├────────────────────────────┤
│  ▼ 工作 (5)            ···  │
│     🌐 GitHub PR            │
│     ...                     │  Window groups
│  ▼ github.com (3)      ···  │
│                             │
│  ── Untracked (2) ── [按域] │
│     🌐 ...                  │
└────────────────────────────┘
```

#### Stash view
```
┌────────────────────────────┐
│ ★ Side Tab          [+] [⚙] │
├────────────────────────────┤
│   📑 Tabs    ●📦 Stash      │
├────────────────────────────┤
│ 3 folders · 12 items        │
├────────────────────────────┤
│  ▼ 阅读清单 (3)       ···   │
│     🌐 Hacker News          │
│  ▼ 工作资料 (8)       ···   │
└────────────────────────────┘
```

### 视图切换规则
- 默认 **Tabs view**,**不持久化当前视图**——每次开侧边栏从 Tabs 起
- Stash view 触发"打开"动作 → 自动切回 Tabs view + 完成动作
- Tabs view 触发"保存"动作 → 不切视图,跑保存动画

### 各区段交互

#### Window group
- Header "···" 菜单:重命名 / 删除 / **保存到 Stash** / + 新 tab 进这个组
- TabItem hover:**☆**(Save to Stash) + **×**(关闭)
- Active Chrome tab 高亮(竖条 + 浅背景)

#### Untracked
- 标题不可编辑;`[按域名]` 按钮触发 auto-group(限本窗口)

#### Stash
- Section header `📦 Stash` + 右侧 `+`(新建 folder)
- Folder header `···` 菜单:重命名 / 删除 / **在当前窗口打开为分组**
- Item hover:**×**(从 Stash 删除)
- 点击 item → 切回 Tabs + 按 `stashClickBehavior` 开 tab

### 保存动画(Tabs → Stash)
替代 toast,完全靠视觉传达。

**触发**:Group 菜单"保存到 Stash" / TabItem 行尾 ☆

**序列(~500ms)**:
1. 克隆源元素(group header 或 tab row)叠在原位
2. (0–150ms)形变:克隆体缩成 ~12px 圆点,带源 favicon
3. (150–400ms)位移:沿贝塞尔曲线(control point 略高于直线)飞向顶部 Switcher 上 "📦 Stash" 文字位置
4. (400–550ms)抖动:抵达后"📦 Stash"文字 shake(±2px,4 次,~150ms)
5. 圆点淡出

**实现**:Web Animations API + `transform: translate / scale` + 绝对定位浮层 div(不阻塞侧边栏交互)

**降级**:`@media (prefers-reduced-motion: reduce)` → 跳过过渡,仅保留 Stash 文字 shake。不暴露 Setting 关动画。

### Settings 改动
- `savedTabClickBehavior` → `stashClickBehavior`
- 文案:"点击 Stash 项时: ○ 当前 tab / ● 新 tab / ○ 新窗口"

## 6. 代码迁移计划

### 数据迁移
**不需要**——项目未发布。`SCHEMA_VERSION` bump 1 → 2,启动读到 schema ≠ 2 直接 `emptyAppData()`。

### 删除整个文件
- `src/background/window-matcher.ts`
- `src/background/window-matcher.test.ts`

### `src/shared/types.ts`
- 删 `TabRef.chromeTabId: null` 语义、`TabRef.pinned`
- 删 `WindowState.id`、`fingerprint`、`fingerprintUpdatedAt`、`chromeWindowId: null` 语义
- 改 `AppData`:删 `windows`,加 `stash: StashFolder[]`
- `Group.kind` 必选
- `Settings.savedTabClickBehavior` → `stashClickBehavior`
- 新增 `StashFolder` / `StashItem`、`SessionState.windows`
- `SCHEMA_VERSION: 2`

### `src/shared/storage.ts`
- `AppData` 读写不变(形状变了),`migrateAppData` 改:schema ≠ 2 → 返回 emptyAppData
- 新增 `getSessionWindows / setSessionWindow / updateSessionWindow / onSessionWindowsChange`
- 删 `SessionState.pendingOpens`

### `src/background/tab-handlers.ts`(大幅重构)
- 删 `pendingOpens` 整套(`peekPendingOpen` / `consumePendingOpenEntry` / `registerPendingOpen` / `gcPendingOpens` / `PENDING_OPEN_*`)
- 删 `windowBuffers` / `isBuffering` / `bufferEvent` / `flushBuffer` / `NEW_WINDOW_SETTLE_MS` / `UNKNOWN_WINDOW_RETRY_MS` / `MAX_UNKNOWN_WINDOW_RETRIES`
- 删 `handleTabCreated` 的 retry 逻辑
- 删 `handleTabRemoved` pin 分支
- 删 `cleanupOrphans`
- 改 `handleWindowCreated`:同步建 `emptyWindowState` + `chrome.tabs.query` 填 untracked
- 改 `handleWindowRemoved`:`delete sessionStore.windows[id]`
- 改 `recoverOnStartup / recoverOnInstall`:遍历 `chrome.windows.getAll` 各自建 state
- 保留 `pendingNewTabRoute` + 扩展支持"N 个 tab 进同一 group"
- 保留 `cleanupEmptyAutoGroups`
- 删 `updateFingerprint`

### `src/background/message-handlers.ts`
- 删 `openSavedTab`、`toggleTabPinned`
- 新增 `saveGroupToStash`、`saveTabToStash`、`openStashItem`、`openStashFolderAsGroup`、`deleteStashItem`、`deleteStashFolder`、`renameStashFolder`、`createStashFolder`、`reorderStashFolders`、`reorderStashItems`、`moveStashItem`

### `src/shared/messages.ts`
- 同步 union 类型

### `src/shared/stores.svelte.ts`
- 拆 `appDataStore`(local,stash)+ `sessionStore`(session,windows)
- 新增 `viewStore`(rune `'tabs' | 'stash'`,不持久化)

### `src/sidepanel/App.svelte`
- `windowState` 从 sessionStore 读
- 删 `app.matching_window` 加载态
- 加 Switcher 组件 + 视图渲染分支
- 全局 SaveAnimation overlay

### 新组件(`src/sidepanel/components/`)
- `Switcher.svelte`
- `TabsView.svelte`(包壳现有 GroupList + UntrackedSection)
- `StashView.svelte`、`StashFolder.svelte`、`StashItem.svelte`、`StashFolderList.svelte`
- `SaveAnimation.svelte`

### 改动组件
- `TabItem.svelte`:删 pin 图标 + 加 ☆ 保存按钮
- `GroupHeader.svelte`:菜单加"保存到 Stash"
- `Header.svelte`:[+] 行为根据当前 view
- `StatsBar.svelte`:文案随 view 切

### `src/options/Options.svelte`
- 字段重命名 `savedTabClickBehavior` → `stashClickBehavior`,UI 文案改

### `src/shared/i18n/{en,zh,ja}.ts`
- 删:`app.matching_window`、pin / saved 相关字符串
- 加:Stash 相关("Stash" / "收藏堆" / "スタッシュ"、"保存到 Stash"、"在当前窗口打开为分组"、"删除"、stash 设置项)

### `manifest.config.ts`
- 删 `"sessions"` 权限(代码不用 `chrome.sessions` API;`chrome.storage.session` 不需要该权限)

### 实施里程碑
1. **Foundation**:`types.ts` + `storage.ts` 拆分 local/session
2. **Background 简化**:删 window-matcher + 简化 tab-handlers / window handlers
3. **Stash 数据层**:消息处理 + 单元测试
4. **UI 骨架**:Switcher + TabsView/StashView 视图切换 + Stash 渲染
5. **UI 替换**:TabItem 删 pin 加 ☆;GroupHeader 加保存菜单
6. **保存动画**:浮层 + 贝塞尔 + Stash shake;`prefers-reduced-motion` 降级
7. **i18n + Options 文案**:三语 + 设置项重命名
8. **回归测试 + 手测**

每个里程碑可独立 merge,主线不破。

## 7. 测试策略

### 单元(Vitest)
| 模块 | 测点 |
|---|---|
| `shared/stash.ts`(纯函数) | createFolder / addItem / removeItem / moveItem 顺序、id 唯一、空 folder 删除 |
| `shared/group-naming.ts` | 沿用现有 |
| `shared/url.ts` | 沿用现有 |
| `background/tab-handlers.ts` | onCreated 找不到 state 自动建;onRemoved 删除 + cleanupEmptyAutoGroups;onAttached 跨窗口 |
| `background/auto-group.ts`(可拆) | 按 domain 分桶 + 合并 |
| `background/message-handlers.ts` | 所有新增 Stash 消息:saveGroupToStash 复制不动源、openStashFolderAsGroup 通过 pendingNewTabRoute 落组、deleteStashItem |

### 不再需要
- `window-matcher.test.ts` 整删
- pendingOpens / saved 重开用例
- pin 行为用例

### 组件(`@testing-library/svelte`)
| 组件 | 测点 |
|---|---|
| `Switcher.svelte` | 点击切 view;键盘 a11y |
| `StashFolder.svelte` | 折叠/展开;菜单触发消息 |
| `TabItem.svelte` | ☆ 发 `saveTabToStash`;× 关闭 |
| `SaveAnimation.svelte` | 起点终点正确;`prefers-reduced-motion` 降级 |

### 手测清单(回归)
1. **多窗口隔离**:A、B 两窗口,A 建组 / B 操作,互不干扰(**当前 bug 的回归 case**)
2. 窗口关闭后 sessionStore[windowId] 清
3. 浏览器重启:tab 都在 untracked,无错配
4. auto-group 分桶 + 同窗口二次点合并
5. Save to Stash:整组 + 单 tab,源不动
6. Open Stash folder as group:N 个 tab 同时建,落新建 manual group
7. Click Stash item:按设置开新 tab,落 untracked
8. 保存动画:正常 + reduced-motion
9. 三语 Stash 文案

## 8. 已知风险

1. **从 Chrome 标签栏拖入** dataTransfer 只有 URL → 同 URL 多开按"最近活动"启发式匹配。沿用旧 spec 风险。
2. **`chrome.storage.session` 配额**:单 origin 10MB,远超侧边栏会用到的体积,可接受。
3. **保存动画在性能差的环境可能掉帧** → `prefers-reduced-motion` 降级覆盖。

## 9. 后续可能演进(v1 不做)

- Stash 嵌套 folder
- Stash 拖拽(item 拖入 group 等)
- Stash item 跨设备同步(目前只在 local;sync 配额 100KB 太小)
- Stash item 全文搜索
- Stash item 标签 / 颜色
- 与 Chrome 原生 Bookmarks 互导
