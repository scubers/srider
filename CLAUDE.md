# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**Pre-implementation.** The repo currently contains only a design document. There is no source code, no `package.json`, and no build pipeline yet. The first implementation work will scaffold the project per the design.

**Authoritative spec**: [docs/superpowers/specs/2026-05-16-side-tab-extension-design.md](docs/superpowers/specs/2026-05-16-side-tab-extension-design.md). Read this before making implementation decisions — it has interaction flows, data model, and known edge cases that aren't obvious from the project name.

## What the project is

A Chrome browser extension that displays tab groups in the **Chrome Side Panel** (not injected into pages). Groups are extension-managed (independent from Chrome's native `chrome.tabGroups`). Each group holds tabs that can be `live` (currently open) or `saved` (URL preserved after close).

## Architecture invariants

These are decisions that are easy to violate accidentally during implementation:

- **Service Worker is the single source of truth for data writes.** Side Panel UI only reads from storage and dispatches commands; it must not write `chrome.storage.local` directly. Chrome tab events (`onCreated`/`onRemoved`/`onUpdated`) are handled exclusively by the SW.
- **SW ↔ UI communication is via storage.** Use `chrome.storage.onChanged` for reactivity, not message passing. Avoid building a parallel message bus.
- **All Chrome event listeners must be registered at the top level of the service worker module**, synchronously. Registering after `await` means MV3 may recycle the SW and miss events on the next cold start.
- **`TabRef.id` is a stable UUID, not the Chrome `tabId`.** Chrome tab IDs change between sessions; `chromeTabId` is the ephemeral mapping. Code that conflates the two will break across browser restarts.
- **Per-window scope.** Each Chrome window has its own `WindowState` keyed by a self-generated `WindowUUID`. Windows are re-associated across browser restarts by URL-set fingerprint matching (Jaccard ≥ 0.5), not by `chromeWindowId`.

## Storage layout

| Store | Contents | Notes |
|---|---|---|
| `chrome.storage.local` | `AppData` (groups, tabs, window states) | Up to 10MB; survives restarts |
| `chrome.storage.sync` | `Settings` (theme, favicon, click behavior, default expanded) | Synced across devices |
| `chrome.storage.session` | `pendingOpens` and other short-term runtime state | Survives SW recycling, lost on browser restart |

Writes are debounced (~150ms) by default. User-initiated actions (rename, drag, delete) and `onRemoved` write immediately to avoid losing state if the SW is recycled.

## Planned tech stack

Not yet installed. When scaffolding:

- Manifest V3, `chrome.sidePanel` API, `minimum_chrome_version: 114`
- Svelte 5 (runes mode) + TypeScript
- Vite multi-entry build: `sidepanel`, `options`, `background` (service worker)
- `@atlaskit/pragmatic-drag-and-drop` for drag-and-drop (chosen for nested-list + cross-container + native-tab-drop support)
- Vitest + `@testing-library/svelte` for tests
- No `host_permissions` — only tab metadata (URL/title) is needed, not page content

## Project structure (planned, see spec §8)

`src/background/` (SW), `src/sidepanel/` (Svelte app), `src/options/`, `src/shared/` (types, storage abstraction, Svelte rune-based reactive store, message types, UUID, theme).

## Conventions specific to this design

- **Order is encoded as array position**, not an `order: number` field. When reordering, mutate the array.
- **`activeGroupId` may be `null`.** New tabs created when there's no active group go into `WindowState.untrackedTabs`, not into a group. Code that assumes an active group exists will crash on first install.
- **Deleting a group does not close its tabs.** `live` tabs move to `untrackedTabs`; `saved` tabs are discarded. The spec explains why (§6.9).
- **Tab navigation updates `TabRef.url`** — a TabRef represents "that tab" persistently, following it through navigation.

## When extending the spec

If you change behavior that touches the data model, flows, or storage strategy, update [docs/superpowers/specs/2026-05-16-side-tab-extension-design.md](docs/superpowers/specs/2026-05-16-side-tab-extension-design.md) in the same change. The spec is the contract between the SW and the UI; drift will cause subtle bugs.
