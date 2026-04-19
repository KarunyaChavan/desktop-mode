# JavaScript Reference

The browser-side contract. Four layers:

1. **WordPress-style hooks** via `window.wp.hooks` — the primary extension surface.
2. **CustomEvents** dispatched on `document` in the parent shell — for shell-side plugins.
3. **`window.wp.desktop`** — the in-tree JS API for the WindowManager, Dock, and hook helpers.
4. **`postMessage`** bridge — typed messages between the parent shell and iframe windows.

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

## 4. Hooks — `wp-desktop.*`

Desktop Mode exposes WordPress-style filters and actions via the standard `@wordpress/hooks` package. The plugin declares `wp-hooks` as a script dependency so `window.wp.hooks` is always available before the shell boots, and all hook names live in the `wp-desktop.` namespace to avoid collisions with Core or Gutenberg.

If you've used `addFilter` / `addAction` in Gutenberg, you already know how these work — there's nothing new to learn.

### Bootstrap

Plugins typically register everything inside a `wp-desktop.init` action callback so the `window.wp.desktop` public API is guaranteed to be populated when they fire. Late-enqueued scripts can call `wp.desktop.whenReady(cb)` — it runs immediately if init has already fired, otherwise it queues.

```javascript
wp.hooks.addAction( 'wp-desktop.init', 'my-plugin/boot', () => {
    // wp.desktop is fully populated; register away.
    wp.desktop.registerWallpaper( myWallpaper );
} );
```

### Hooks catalog

#### Shell & wallpapers

| Hook | Kind | Status | Payload |
|---|---|---|---|
| `wp-desktop.init` | action | Stable | `{ config: DesktopConfig }` |
| `wp-desktop.shell.resized` | action | Stable | `{ width, height }` — debounced ~120 ms after the browser stops resizing |
| `wp-desktop.shell.visibility` | action | Stable | `{ state: 'visible' \| 'hidden' }` — mirrors `document.visibilitychange` |
| `wp-desktop.wallpapers` | filter | Stable | `WallpaperDef[] → WallpaperDef[]` |
| `wp-desktop.wallpaper.mounting` | action | Stable | `{ id, container, ctx }` |
| `wp-desktop.wallpaper.mounted` | action | Stable | `{ id, container, ctx }` |
| `wp-desktop.wallpaper.unmounting` | action | Stable | `{ id }` |
| `wp-desktop.wallpaper.mount-failed` | action | Stable | `{ id, error }` |
| `wp-desktop.wallpaper.visibility` | action | Stable | `{ id, state: 'visible' \| 'hidden' }` |

#### Arrange & Overview

Fired by the admin-bar "Arrange" menu's layout algorithms. The overview hooks come in pairs (enter/exit, hover/unhover) so plugins can maintain accurate state counts.

| Hook | Kind | Status | Payload |
|---|---|---|---|
| `wp-desktop.overview.entering` | action | Stable | `{}` — before the enter animation starts |
| `wp-desktop.overview.entered` | action | Stable | `{}` — fires ~300 ms later, after the grid settles |
| `wp-desktop.overview.exiting` | action | Stable | `{ windowId?: string, reason: 'select' \| 'cancel' }` |
| `wp-desktop.overview.exited` | action | Stable | same payload as `exiting` |
| `wp-desktop.overview.window-hover` | action | Stable | `{ windowId }` |
| `wp-desktop.overview.window-unhover` | action | Stable | `{ windowId }` |
| `wp-desktop.overview.window-click` | action | Stable | `{ windowId }` — fires just before `exiting` when a thumbnail is clicked |
| `wp-desktop.arrange.cascade.starting` | action | Stable | `{ windowCount }` |
| `wp-desktop.arrange.cascade.applied` | action | Stable | `{ windowCount }` |

#### Window lifecycle

All window actions include at minimum `{ windowId: string }` — additional fields called out in the payload column.

