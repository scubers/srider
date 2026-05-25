# Side Tab — 重启后恢复分组（write-through 镜像 + 启动重水合）

**日期**：2026-05-26
**状态**：草案，待实施
**关系**：补充并*局部修订* `2026-05-19-side-tab-redesign-design.md` §0「跨重启 = 重来」。本文不改 Stash 模型，只新增「把 Chrome 自己重开的 live tab 按上一会话的归属重新归位」。

## 0. 背景与动机

`2026-05-19` 重设计把 per-window 的 `WindowState`（分组、tab 归属、tab 别名）放进 `chrome.storage.session`，浏览器重启即清空——只有 Stash（`chrome.storage.local`）跨重启存活。当时的理由：旧的 UUID + Jaccard 窗口匹配在*增量*路径上有 bug（每开一个新窗口就全量 reset 所有 `chromeWindowId`，只重建新窗口字段，导致已存在窗口"无家可归"、新窗口错配旧分组），且在心智上认定"跨重启 = 重来"。

实际使用反馈：用户依赖 Chrome 自带的「继续浏览上次打开的网页 / Continue where you left off」。tab 被 Chrome 重开后，用户期望侧边栏里**之前设的分组名、tab 别名、分组方式**自动跟着回来。若 Chrome 没有重开 tab，则不需要恢复分组。

这是对 §0 那条决定的**有意修订**，但范围被严格限制，以避开当初出问题的地方：

- **只重新关联 Chrome 自己重开的 live tab**，不重新引入「saved tab / 由扩展自己重开 URL」那套机制——分组只跟着活着的 tab 走。
- **窗口匹配只发生在启动时的一次性 batch**，运行期开新窗口完全不做匹配。这从结构上规避了 §0 那个增量匹配 bug 的整类问题。
- **对现架构是纯加法**：运行期 `chrome.storage.session` 仍是 live 状态的唯一真相源，按 `chromeWindowId` 直接索引，零 UUID 间接层。

## 1. 目标 / 非目标

### 目标
- 重启后，Chrome 恢复的 tab 能按上一会话的分组归位：恢复**分组名、分组结构（哪些 tab 属于哪个组及顺序）、tab 别名（`TabRef.name`）、未分组 tab 的别名、组的 `collapsed`/`kind`/`autoDomain`**。
- 单窗口与多窗口都要正确匹配。
- Chrome 不恢复 tab 时，不恢复分组（不自行重开 URL）。
- 不触碰运行期的数据流与 UI；改动隔离在后台启动路径。

### 非目标
- 不重新引入 saved tab / pin / 自行重开 URL。
- 不追求"精确"跨重启身份匹配（物理上不可能，见 §4）。
- 不做跨设备同步（镜像只在 local）。

## 2. 方案总览（方案 A）

1. **write-through 镜像**：运行期每次 `SessionData` 结构变化，把一份只含重建所需骨架的快照 debounced 写到 `chrome.storage.local` 的新 key `sessionMirror`。
2. **启动重水合**：`onStartup` 时读镜像 + `chrome.windows.getAll({populate})`，用 URL 集合相似度在「重开窗口」↔「镜像窗口」之间做一次性全局匹配，再在每对匹配窗口内按 URL 把 live tab 归位到分组、恢复别名。配不上的窗口/成员降级为 untracked / 丢弃。

`chrome.storage.session` 在运行期仍是唯一真相源；镜像是一个**只用于跨重启**的 write-through 派生缓存，UI 不读它。

## 3. 数据模型（新增，`chrome.storage.local`，key `sessionMirror`）

只存重建结构所需的骨架，**不存任何跨重启后无意义的 id**（`chromeTabId`/`chromeWindowId`/`TabRef.id`/`Group.id`）。

```typescript
interface SessionMirror {
  windows: MirrorWindow[];   // 顺序无所谓；匹配靠 URL 集合，不靠顺序
  schemaVersion: number;     // = SCHEMA_VERSION；不符则读时丢弃（缓存语义）
  updatedAt: number;
}

interface MirrorWindow {
  groups: MirrorGroup[];     // 顺序 = 显示顺序
  untracked: MirrorTab[];    // 顺序 = 显示顺序；存在仅为恢复未分组 tab 的别名
}

interface MirrorGroup {
  name: string;
  collapsed: boolean;
  kind: GroupKind;           // 'manual' | 'auto-domain'
  autoDomain?: string;       // 仅 auto-domain
  tabs: MirrorTab[];         // 顺序 = 组内顺序
}

interface MirrorTab {
  url: string;
  name?: string;             // 别名；空/缺省表示无别名
}
```

