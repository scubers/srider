# Side Tab — 搜索标签 设计文档

**日期**：2026-05-17
**状态**：草案，待实现

## 1. 目标与范围

在面板顶部 Header 增加一个搜索框，允许用户**实时过滤**当前窗口里的标签。

**核心需求**：

- 搜索框位于 Header 最左侧，"+ 新建分组" 按钮之前
- 输入即时过滤：匹配 `TabRef.title` 或 `TabRef.url`，大小写不敏感的子串匹配
- 一个分组里一个匹配项都没有时，整个分组卡片在搜索期间不渲染
- 含匹配项但当前被折叠的分组，在搜索期间临时强制展开；清空搜索后还原原来的折叠状态
- 匹配的子串在 TabItem 标题里高亮（`<mark>`）
- Esc 清空搜索；× 按钮（输入非空时显示）也能清空

**非目标（v1 不做）**：

- 模糊匹配（fuzzy / typo tolerance）
- 高级查询语法（`domain:`、`title:` 之类）
- 跨窗口搜索
- 全局键盘快捷键（Cmd+F 会和 Chrome 自身的 find-in-page 冲突）
- 持久化查询（关面板/换窗口/SW 重启 → 清空）
- 在 URL 文本里也高亮匹配（只在标题里高亮，URL 不展示给用户）

## 2. 数据模型

无需改动 `chrome.storage.local` 的 schema。搜索状态完全是 UI-only 的。

新增 `src/sidepanel/search.svelte.ts`：

```typescript
class SearchStore {
  /** 用户输入的原始字符串。绑定到 input 的 value。 */
  query = $state('');

  /** 归一化后用于比较的查询字符串：trim + lowercase。 */
  normalized = $derived(this.query.trim().toLowerCase());

  /** true ⇔ 当前处于"搜索中"状态。 */
  active = $derived(this.normalized.length > 0);

  /**
   * 判断一个 TabRef 是否命中当前查询。
   * 无查询时返回 true（不过滤）。
   */
  match(tab: TabRef): boolean {
    if (!this.active) return true;
    const q = this.normalized;
    return (
      tab.title.toLowerCase().includes(q) ||
      tab.url.toLowerCase().includes(q)
    );
  }

  clear(): void {
    this.query = '';
  }
}

export const searchStore = new SearchStore();
```

**为什么不用 store**：仅 sidepanel 上下文用，不跨 SW；运行时态，关闭/重开就清。和 `activeTabStore` 一致的局部单例模式。

## 3. 组件改动

### 3.1 新增 `SearchBox.svelte`

挂在 Header 最左边的一个独立小组件。

职责：
- 双向绑定 `searchStore.query`
- 显示搜索图标（🔍）作为前缀
- 占位符文字：`搜索标签...`
- 输入非空时右侧显示 × 按钮，点击 → `searchStore.clear()`
- input 上的 Esc 键 → `searchStore.clear()`（不绑全局监听）
- focus 时框线变 `--accent`

不在 SearchBox 里做过滤逻辑——SearchBox 只管输入；过滤靠各列表组件读 `searchStore` derive 出来。

### 3.2 `Header.svelte`

布局从右对齐改成"搜索框撑开 + 右侧两个按钮"：

```
[ <SearchBox /> ] [+ 新建分组] [⚙]
   flex: 1            固定        固定
```

SearchBox 设 `flex: 1 1 auto`，`min-width: 80px`，超窄时仍可输入。

### 3.3 `Group.svelte`

新增三个 derived：

```typescript
const matchedTabs = $derived(group.tabs.filter((t) => searchStore.match(t)));
const visibleInSearch = $derived(!searchStore.active || matchedTabs.length > 0);
/** 搜索时强制展开；非搜索状态用本来的 collapsed。 */
const effectiveCollapsed = $derived(searchStore.active ? false : group.collapsed);
```

模板调整：
- 最外层用 `{#if visibleInSearch}` 包住整张卡片，搜索且无匹配 → 整组不渲染
- 渲染 tabs 列表时遍历 `matchedTabs` 而不是 `group.tabs`
- 折叠/展开判断用 `effectiveCollapsed`，**不写入 `group.collapsed`**——搜索结束 effectiveCollapsed 自动还原

**重要**：搜索期间不要发 `toggleGroupCollapsed` 消息修改持久化状态。effectiveCollapsed 只影响渲染。同时，搜索期间 GroupHeader 上 row-click / Enter / Space 触发的折叠操作直接 short-circuit：

```typescript
function onRowClick(e: MouseEvent) {
  if (searchStore.active) return;     // 搜索时折叠被锁
  // ...原有逻辑
}
```

否则用户点折叠会把 `group.collapsed = true` 写入存储但视觉无反应，造成困惑。

`hasActiveTab`（左侧活动卡片橙色高亮）的判断仍基于 `group.tabs.some(...)`，不基于过滤后的列表——搜索过滤是 UI 临时态，活动 tab 的高亮逻辑独立。

