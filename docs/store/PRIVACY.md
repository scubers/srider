# Privacy Policy — Srider

**Last updated: 2026-05-17**

Srider is a browser extension that displays your open tabs as groups in the
Chrome / Edge side panel. This document describes what data Srider handles
and how.

## TL;DR

Srider does not collect, transmit, or sell any of your data. Everything you
see in the side panel lives locally on your device.

## What data Srider reads

Srider uses the standard `chrome.tabs` API to read the following metadata
about tabs in the browser window where Srider is open:

- The tab's URL
- The tab's title
- The tab's favicon URL
- The tab's open / closed / loading state

It does **not** read page content, cookies, form data, passwords, browsing
history, or anything else outside of the tab metadata listed above.

## What data Srider stores

Srider stores **only** the structures you create or that the extension
derives from the tabs you have open:

| Storage area | Contents |
|---|---|
| `chrome.storage.local` | Your group structure, the per-tab pin / saved state, per-window metadata, and a tab-URL fingerprint used to re-associate windows after a browser restart. |
| `chrome.storage.sync` | Your settings: theme, favicon visibility, saved-tab click behavior, default-expanded preference. |
| `chrome.storage.session` | Short-lived runtime state (e.g., "this tab was just opened by clicking a saved link"). Cleared automatically when the browser closes. |

All of this storage is **device-local**. The `chrome.storage.sync` area is
synchronized by your browser to your own Google account (if you have sync
enabled in the browser), but no data ever travels to a Srider server — we
don't operate one.

## What data Srider sends

**Nothing.** Srider has no network code. The extension's manifest declares
no `host_permissions` and no remote endpoints. Srider does not contact any
analytics service, error reporter, or telemetry collector.

## Third-party services

None. Srider does not embed, load, or call any third-party SDK, library
endpoint, font CDN, or tracker.

## Permissions Srider requests, and why

| Permission | Why |
|---|---|
| `tabs` | Read the title and URL of tabs in the current window so Srider can display, search, and group them. |
| `storage` | Persist your groups, pin state, and settings locally on your device. |
| `sidePanel` | Render the Srider UI inside Chrome's / Edge's built-in side panel. |
| `sessions` | Best-effort match a previously-closed window's groups back to a restored window after browser restart. |

Srider does **not** request `host_permissions`, `webRequest`, `cookies`,
`history`, `bookmarks`, `downloads`, or any other broad access.

## Children's data

Srider is a general-purpose productivity tool. It is not directed at
children under 13 and does not knowingly collect any data about them
(because it does not collect data about anyone).

## Changes to this policy

If the way Srider handles data ever changes — for example, if we add a
sync feature that does involve a backend — this document will be updated
in the same release that introduces the change, and the "Last updated"
date at the top will be bumped.

## Contact

Questions about this policy or about Srider's data handling? Open an issue
on the project's GitHub repository, or contact the developer at the email
listed on the Chrome Web Store / Edge Add-ons listing.

---

## 中文版

**最后更新：2026-05-17**

Srider 是一个在 Chrome / Edge 侧边栏里以分组方式展示已打开标签的浏览器扩展。
本文档说明 Srider 处理哪些数据，以及如何处理。

### 简而言之

Srider 不收集、不传输、不出售你的任何数据。你在侧边栏里看到的一切都保存在你本机。

### Srider 读取哪些数据

Srider 使用 Chrome 标准的 `chrome.tabs` API 读取**当前浏览器窗口里**的标签元
数据：URL、标题、favicon URL、打开/关闭状态。

它**不**读取网页内容、Cookie、表单数据、密码、浏览历史，也不访问以上列出之外的任何信息。

### Srider 存储哪些数据

Srider 只存储你自己创建的、或者从你打开的标签里派生出来的结构：

- `chrome.storage.local`：分组结构、每个标签的 pin / saved 状态、窗口元数据、用于重启后重新关联窗口的"标签 URL 指纹"。
- `chrome.storage.sync`：设置（主题、是否显示 favicon、点击 saved 标签的行为、默认展开状态）。
- `chrome.storage.session`：短期运行态（如"这个标签是刚刚点 saved 链接打开的"）。浏览器关闭时自动清空。

所有存储都在**本机**。`chrome.storage.sync` 由浏览器同步到**你自己的 Google 账号**
（前提是浏览器开启了同步），但数据从未流向 Srider 的服务器 —— 因为我们根本没有服务器。

### Srider 发送哪些数据

**没有**。Srider 没有任何网络请求代码，manifest 里没有声明 `host_permissions`，也
没有任何远程接口。Srider 不连接任何分析服务、错误上报服务或埋点服务。

### 第三方服务

无。Srider 不嵌入、不加载、不调用任何第三方 SDK / 库的远程端点 / 字体 CDN / 追踪器。

### 权限说明

| 权限 | 用途 |
|---|---|
| `tabs` | 读取当前窗口里标签的标题和 URL，用于在侧边栏里展示、搜索、分组。 |
| `storage` | 把分组、pin 状态、设置持久化到你本机。 |
| `sidePanel` | 在 Chrome / Edge 自带的侧边栏中渲染 Srider 的 UI。 |
| `sessions` | 浏览器重启后，尽力把之前关闭的窗口分组重新关联到恢复的窗口上。 |

Srider **不**请求 `host_permissions`、`webRequest`、`cookies`、`history`、
`bookmarks`、`downloads` 等大权限。

### 未成年人数据

Srider 是通用效率工具，不面向 13 岁以下用户，也不"明知地"收集任何关于他们的数据
（因为根本不收集任何人的数据）。

### 政策变更

如果 Srider 的数据处理方式将来发生变化（例如新增依赖后端的同步功能），本文档会在
引入该变化的同一版本里更新，顶部的"最后更新"日期会同步上调。

### 联系方式

对本政策或对 Srider 的数据处理有疑问？请在项目 GitHub 仓库提 issue，或通过 Chrome
Web Store / Edge Add-ons 商店页上的开发者邮箱联系。
