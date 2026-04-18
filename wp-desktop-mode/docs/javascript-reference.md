# JavaScript Reference

The browser-side contract. Three layers:

1. **CustomEvents** dispatched on `document` in the parent shell — for shell-side plugins.
2. **`window.wp.desktop`** — the in-tree JS API for the WindowManager and Dock.
3. **`postMessage`** bridge — typed messages between the parent shell and iframe windows.

Status labels match the [Hooks Reference](./hooks-reference.md): **Stable / Experimental / Planned**.

---

## 1. CustomEvents

All events bubble from `document`. The shell dispatches them; plugins listen.

### `wp-desktop-init` — Stable
Fires once, after the shell has initialized and before any session restoration completes. `detail.restored` is `true` if a saved session was restored; `false` for a fresh session.

```javascript
document.addEventListener( 'wp-desktop-init', ( e ) => {
    const { config, restored } = e.detail;
    console.log( 'Desktop up; restored?', restored );
} );
```

**`detail` shape:**

```typescript
{ config: DesktopConfig, restored: boolean }
```

---

### `wp-desktop-window-opened` — Stable
Fires every time a window is added to the stack — both fresh opens and session-restored windows.

```javascript
document.addEventListener( 'wp-desktop-window-opened', ( e ) => {
    const { windowId, page, title } = e.detail;
} );
```

**`detail` shape:**

```typescript
{ windowId: string, page: string, title: string }
```

---

### `wp-desktop-window-focused` — Stable
Fires when a window is focused (promoted to topmost z-index).

```javascript
document.addEventListener( 'wp-desktop-window-focused', ( e ) => {
    console.log( 'Focused', e.detail.windowId );
} );
```

**`detail` shape:** `{ windowId: string }`

---

### `wp-desktop-window-closed` — Stable
Fires after the window is removed from the stack and begins its closing animation.

**`detail` shape:** `{ windowId: string }`

---

### `wp-desktop-window-changed` — Experimental
Internal event used by the session saver. Fires for geometry changes (drag-end, resize-end) and state transitions (minimize, maximize, fullscreen, restore). Signature may change — prefer the per-operation events above for external use.

**`detail` shape:**

```typescript
{ windowId: string, reason: 'moved' | 'resized' | 'state', state: WindowState }
```

---

### `wp-desktop-drag-start` — Planned (Phase 8)
Will fire when a drag operation escalates across window boundaries.

```typescript
{ sourceWindowId: string, payload: { id, url, title, thumbnail } }
```

---

### `wp-desktop-drop` — Planned (Phase 8)
Will fire when a cross-window drop completes.

```typescript
{ sourceWindowId: string, targetWindowId: string, payload: { ... } }
```

---

## 2. `window.wp.desktop` API

Populated after `wp-desktop-init`. Do not access before that event fires.

```typescript
window.wp.desktop = {
    windowManager: WindowManager,
    dock:          Dock | null,
    saveSession:   () => void,
};
```

### `windowManager` — Stable

Exposed instance of the `WindowManager` class.

**Methods:**

```typescript
manager.open( config: { id: string; baseId?: string; multi?: boolean; url: string; title: string; icon?: string; x?: number; y?: number; width?: number; height?: number; initialState?: WindowState; submenu?: { title: string; url: string }[] } ): Window;
manager.openNew( config: /* same shape as open() */ ): Window;
manager.focus( win: Window ): void;
manager.getById( id: string ): Window | undefined;
manager.getByBaseId( baseId: string ): Window | undefined;
manager.getAll(): Window[];
manager.getFocused(): Window | undefined;
manager.snapshot(): Session;
```

**Example — open a window from your own code:**

```javascript
document.addEventListener( 'wp-desktop-init', () => {
    window.wp.desktop.windowManager.open( {
        id:    'my-ext-window',
        url:   '/wp-admin/admin.php?page=my-analytics',
        title: 'Analytics',
        icon:  'dashicons-chart-bar',
    } );
} );
```

Calling `open()` with an id (or `baseId`) that's already on screen focuses the existing window and restores it if minimized.