| Hook | Kind | Status | Payload |
|---|---|---|---|
| `wp-desktop.window.opened` | action | Stable | `{ windowId, page, title, url }` |
| `wp-desktop.window.closed` | action | Stable | `{ windowId }` |
| `wp-desktop.window.focused` | action | Stable | `{ windowId }` — fires on focus changes |
| `wp-desktop.window.title-changed` | action | Stable | `{ windowId, title }` — iframe-sourced title updates |
| `wp-desktop.window.minimized` | action | Stable | `{ windowId }` |
| `wp-desktop.window.restored` | action | Stable | `{ windowId }` — restored from minimized |
| `wp-desktop.window.maximized` | action | Stable | `{ windowId }` |
| `wp-desktop.window.unmaximized` | action | Stable | `{ windowId }` |
| `wp-desktop.window.fullscreen-entered` | action | Stable | `{ windowId }` |
| `wp-desktop.window.fullscreen-exited` | action | Stable | `{ windowId }` |
| `wp-desktop.window.drag-start` | action | Stable | `{ windowId }` |
| `wp-desktop.window.drag-end` | action | Stable | `{ windowId, x, y }` |
| `wp-desktop.window.moved` | action | Stable | `{ windowId, x, y }` — fires with drag-end |
| `wp-desktop.window.resize-start` | action | Stable | `{ windowId }` |
| `wp-desktop.window.resize-end` | action | Stable | `{ windowId, width, height }` |
| `wp-desktop.window.resized` | action | Stable | `{ windowId, width, height }` — fires with resize-end |
| `wp-desktop.window.detached` | action | Stable | `{ windowId, url }` — user opened in a classic-admin tab |

The window hooks fan out alongside the existing `wp-desktop-window-*` CustomEvents (see section 2) — both APIs fire for every state change. New code should prefer the hook bus.

All hooks can be listed via `wp.hooks.hasAction()` / `hasFilter()` for defensive checks.

### Filter: `wp-desktop.wallpapers`

Receives the registered wallpaper list. Plugins can add entries, remove entries, or reorder — callback returns the (possibly modified) array.

```javascript
// Remove the 'aurora' preset from the picker grid.
wp.hooks.addFilter(
    'wp-desktop.wallpapers',
    'my-plugin/hide-aurora',
    ( list ) => list.filter( ( w ) => w.id !== 'aurora' )
);
```

In practice most plugins use the `wp.desktop.registerWallpaper()` convenience — internally it adds a filter callback under a namespace the shell generates for you, so the raw filter API is only needed for non-additive operations.

---

## 5. Wallpaper registration API

The shell ships a registry-driven wallpaper picker: every entry in the registry becomes a swatch in the OS Settings panel, and the WallpaperLayer resolves whichever is currently selected onto the desktop. Plugins register their own via `wp.desktop.registerWallpaper()` (or the `wp-desktop.wallpapers` filter).

Two shapes ship today: `css` (a static CSS background value) and `canvas` (a plugin-managed DOM subtree, typically a WebGL/2D canvas).

### Shape

```typescript
type WallpaperDef =
    | {
          type: 'css';
          id: string;
          label: string;
          preview: string;            // CSS `background` value for the swatch
          value?: string;             // Applied to --wp-desktop-bg
          resolveValue?: ( ctx: WallpaperContext ) => string;  // Dynamic alternative
          renderEditor?: WallpaperEditor;
      }
    | {
          type: 'canvas';
          id: string;
          label: string;
          preview: string;            // CSS `background` for the swatch (pre-mount)
          mount: ( container: HTMLElement, ctx: WallpaperContext ) =>
                  ( () => void ) | Promise<() => void>;
          renderEditor?: WallpaperEditor;
      };

interface WallpaperContext {
    id: string;
    pluginUrl: string;                // no trailing slash
    prefersReducedMotion: boolean;
    visible: boolean;                 // current document visibility
}
```

### Minimal CSS wallpaper

```javascript
wp.hooks.addAction( 'wp-desktop.init', 'my-plugin/boot', () => {
    wp.desktop.registerWallpaper( {
        id: 'my-plugin/ocean',
        label: 'Ocean',
        type: 'css',
        value: 'linear-gradient(180deg, #0ea5e9, #1e3a8a)',
        preview: 'linear-gradient(180deg, #0ea5e9, #1e3a8a)',
    } );
} );
```

### Canvas wallpaper with a declared dependency

Don't hardcode URLs to vendor libraries — declare them by module id. The shell pre-registers common modules (`pixijs` today), and plugins can register their own. When the wallpaper activates, the shell loads every listed module before `mount` fires; concurrent activations dedupe through the memoized script loader.