`Group.createdAt` 不入镜像；重水合时新铸（顺序由数组位置决定，`createdAt` 仅装饰）。

## 4. 匹配启发式

**前提（决定性事实）**：跨浏览器重启，Chrome 给窗口和 tab 全是**新的** `windowId`/`tabId`，且**不提供任何 API** 把"旧 id → 新 id"对应起来（`chrome.sessions` 只用于恢复关闭的项，不携带上一轮身份）。因此"精确"匹配在物理上不可能，唯一可依据的是 **URL**。

进一步：**Chrome 的会话恢复，恢复的是每个 tab 最后 committed 的 URL，逐字节原样，且懒加载**。所以重水合时 `getAll` 拿到的 `tab.url` 在绝大多数情况下与当初存入镜像的 URL 字符串完全一致（重定向通常发生在用户点开 tab 之后，重水合时拿到的还是旧 committed URL）；且两侧 URL 同源于 Chrome 的 committed `tab.url`，连 trailing slash 差异都不会有。**精确字符串匹配的命中率在现实中已经很高。**

策略偏保守：**宁可不分组，也不配错。**

### 4.1 窗口级匹配
- 度量：URL **集合**的 Jaccard `|∩| / |∪|`（窗口内 URL 去重；重复 tab 的计数在这一步是噪声，故用集合而非多重集）。
- 阈值 `WINDOW_MATCH_THRESHOLD = 0.5`。低于阈值的窗口 → 当全新窗口处理（所有 tab 进 untracked），不猜。
- **全局贪心分配**（非先到先得）：
  1. 对每个 (重开窗口 ri × 镜像窗口 mi) 计算 `score`，收集 `score ≥ 阈值` 的候选。
  2. 按 `score` 降序排序；同分按交集**绝对数**降序（共享 URL 越多证据越强）；再同则按 `ri` 升序、`mi` 升序（确定性）。
  3. 依次取候选，若 `ri` 与 `mi` 都未被占用则绑定，否则跳过。
- 这是规避 §0 bug 的关键：旧方案是"每开一个窗口增量 reset"，这里是启动时一把全局分配，无增量身份维护。

### 4.2 tab 级归位（在已匹配的窗口内）
- 池 = 该重开窗口的所有 live tab（带 `id`），按 tab index 顺序。
- 按镜像顺序遍历 `groups` → 各 group 的 `tabs` → `untracked`；每个 `MirrorTab{url, name?}` 从池里**消费第一个 `sameTabUrl` 相同的** live tab，建 `TabRef`（新 `TabRef.id` + 重开的 `chromeTabId` + 恢复 `name`）。
- **URL 比较 `sameTabUrl`：v1 为精确字符串相等**（取 `tab.url || tab.pendingUrl`），不做归一化——最不易误合并。归一化（忽略 query/fragment）留作将来可调项；不在 v1。
- **重复 URL**：positional 消费（按出现顺序各取一个），确定、稳定。最坏两个相同 URL 的 tab 别名互换，肉眼无差。
- **部分重开**：组里 N 个成员只回来 K 个 → 用这 K 个恢复组，保留相对顺序；**K = 0 → 丢弃该组**（含故意留空的 manual 组：空 manual 组不跨重启存活）。
- **多余 tab**（池里有、镜像没有）→ 该窗口 untracked，无别名。

### 4.3 降级 / 边界
- 无镜像 / `schemaVersion` 不符 / 没有窗口过阈值 → 全 untracked（即现状），绝不半猜。
- 重开窗口比镜像多 → 多的全 untracked。
- 镜像比重开多（有窗口没回来）→ 多的镜像丢弃。
- 配错的代价：**tab 一个不少，只是可能分错组/错窗口**。用户拖一下或改个名即可，镜像随即重写，下次重启自愈。无数据丢失。

## 5. 行为案例表

记号：`[窗口] 组名{ tab(别名), ... } | untracked: tab, ...`

