# Chrome Web Store 上架资料包

Open the dashboard at <https://chrome.google.com/webstore/devconsole/>, create
a new item, upload `release/srider-v<version>.zip`, then copy each section
below into the matching field.

For Edge Add-ons (<https://partner.microsoft.com/dashboard/microsoftedge/>),
the form layout differs but the same copy applies — Edge auto-detects
listing locale, so put the English copy in the default listing and add a
Chinese listing for `zh-CN`.

---

## 1. Single purpose

Both stores require one short sentence describing the extension's single
purpose.

> Display the user's open browser tabs as groups inside the side panel, and
> let the user organize, search, pin, and re-open tabs from there.

> 中文：在浏览器侧边栏里以分组形式展示和管理用户当前已打开的标签，让用户能够整理、搜索、固定和重新打开标签。

---

## 2. Name & summary

| Field | Value |
|---|---|
| Name (en) | **Srider** |
| Summary (en, ≤ 132 chars) | **Side-panel tab manager. Group tabs by domain or by hand, pin the ones worth keeping, search any tab in milliseconds.** |
| Name (zh-CN) | **Srider** |
| Summary (zh-CN, ≤ 132 chars) | **侧边栏标签管理。按域名一键分组或手动归类，固定值得保留的标签，毫秒级搜索任何已打开的页面。** |

---

## 3. Detailed description

### English

```
Srider turns Chrome's side panel into a focused tab manager. Your open
tabs become cards on the left; you stay in the page on the right.

Why Srider

- See every open tab at a glance, grouped instead of squeezed into the
  tiny strip up top.
- "Group by domain" sweeps untracked tabs into one card per host — a
  single click and ten Wikipedia tabs are no longer mixed with three
  GitHub PRs and a Bilibili video.
- Pin the tabs you care about. When you close them, they stick around as
  greyed-out "saved" entries so you can re-open them later. Unpinned tabs
  vanish when you close them — no manual cleanup.
- Real-time search filters every group and every tab by title or URL,
  highlights the matched substring, and auto-expands the right card.
- Cmd+B (Mac) / Ctrl+B (Win, Linux) toggles the panel instantly. The
  shortcut is customizable from chrome://extensions/shortcuts.
- The currently focused tab's group lights up so you always know where
  you are in the list.

What Srider does NOT do

- Does not collect, transmit, or sell any of your data.
- Does not read page content. Only tab title, URL, and favicon — the
  same metadata Chrome already shows in its own UI.
- Does not call any third-party service. Has no network code at all.

Privacy

Everything lives in your browser's local storage. Settings sync through
Chrome's own account-level sync (if you have it enabled) — no Srider
servers are involved because there are no Srider servers. Full policy:
<paste the public URL of PRIVACY.md once hosted>.

Permissions Srider asks for

- tabs: read titles and URLs of tabs in the current window
- storage: persist groups, pin state, and settings locally on your device
- sidePanel: render Srider's UI in the browser's built-in side panel
- sessions: best-effort re-associate groups with restored windows after
  a browser restart

No host permissions. No webRequest, no cookies access, no history, no
downloads, no bookmarks.

Recommended browsers

Chrome 114+ or any Chromium-based browser (Edge, Brave, Arc, etc.) with
the Side Panel API.
```

### 中文

```
Srider 把 Chrome 侧边栏改造成一个专注的标签管理器。打开的标签变成左边
的卡片列表，正在看的网页继续占据右边。

为什么用 Srider

- 一眼看到所有打开的标签，按分组排列，不再挤在顶部那条窄窄的标签栏里。
- "按域名分组"一键把未分类的标签按 hostname 整理成卡片。十个 Wikipedia
  和三个 GitHub PR 和一个 B 站视频从此各归各位。
- pin 你关心的标签。关掉它们时它们以灰色"saved"形式留下，方便下次重新
  打开；未 pin 的标签关掉就消失，不用手动清理。
- 实时搜索按标题或 URL 过滤所有分组，命中段加粗高亮，自动展开有匹配的卡。
- 默认 Cmd+B（Mac）/ Ctrl+B（Win、Linux）随手开关侧边栏。快捷键可在
  chrome://extensions/shortcuts 自定义。
- 当前正在浏览的标签所在那张卡片会高亮，永远知道自己在列表里的什么位置。

Srider 不会做的事

- 不收集、不传输、不出售你的任何数据。
- 不读取网页内容。只读 Chrome 标签的标题、URL、favicon —— 和 Chrome
  自己 UI 里能看到的元数据一致。
- 不调用任何第三方服务，没有任何网络请求代码。

隐私

所有数据存在你浏览器的本地存储里。设置通过 Chrome 自己的账号同步（如果
开启了的话）—— Srider 没有服务器参与，因为根本没有 Srider 服务器。
完整政策：<在 PRIVACY.md 公开后替换为它的 URL>

Srider 请求的权限

- tabs：读取当前窗口里标签的标题和 URL
- storage：把分组、pin 状态、设置持久化到本机
- sidePanel：在浏览器自带的侧边栏里渲染 Srider 的 UI
- sessions：浏览器重启后，尽力把分组重新关联到恢复的窗口上

没有 host_permissions，没有 webRequest，不访问 Cookie，不访问历史、
书签、下载。

推荐浏览器

Chrome 114+ 或任何带 Side Panel API 的 Chromium 内核浏览器
（Edge、Brave、Arc 等）。
```

---

## 4. Category

**Productivity**

---

## 5. Permission justifications

The Chrome Web Store dashboard asks for a short reason for each declared
permission. Paste these one-by-one.

| Permission | Justification |
|---|---|
| `tabs` | Srider's core feature is showing every open tab in the side panel. The `tabs` permission is the only way to read tab titles, URLs, and favicons so the panel can display, group, and search them. We never read page content. |
| `storage` | Required to persist the user's groups, per-tab pin state, settings (theme, click behavior, etc.), and the window-fingerprint used to re-associate groups across browser restarts. All storage is local to the user's device. |
| `sidePanel` | Srider's entire UI is the side panel. Without this permission the extension cannot render. |
| `sessions` | Used by the SW startup recovery routine: after the browser restarts and old window IDs no longer match, Srider compares each restored window's tab URLs against the per-window fingerprints it stored, so previously-created groups land back in the right window. No session content is read or transmitted. |

---

## 6. Data usage disclosure

The dashboard makes you tick / explain each data category. Use these
answers verbatim.

| Category | Answer |
|---|---|
| Personally identifiable information | **Not collected** |
| Health information | **Not collected** |
| Financial and payment information | **Not collected** |
| Authentication information | **Not collected** |
| Personal communications | **Not collected** |
| Location | **Not collected** |
| Web history | **Not collected** (Srider reads tabs that are currently open via the `tabs` API; it does not read or store Chrome's browsing history.) |
| User activity | **Not collected** (Srider stores user-created groups locally on-device; nothing is transmitted off-device.) |
| Website content | **Not collected** (Srider reads tab metadata — title, URL, favicon — not page content.) |

### Certifications (tick all three)

- ☑ I do not sell or transfer user data to third parties, outside of the
  approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated
  to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or
  for lending purposes

---

## 7. Privacy policy URL

Push `docs/store/PRIVACY.md` to your GitHub repo (it's already committed)
and use the raw or rendered URL, e.g.:

- Rendered (recommended, human-readable): `https://github.com/<your-handle>/chrome-side-tab/blob/main/docs/store/PRIVACY.md`
- Raw (also accepted): `https://raw.githubusercontent.com/<your-handle>/chrome-side-tab/main/docs/store/PRIVACY.md`

Or host on GitHub Pages / your own domain for a nicer URL.

The store reviewer must be able to load this URL anonymously, so keep the
repo public.

---

## 8. Assets the dashboard wants

| Asset | Path / what to do |
|---|---|
| Icon 128×128 | `public/icons/icon-128.png` (also baked into the zip) |
| Small promo tile 440×280 | `docs/store/promo/small-440x280.png` |
| Marquee promo tile 1400×560 | `docs/store/promo/marquee-1400x560.png` *(optional — only shown if Google features your extension)* |
| Screenshots | **You provide these — see §9.** Required at least 1, max 5. **1280×800 or 640×400**, PNG/JPEG. |
| YouTube preview video | Optional. Skip. |

---

## 9. Screenshots — what to capture

The store reviewer (and prospective users) decide whether to install based
mostly on screenshots. I can't take these for you — they need to be from
your actual side panel showing real tabs. Here's the suggested set, in
order of importance:

1. **Hero shot (must-have)**: side panel open, 3-4 group cards visible
   (mix of auto-domain and manual), one card lit up as the active card.
   Cmd+Shift+4 on macOS for a region screenshot; aim for 1280×800.
2. **Search in action**: type a query in the search box; show the panel
   filtered to two cards with the matched substring highlighted in
   `<mark>`. Conveys the headline feature.
3. **"按域名分组" before/after**: split image (or two consecutive
   screenshots) showing untracked tabs collapsed into per-domain auto
   cards after one click.
4. **Pinned vs unpinned**: a group with a couple of pinned (saved-style
   grey) entries plus live entries, with one row's pin icon visible.
5. **Settings page**: `chrome://extensions/`-Srider-options view of the
   options page so users know it's configurable.

### Sizing tips for macOS

- Use **CleanShot X** or built-in `Cmd+Shift+5 → Options → Save to file`
  and choose a fixed selection.
- The Chrome Web Store accepts both 1280×800 and 640×400; 1280×800 looks
  significantly better in the listing carousel. Take them at 1280×800.
- If the side panel itself is narrower than 1280, pad with a flat
  background screenshot of the page next to it — that's actually closer
  to the real "side panel + page" UX anyway. Or place the panel
  centered on a 1280×800 cream (#faf9f6) or dark (#060608) canvas.

---

## 10. Field-by-field submission walkthrough

In the Chrome Web Store Developer Console for your new item:

### Package
- **Upload package** → `release/srider-v<version>.zip`

### Store listing
- **Detailed description** → §3 above (paste the English first; you can add a `zh-CN` listing afterwards via "Add language")
- **Category** → Productivity
- **Language** → English (United States); after submission, add Chinese (Simplified)
- **Store icon** → upload `public/icons/icon-128.png`
- **Screenshots** → upload the set from §9
- **Small promotional tile** → `docs/store/promo/small-440x280.png`
- **Marquee promotional tile** → `docs/store/promo/marquee-1400x560.png` *(optional)*
- **Official URL** → repo URL (e.g., `https://github.com/<you>/chrome-side-tab`)
- **Homepage URL** → same as Official URL (or a project landing page if you have one)
- **Support URL** → repo's Issues tab (e.g., `https://github.com/<you>/chrome-side-tab/issues`)

### Privacy
- **Single purpose** → §1 above
- **Permission justification** → §5 above, one row at a time
- **Data usage** → §6 above (untick everything; certify all three boxes)
- **Privacy policy URL** → §7 above

### Distribution
- **Visibility** → Public
- **Distribution regions** → All regions
- **Pricing** → Free
- **Mature content** → No

### Submit
- Click **Submit for review**.
- Review typically takes 1–3 business days for a new extension. Google
  emails you when it's approved or rejected. Rejections usually cite the
  exact policy clause and you re-submit with a fix.

---

## 11. Things only you can do (recap)

- ☐ Create a GitHub repo (or whatever public host) and push so the
  privacy policy URL is reachable.
- ☐ Decide your support email (it'll appear publicly on the listing).
- ☐ Take the 1–5 screenshots from §9.
- ☐ Pay the $5 Chrome Web Store developer fee if you haven't (done — you
  said you've registered).
- ☐ Click through the dashboard form using the copy and assets in this
  file.
- ☐ Wait for review.

That's it.