### 3.4 `UntrackedSection.svelte`

同样处理：
```typescript
const matchedTabs = $derived(win.untrackedTabs.filter((t) => searchStore.match(t)));
const visibleInSearch = $derived(!searchStore.active || matchedTabs.length > 0);
```

外层 `{#if visibleInSearch}`，列表用 `matchedTabs`。

### 3.5 `TabItem.svelte` — 高亮匹配子串

高亮的目标是**渲染出来的标题字符串**，即 `tab.title || tab.url`——这才是用户视觉上看得到的那段文字。把它喂给 `splitHighlight()`：

新增一个 derive：`highlightedTitle: Array<{ text: string; mark: boolean }>`。计算逻辑：

```typescript
function splitHighlight(text: string, normalizedQuery: string): Segment[] {
  if (!normalizedQuery) return [{ text, mark: false }];
  const lower = text.toLowerCase();
  const segs: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const next = lower.indexOf(normalizedQuery, i);
    if (next === -1) {
      segs.push({ text: text.slice(i), mark: false });
      break;
    }
    if (next > i) segs.push({ text: text.slice(i, next), mark: false });
    segs.push({ text: text.slice(next, next + normalizedQuery.length), mark: true });
    i = next + normalizedQuery.length;
  }
  return segs;
}
```

把它放在 `src/sidepanel/highlight.ts`，便于单元测试。

模板里：

```svelte
<span class="title">
  {#each highlightedTitle as seg}
    {#if seg.mark}<mark>{seg.text}</mark>{:else}{seg.text}{/if}
  {/each}
</span>
```

`<mark>` 样式：`background: var(--accent-bg-soft); color: var(--accent); border-radius: 2px; padding: 0 1px;`。继承 font-weight，不破坏选中态的加粗。

**只高亮 title，不高亮 URL**——URL 在 UI 上不显示，无意义。

## 4. CSS / 主题 Token

复用现有 token，无需新增：
- 搜索框背景：`--surface`
- 搜索框边框：`--border` → focus 时 `--accent`
- 搜索框文字：`--text`
- 占位符：`--text-faint`
- `<mark>`：`--accent-bg-soft` 背景 + `--accent` 文字

## 5. 交互细节

| 操作 | 行为 |
|---|---|
| input 键入 | `searchStore.query` 实时更新，列表立即过滤 |
| Esc（input 内） | `searchStore.clear()`，input blur |
| 点击 × | `searchStore.clear()`，input 重新聚焦 |
| 清空查询 | 所有原本可见的分组恢复，原折叠状态恢复，高亮消失 |
| 拖拽 / 重命名 / 新建 / 关闭 等 | 不受搜索影响，照常工作（但搜索期间不展示的卡片用户碰不到也无所谓） |

## 6. 边界情况

| 情况 | 处理 |
|---|---|
| 查询为纯空格 | trim 后是空串 → `active = false`，不过滤 |
| 查询全角空格、特殊符号 | 直接子串匹配；不做特殊处理 |
| 查询是单个字符 | 正常匹配；性能可接受（每次输入触发整库 filter，标签数 < 500 完全够用） |
| 标签数巨大（1000+） | v1 不做虚拟列表，先观察。每次输入是 O(n)，可接受 |
| 同一查询字符串多次匹配同一 title（如 "git" 出现 3 次） | 全部高亮 |
| 标题为空 | `tab.title` 通常 fallback 到 url；高亮按 title 字段（即 url）走 |
| URL 命中但 title 不含查询子串 | 该条仍显示，title 不高亮（因为高亮只看 title）。可接受 |

## 7. 测试

新增 `src/sidepanel/highlight.test.ts`：覆盖 splitHighlight 的：
- 空查询 → 单段不高亮
- 单次命中
- 多次命中
- 命中位于首/尾
- 大小写混合（查询和文本不同大小写）
- 查询长度 > 文本长度 → 不命中

无需为 SearchStore 写测试（薄壳，行为来自 $state/$derived），无需为 Group/TabItem 写过滤行为测试（Svelte 组件测试在 v1 里整体没做）。

## 8. 已知风险

1. **每次按键触发整库 filter + 重新渲染**：标签数过百时可能轻微卡顿。当前规模下可接受；若用户反馈卡顿，可加 50 ms debounce 或虚拟列表。
2. **`<mark>` 文本与活动 tab 加粗叠加**：mark 元素继承 `font-weight: 600` 是正常的，不破坏。`color` 用 `--accent` 不和加粗冲突。

## 9. 后续可演进（不在 v1 范围）

- Cmd+K 聚焦搜索框
- 模糊匹配 + 相关度排序
- URL 里的命中也单独显示一行 "URL: …<mark>git</mark>hub…"
- 搜索结果数显示（"3 个标签匹配 \"git\""）
- 持久化最近 N 条查询历史