| # | 场景 | 行为 |
|---|---|---|
| 1 | 单窗口全部重开：`工作{ github(PR), localhost } / 阅读{ news } \| untracked: mail(收件箱)` | 完整恢复：组、组名、别名 `(PR)`/`(收件箱)` 全回来 |
| 2 | 单窗口部分重开：`工作{ github, localhost, jira }`，仅 github 回来 | `工作{ github }` |
| 3 | 某组一个都没回来：`阅读{ news }`，news 没恢复 | 整组丢弃 |
| 4 | Chrome 恢复旧 tab + 用户新开几个 | 旧的归位；镜像里没有的新 tab → untracked |
| 5 | 双窗口内容不同，且 Chrome 重开顺序相反 | 全局贪心仍按 URL 集合正确配对，两窗口分组各自恢复 |
| 6 | 三窗口只回来两个 | 回来的两个与最像的镜像配对；没回来的镜像丢弃 |
| 7 | 两窗口 URL 几乎相同、分组结构不同（失败模式） | 可能把一个窗口的分组结构套到另一个上；tab 不丢，改名/拖动即自愈 |
| 8 | Chrome 设成空白启动 / 不恢复网页 | 没有窗口过阈值 → 全 untracked，分组不恢复（符合预期） |
| 9 | 镜像为空（刚装 / 上会话没建组） | 全 untracked，等同现状 |
| 10 | 阈值边界（窗口只恢复一半 tab，Jaccard ≈ 0.5） | 过阈值才匹配并归位，不到当全新窗口 |
| 11 | 重复 URL（同组两个相同 URL） | positional 消费；最坏别名互换，无感 |
| 12 | tab 重启后 URL 变了（重定向） | 精确匹配对不上 → 该 tab 进 untracked（精确匹配的代价） |
| 13 | auto-domain 组恢复后又新开同域名 tab | 新 tab 进 untracked，不自动并入；要再点「按域名分组」 |
| 14 | 仅 SW 被回收，未重启浏览器 | session 还在，不触发重水合，零影响 |
| 15 | 启动时 onCreated 抢跑，先把 tab 堆进 untracked | 重水合用 `getAll` 权威列表覆写该窗口 → 收敛；晚到事件命中已存在 TabRef 仅刷新字段 |

## 6. 写入路径（write-through）

- 挂载点唯一：`write-queue.ts` 的 `withSessionData`，在 `setSessionData` 成功后调 `scheduleMirrorFlush()`。各 handler 不需改动。
- `scheduleMirrorFlush` debounced **~300ms**（略长于 session 的 150ms，因为它是派生且只在重启时才被消费）：读当前 `SessionData` → 纯函数 `projectToMirror()` 投影成 `SessionMirror` → `chrome.storage.local.set({ sessionMirror })`。
- 因为 `sessionMirror` 与 Stash 的 `appData` 是不同 key，`local.set` 只动该 key，不与 `appChain` 抢；debounce 天然 last-write-wins，无需额外串行链。
- `projectToMirror` 不经 `withSessionData`（避免递归）：只读 session + 写 local（不同区），不构成回路。
- `onUpdated`（导航）也走 session 写，故镜像里的 URL 始终是各 tab 的最新 committed URL。
- **代价/风险**：若 SW 在最后一次 debounce 落盘前死亡，跨重启会丢失最后 `<300ms` 内的结构变化。可接受；不为此引入不可靠的 `onSuspend` 强制 flush。

## 7. 启动重水合

重写 `tab-handlers.ts` 的 `recoverOnStartup` 函数体；保留 `recoverOnInstall` 复用。

**关键:区分「浏览器全新会话」与「SW 半途被回收又醒来」。** `recoverOnStartup` 在每次 SW 冷启动都会跑(service-worker.ts 顶层防御性调用 + onStartup + onInstalled),不止浏览器重启。用 `SessionData.rehydratedAt` 区分两种情形——它存在 `chrome.storage.session`(浏览器重启清空、SW 回收存活):

- **fresh session**(`rehydratedAt` 缺省):跑窗口匹配 + 重水合,**权威覆写**所有重开窗口。覆写安全——`getAll` 给的是完整 live tab 集,即使 racing 的 `onCreated` 抢先把窗口建进 untracked,结果也收敛(Case 15)。写完置 `rehydratedAt`,**与窗口重建在同一个 `setSessionData` 里**(原子;若拆成单独/更早的写会重新引入 clobber-on-recycle)。
- **mid-session**(`rehydratedAt` 已存在):**完全不做窗口匹配**(遵守 §0/§2「运行期开新窗口不匹配」)。已跟踪的窗口跳过不动;SW 死亡期间新开、尚未跟踪的窗口按 plain untracked 落地——绝不让它继承别的窗口的分组拷贝。