```javascript
wp.hooks.addAction( 'wp-desktop.init', 'my-plugin/boot', () => {
    wp.desktop.registerWallpaper( {
        id: 'my-plugin/spinner',
        label: 'Spinner',
        type: 'canvas',
        preview: '#0a0a1a',
        needs: [ 'pixijs' ],        // ← shell loads this before mount
        mount: async ( container, ctx ) => {
            // window.PIXI is guaranteed defined at this point.
            const app = new window.PIXI.Application();
            await app.init( { resizeTo: container } );
            container.appendChild( app.canvas );

            if ( ctx.prefersReducedMotion ) {
                // Render a still frame; never start the ticker.
                app.ticker.stop();
            }

            return () => app.destroy( true );
        },
    } );
} );
```

Unknown module ids fail loudly via `wp-desktop.wallpaper.mount-failed` — no silent non-activations.

### Registering your own module

If your plugin ships a library other plugins might want to share, register it once and let them `needs:` it by id.

```javascript
wp.desktop.registerModule( {
    id: 'three-js',
    url: `${ wp.desktop.config.pluginUrl }/vendor/three.min.js`,
    // Optional: skip re-loading if already present (e.g. Core shipped it).
    isReady: () => typeof window.THREE !== 'undefined',
} );
```

### Lifecycle guarantees

The shell protects against mount/unmount races with a monotonic generation counter. Rapid wallpaper switching is safe — a mount that resolves after the user has already picked something else tears itself down immediately and doesn't pollute the DOM.

Canvas wallpapers receive `ctx.prefersReducedMotion` and should render a single static frame rather than starting an animation loop when it's true. The shell also fires `wp-desktop.wallpaper.visibility` on every `document.visibilitychange` so wallpapers can pause their tickers when the tab is backgrounded.

### `renderEditor` — in-panel controls

Any wallpaper can ship a `renderEditor` callback — when that wallpaper is the selected swatch in OS Settings, a collapsible panel opens below the grid and the editor is rendered into it. Same animation as the built-in custom-gradient editor.

```javascript
wp.desktop.registerWallpaper( {
    id: 'my-plugin/tunable',
    label: 'Tunable',
    type: 'css',
    preview: '#334155',
    resolveValue: () => myState.currentColor,
    renderEditor: ( container, ctx ) => {
        const picker = makeColorPicker( myState.currentColor );
        picker.onChange = ( v ) => {
            myState.currentColor = v;
            // Registered with resolveValue, so the shell re-reads it
            // on the next apply — just re-apply to repaint.
            // (A future API may add a helper for this pattern.)
        };
        container.appendChild( picker.el );
        return () => picker.destroy();
    },
} );
```

### `window.wp.desktop` members

| Member | Status | Notes |
|---|---|---|
| `windowManager` | Stable | WindowManager instance |
| `dock` | Stable | Dock instance (null if no dock element) |
| `saveSession()` | Stable | Force a session write |
| `hooks` | Stable | Alias of `window.wp.hooks` |
| `registerWallpaper( def )` | Stable | Add a wallpaper to the registry + re-apply |
| `loadVendorScript( url )` | Stable | Memoized `<script>` injector. Low-level; most plugins use `needs` instead. |
| `registerModule( def )` | Stable | Register a shared vendor library under a stable id. |
| `loadModules( ids )` | Stable | Imperatively load registered modules. Usually unnecessary — canvas wallpapers declare `needs[]` and the shell resolves. |
| `whenReady( cb )` | Stable | Run `cb` after `wp-desktop.init` has fired |
| `config` | Stable | The `DesktopConfig` that booted the shell |

### Pre-registered modules

| id | ships from | global |
|---|---|---|
| `pixijs` | `assets/vendor/pixi.min.js` (PixiJS v8) | `window.PIXI` |

---

## See also

- [Hooks Reference](./hooks-reference.md) — the PHP side of the API.
- [Examples — React to window events](./examples/react-to-window-events.md)
- [Examples — Add a dock badge](./examples/dock-badge.md)
- [Examples — Register a wallpaper](./examples/register-wallpaper.md)