**Multi-instance windows.** When `multi: true` is passed, the window gets an extra actions menu in its title bar (leading edge, before the icon) whose "Open another" item calls `openNew()`. `openNew()` always creates a fresh window — even when one with the same `baseId` is already open — assigning a suffixed id (`${baseId}-2`, `${baseId}-3`, …) so every instance can be tracked independently while the dock still groups them under the same icon.

```javascript
// Open a second Posts list alongside the first.
window.wp.desktop.windowManager.openNew( {
    id:      'edit-php',
    baseId:  'edit-php',
    url:     '/wp-admin/edit.php',
    title:   'Posts',
    icon:    'dashicons-admin-post',
    multi:   true,
} );
```

The server-side `wp_desktop_dock_item_multi` filter controls which admin pages ship with `multi: true` by default — see the [Hooks reference](./hooks-reference.md#wp_desktop_dock_item_multi--stable).

---

### `dock` — Stable
The `Dock` instance (or `null` if the dock element wasn't in the DOM). Calling it directly is usually unnecessary — dock items are data-driven via `wp_desktop_dock_items`.

---

### `saveSession` — Stable
A debounced function that schedules a session write. Call it after mutating window state from your own code.

```javascript
window.wp.desktop.windowManager.focus( someWindow );
window.wp.desktop.saveSession();
```

---

## 3. `postMessage` bridge

For communication between the parent shell and iframe admin pages. Every message is validated for `event.origin === window.location.origin`.

### iframe → parent

All messages are dispatched via `window.parent.postMessage( { type, ... }, window.location.origin )` from inside the chromeless admin iframe.

#### `wp-desktop-title-change` — Stable
Update the window's title bar.

```typescript
{ type: 'wp-desktop-title-change'; title: string }
```

#### `wp-desktop-navigate` — Stable
Request a navigation from the iframe. `target: 'new'` opens a new browser tab; `'self'` navigates in-frame. The parent decides.

```typescript
{ type: 'wp-desktop-navigate'; url: string; target: 'self' | 'new' }
```

#### `wp-desktop-notification` — Experimental
Ask the shell to display a transient notification (implementation pending).

```typescript
{ type: 'wp-desktop-notification'; title: string; body: string }
```

#### `wp-desktop-ready` — Stable
Fires once when the chromeless page's bridge script initializes. Useful for the parent to detect liveness per-frame.

```typescript
{ type: 'wp-desktop-ready' }
```

#### `wp-desktop-screen-meta` — Stable
Announces the screen-meta panels (Screen Options / Help) that the iframe page exposes. The parent renders corresponding title-bar buttons.

```typescript
{ type: 'wp-desktop-screen-meta'; panels: ( 'screen-options' | 'help' )[] }
```

#### `wp-desktop-screen-meta-state` — Stable
Reports which screen-meta panel (if any) is currently open inside the iframe.

```typescript
{ type: 'wp-desktop-screen-meta-state'; open: 'screen-options' | 'help' | null }
```

---

### parent → iframe

```javascript
iframe.contentWindow.postMessage( { type, ... }, window.location.origin );
```

#### `wp-desktop-focus` — Stable
Instructs the iframe that its containing window has been focused.

```typescript
{ type: 'wp-desktop-focus' }
```

#### `wp-desktop-color-scheme` — Stable
Notifies the iframe of a parent-side color scheme change so CSS Custom Properties can be synced.

```typescript
{ type: 'wp-desktop-color-scheme'; scheme: string }
```

#### `wp-desktop-toggle-panel` — Stable
Asks the iframe to toggle a named screen-meta panel. The iframe is the authority — it responds by emitting a `wp-desktop-screen-meta-state` message.

```typescript
{ type: 'wp-desktop-toggle-panel'; panel: 'screen-options' | 'help' }
```

---

### Safety guidelines for bridge messages

- **Always validate `event.origin`** against `window.location.origin`. Cross-origin messages are rejected by the parent today; your iframe adapter should do the same.
- **Never pass raw HTML** through the bridge. If you need to display text, pass a string and let the parent render it via `textContent`.
- **Be idempotent.** A bridge message may arrive twice during navigations. Design payloads so the second arrival is a no-op.

---

## See also

- [Hooks Reference](./hooks-reference.md) — the PHP side of the API.
- [Examples — React to window events](./examples/react-to-window-events.md)
- [Examples — Add a dock badge](./examples/dock-badge.md)