```text
recoverOnStartup():
  if (recoverOncePromise) return it                 // 单 SW 生命周期只跑一次
  mirror = await getSessionMirror()                 // local;缺省/schema/结构不符 → 空
  chromeWindows = await chrome.windows.getAll({ populate: true })
  reopened = normalize(chromeWindows)               // {id, tabs:[{chromeTabId,url,title,favIconUrl}]}
  await withSessionData(data => {
    fresh = data.rehydratedAt === undefined
    matches = fresh ? matchWindows(reopened, mirror.windows, WINDOW_MATCH_THRESHOLD) : null
    for (w of reopened):
      if (!fresh && data.windows[w.id]) continue    // mid-session:不碰已跟踪窗口
      mw = matches?.get(w.id)
      data.windows[w.id] = mw ? rebindWindow(w, mw)                                  // §4.2
                              : { chromeWindowId:w.id, groups:[],
                                  untrackedTabs: w.tabs.map(tabRefFromReopened) }
    if (fresh) data.rehydratedAt = now()
  })
  cancelMirrorFlush()                               // 不让重水合自己的写回灌镜像(见下)
  // recoverOncePromise 不缓存 rejected promise:失败时重置,允许后续重试
```

- **不回灌镜像**:重水合是「从镜像重建」,其 session 写会触发 debounced flush;若放任,会把(必然有损的——丢了没重开的窗口、重定向 tab)重建结果投影回去、盖掉原本更全的镜像,劣化下次重启。故重水合后立即 `cancelMirrorFlush()`;镜像只由启动后真实的用户/Chrome 变更重写。
- **失败可重试**:`recoverOncePromise` 不缓存 rejected promise——`getAll`/storage 偶发失败时把它重置回 `null`,否则该 SW 生命周期内恢复会被永久禁用(只有它会置 `rehydratedAt`)。
- **id 一致性**:重水合用 `getAll` 的 `tab.id` 建 TabRef,与后续事件的 `chromeTabId` 一致,晚到的 `onCreated`/`onUpdated` 命中已存在 TabRef 只刷新字段(沿用现有 `findTabInState` guard)。

## 8. 改动清单（A 的卖点：基本只动后台启动路径）

| 文件 | 改动 |
|---|---|
| `src/shared/types.ts` | 新增 `SessionMirror` / `MirrorWindow` / `MirrorGroup` / `MirrorTab`（纯加法）；更新顶部注释中"跨重启只能靠 Stash"的措辞 |
| `src/shared/types.ts` | 另新增 `SessionData.rehydratedAt?`（启动重水合的会话标记，见 §7） |
| `src/shared/storage.ts` | 新增 `getSessionMirror()` / `setSessionMirror()`（local，key `sessionMirror`；读时 schema 或结构不符返回空） |
| `src/shared/url.ts` | 新增 `sameTabUrl(a, b)`（v1 精确相等） |
| `src/background/write-queue.ts` | `withSessionData` 落盘后挂 `scheduleMirrorFlush()`；debounced flush + 导出 `flushSessionMirror()` / `cancelMirrorFlush()`；`projectToMirror` 放在 session-restore.ts |
| **新文件** `src/background/session-restore.ts` | 纯函数 `projectToMirror()` / `matchWindows()` / `rebindWindow()` / `consumeFromPool()` / `tabRefFromReopened()`（隔离脆弱逻辑，便于单测） |
| `src/background/tab-handlers.ts` | `recoverOnStartup` 重写为重水合（fresh/mid-session 分流 + 不回灌镜像 + 失败可重试）；TabRef 由 session-restore 的 `tabRefFromReopened` 构建（`makeTabRef` 不变） |
| **不动** | `service-worker.ts`、`message-handlers.ts`、所有 `sidepanel`/`options` UI、`stores.svelte.ts`、i18n、`manifest.config.ts` |

无需新增权限：已有的 tab 元数据读取（`tab.url`/`tab.title`）足够。

## 9. 决策记录

| # | 决策 | 取值 | 理由 |
|---|---|---|---|
| 1 | URL 匹配 | 精确字符串（v1） | verbatim restore 下命中率已高；零误合并（误合并是最坏失败：悄悄把不同页并成一个）。纯归一化会塌掉 `?v=`/`?q=`/`?id=` 类页面，是用更糟的 bug 换更轻的。`sameTabUrl` 独立函数，将来可低成本升级混合策略 |
| 2 | 空组 | 重启后丢弃（含故意留空的 manual 组） | 符合"没重开就不恢复"；空 manual 组不跨重启存活 |
| 3 | 开关 | 默认开、不加 Settings 项 | YAGNI；这是用户期望的默认行为。将来要"重启重来"语义，加 `Settings.restoreGroupsOnStartup` 仅 1 行 |
| 4 | 窗口匹配阈值 | `WINDOW_MATCH_THRESHOLD = 0.5` | 沿用旧 spec；保守，宁缺毋滥 |

## 10. 测试策略

### 单元（Vitest，多为纯函数）
| 模块 | 测点 |
|---|---|
| `projectToMirror` | WindowState → MirrorWindow：剥离 `id`/`chromeTabId`，保留 `url`/`name`/组元信息与**顺序** |
| `matchWindows` | 单窗匹配；双窗内容不同正确配对；双窗顺序颠倒仍正确（全局贪心，Case 5）；低于阈值不匹配；重开/镜像数量不等；同分 tiebreak 确定性 |
| `rebindWindow` | 全恢复（组/别名/顺序）；部分重开留存活者；K=0 丢弃空组；重复 URL positional；多余 tab 进 untracked；auto-domain 组带 `autoDomain`/`collapsed` 恢复 |
| `sameTabUrl` | 精确相等；不同 query/fragment 视为不同 |
| `rehydrateOnStartup`（集成式） | 假 `chrome.windows.getAll` + 镜像 → 期望 `SessionData`；含 racing onCreated 已建窗口被覆写收敛（Case 15） |

### 沿用 / 不新增
- 现有 `tab-handlers`/`group-naming`/`url` 测试沿用。
- 不为 saved/pin（已删）新增用例。

### 手测清单
1. 单窗口建组 + 别名 → 重启（开 Chrome 恢复）→ 全恢复。
2. 多窗口各有分组 → 重启 → 各自正确恢复（含交换窗口顺序）。
3. 关掉部分 tab 后重启 → 组里只剩存活者，空组消失。
4. Chrome 设空白启动 → 重启 → 全 untracked，无分组。
5. 重启后新开 tab → 进 untracked，不乱入旧组。
6. 重定向页重启 → 落 untracked（精确匹配代价，符合预期）。

## 11. 已知风险 / 局限

1. **近似窗口的错配**（Case 7）：两窗口 URL 集合几乎相同、分组结构不同时，可能配错窗口。tab 不丢，可自愈。这是无稳定跨重启 id 的物理上限。
2. **重定向 / 动态 query 页**（Case 12）：精确匹配下会落 untracked。可通过将来升级 `sameTabUrl` 缓解。
3. **最后 <300ms 结构变化丢失**：SW 在 debounce 落盘前死亡的小窗口。可接受。
4. **镜像配额**：仅 URL + 别名 + 组元信息，远小于 local 10MB 额度。
5. **启动时 `getAll` 懒恢复**：若 Chrome 在 onStartup 时尚未把全部恢复窗口/标签页 materialize 完，重水合会漏掉它们——漏掉的窗口当全新窗口(untracked)，漏掉的 tab 落 untracked。概率低(`getAll({populate})` 通常已给出完整窗口列表)，不丢数据，只是该次 grouping 不全。下次重启用同一镜像仍可恢复(已抑制重水合回灌镜像，见 §7，故镜像不会被这次不全的结果劣化)。
6. **重水合 ↔ onCreated 快照竞态**：fresh session 下用 `getAll` 快照权威覆写；极小概率下，在快照与 `withSessionData` 提交之间新建的 tab 会被覆写掉且不自愈(窗口极窄，仅启动瞬间)。可接受;若实测有问题，可在锁内补一次 `chrome.tabs.query` 对账。

## 12. 后续可能演进（v1 不做）

- `sameTabUrl` 升级为「精确→origin+path 降级」混合策略（仅当实际使用中发现漂移 tab 常掉 untracked）。
- `Settings.restoreGroupsOnStartup` 开关。
- 标题作为匹配辅助信号（处理同 URL 多 tab）。

## 13. 需同步更新的文档

- 本 spec 落地实现时，在 `2026-05-19-side-tab-redesign-design.md` §0 加交叉引用（已在本文写作时加）。
- `src/shared/types.ts` 顶部注释中"To persist anything across browser restart, the user saves it to Stash"需补充：分组结构经 write-through 镜像在重启时尽力恢复。
- `CLAUDE.md` 的「Storage layout」表已过时（仍称项目 pre-implementation）；其 storage 语义描述待整体校正，不在本 spec 范围内。
