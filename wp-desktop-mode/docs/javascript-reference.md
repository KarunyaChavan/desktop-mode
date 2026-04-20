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

### `wp-desktop-window-closing` — Stable
Fires when the user closes a window, BEFORE the outer element is detached from the DOM. Subscribers needing an element reference (wallpaper overlays anchored to specific windows, snow that has piled on the window top, measurement caches) should listen here rather than to `wp-desktop-window-closed` — by the time the `closed` handler runs the element may be mid-fade-out.

**`detail` shape:** `{ windowId: string, element: HTMLElement }`

---

### `wp-desktop-window-closed` — Stable
Fires after the window is removed from the stack and begins its closing animation. Payload intentionally minimal; use `wp-desktop-window-closing` above when you need the element reference.

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
manager.getVisibleRects(): VisibleWindowRect[];
```

**`getVisibleRects()`** — snapshot every open window's current geometry + state. One entry per window in the stack (regardless of virtual desktop), carrying a live element reference. Intended for wallpaper / overlay plugins that previously scraped `document.querySelectorAll( '.wp-desktop-window' )` and sniffed modifier class names to derive state. Callers filter on `state` themselves — minimized windows are included so the consumer can decide.

```typescript
interface VisibleWindowRect {
    windowId: string;
    rect: { x: number; y: number; width: number; height: number };
    state: WindowState;
    element: HTMLElement;
}
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
The left-edge `Dock` instance (or `null` if the dock element wasn't in the DOM). Hosts **core WordPress menus** — Dashboard, Posts, Pages, Media, Users, Settings, CPTs, taxonomies. Calling it directly is usually unnecessary — dock items are data-driven via `wp_desktop_dock_items`.

---

### `taskbar` — Stable
The bottom-edge `Dock` instance (or `null` if the shell markup lacks the taskbar element OR if no plugin-contributed menus were routed to it). Hosts **installed-plugin top-level menus** — anything routed through `admin.php?page=*` that isn't recognized as a core file.

Rendered as a floating macOS-style pill at the bottom of the shell. Same class, same tooltip / active-dot / "+" chip behaviour as the left dock — only orientation + CSS differ.

Server-side the split is driven by `wpdm_dock_placement()` and the `wp_desktop_dock_placement` filter — see the [Hooks reference](./hooks-reference.md#wp_desktop_dock_placement--stable) for how to override routing (pin a plugin to the dock; move a core menu to the taskbar).

**Icon fallback:** when a plugin registers a menu without a dashicon / SVG / URL, the taskbar renders a **letter badge** in a hue deterministically derived from the menu title. Same plugin, same colour across reloads. Plugins shipping their own icon art always override the fallback.

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
| `wp-desktop.wallpaper.surfaces` | filter | Stable | `WallpaperSurface[] → WallpaperSurface[]` — see below |

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
| `wp-desktop.arrange.tile.starting` | action | Stable | `{ windowCount, cols, rows }` — before tile lays out the grid |
| `wp-desktop.arrange.tile.applied` | action | Stable | `{ windowCount, cols, rows }` |
| `wp-desktop.arrange.tile.dimensions` | filter | Stable | filters `{ cols, rows }`; context `{ windowCount, areaWidth, areaHeight }`. Override the auto-chosen grid (e.g., force a 3-column newsroom layout). Returns must be positive integers and `cols * rows >= windowCount`, otherwise the filter is ignored. |
| `wp-desktop.arrange.snap.changed` | action | Stable | `{ enabled }` — fires when the user toggles "Snap to grid" |
| `wp-desktop.arrange.snap.cell-size` | filter | Stable | filters `{ cellWidth, cellHeight }`; context `{ areaWidth, areaHeight }`. Override the auto-computed snap cell size (e.g., enforce a fixed 100×100 grid). Non-positive returns are ignored. |
| `wp-desktop.arrange.custom-action` | action | Stable | `{ id }` — fires when the user clicks a plugin-registered Arrange-menu item (registered server-side via the `wp_desktop_arrange_menu_items` PHP filter). The `id` matches the `id` field the plugin supplied. |

#### Virtual desktops ("Spaces")

Each user can have multiple desktops, each owning its own set of windows. Switching desktops swaps which windows are visible without destroying any. The overview top bar surfaces tile-per-desktop UI for switching, creating, and closing.

| Hook | Kind | Status | Payload |
|---|---|---|---|
| `wp-desktop.desktop.created` | action | Stable | `{ desktopId }` — fires after a new desktop joins the registry |
| `wp-desktop.desktop.closed` | action | Stable | `{ desktopId, migratedTo }` — `migratedTo` is the desktop that received any orphaned windows |
| `wp-desktop.desktop.switched` | action | Stable | `{ from, to }` — the active desktop changed |

Closing the last remaining desktop is rejected silently (the shell needs at least one). Closing a desktop that has windows migrates them to the surviving desktop on its left (falling back to the right when the leftmost is closed) — no work is silently destroyed.

#### Widgets

Small cards that paint in the right-side column above the wallpaper but beneath every window. Lifecycle mirrors canvas wallpapers — `mount(container)` returns a teardown the layer calls on remove / page unload.

Register via the public helper:

```js
wp.desktop.registerWidget( {
    id: 'jorvy/quote',
    label: 'Marvel Quote',
    description: 'A random quote, refreshed every 10 seconds.',
    icon: 'dashicons-format-quote',
    mount: ( container ) => {
        const el = document.createElement( 'p' );
        el.textContent = '"I am Iron Man."';
        container.appendChild( el );
        return () => {
            el.remove();
        };
    },
} );
```

**Optional placement / sizing fields** (all default off, fully back-compat with 0.7.x widgets):

| Field | Type | What it does |
|---|---|---|
| `movable` | `boolean` | Show a thin chrome header at the top of the card with a drag grip + label + × button. The user can drag the card from the chrome to place the widget anywhere on the desktop (first drag "liberates" it from the right-side column). Text inputs / buttons inside the widget body are unaffected — drag only initiates from the chrome. |
| `resizable` | `boolean` | Add resize handles. With `movable: true`, 8 handles (corners + edges). Without it, only the bottom edge is draggable so width stays locked to the column. |
| `minWidth`, `minHeight` | `number` | Lower bounds enforced during user resize (px). |
| `maxWidth`, `maxHeight` | `number` | Upper bounds enforced during user resize (px). |
| `defaultWidth`, `defaultHeight` | `number` | Initial floating size — used the first time the widget is liberated. |

```js
wp.desktop.registerWidget( {
    id: 'my/notes',
    label: 'Sticky notes',
    description: 'A quick scratchpad you can drop anywhere.',
    icon: 'dashicons-welcome-write-blog',
    movable: true,
    resizable: true,
    minWidth: 200,
    minHeight: 120,
    defaultWidth: 280,
    defaultHeight: 220,
    mount: ( container ) => {
        const ta = document.createElement( 'textarea' );
        ta.value = window.localStorage.getItem( 'my-notes' ) || '';
        ta.oninput = () =>
            window.localStorage.setItem( 'my-notes', ta.value );
        container.appendChild( ta );
        return () => ta.remove();
    },
} );
```

User-placed geometry (position + size of liberated widgets) persists per-user in `localStorage` under `wp-desktop-widgets-geometry`. Removing a widget clears its stored geometry so a re-add starts docked in the column again.

| Hook | Kind | Status | Payload |
|---|---|---|---|
| `wp-desktop.widgets` | filter | Stable | the registry array |
| `wp-desktop.widget.mounting` | action | Stable | `{ id, container, ctx }` — before paint |
| `wp-desktop.widget.mounted` | action | Stable | `{ id, container, ctx }` — after paint |
| `wp-desktop.widget.unmounting` | action | Stable | `{ id }` — before teardown |
| `wp-desktop.widget.mount-failed` | action | Stable | `{ id, error }` |
| `wp-desktop.widget.added` | action | Stable | `{ id }` — user added via the picker |
| `wp-desktop.widget.removed` | action | Stable | `{ id }` — user removed via the card's × |

The `ctx` argument exposes `{ id, pluginUrl }` — the same shape canvas wallpapers receive. Enabled widgets persist per-user in `localStorage` (`wp-desktop-widgets`).

#### Window lifecycle

All window actions include at minimum `{ windowId: string }` — additional fields called out in the payload column.

| Hook | Kind | Status | Payload |
|---|---|---|---|
| `wp-desktop.window.opened` | action | Stable | `{ windowId, page, title, url }` |
| `wp-desktop.window.closing` | action | Stable | `{ windowId, element }` — fires BEFORE the element is detached (use this when you need an element reference, e.g. for anchored wallpaper overlays) |
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
| `wp-desktop.window.bounds-changed` | action | Stable | `{ windowId, x, y, width, height, state, phase: 'drag' \| 'resize' }` — rAF-coalesced, fires at most once per animation frame during an active drag or resize. See below. |
| `wp-desktop.window.detached` | action | Stable | `{ windowId, url }` — user opened in a classic-admin tab |

**About `bounds-changed`.** Intended for per-frame collision-aware effects (snow piling on window tops, rain splashes, physics-driven overlays). Coalesced via `requestAnimationFrame` so a pointermove storm collapses to one fire per paint — matches the cadence a canvas wallpaper's own ticker runs at, and replaces the "poll `getBoundingClientRect` every rAF" pattern. NOT fired at drag/resize end — use `wp-desktop.window.drag-end` / `wp-desktop.window.resize-end` for settled geometry.

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
| `taskbar` | Stable | Bottom-edge Dock instance (null if no element or no plugin menus routed to taskbar) |
| `registerWallpaper( def )` | Stable | Add a wallpaper to the registry + re-apply |
| `registerWidget( def )` | Stable | Add a widget to the registry |
| `loadVendorScript( url )` | Stable | Memoized `<script>` injector. Low-level; most plugins use `needs` instead. |
| `getWallpaperSurfaces()` | Stable | Live `WallpaperSurface[]` for collision-aware wallpapers. See "Wallpaper surfaces" below. |
| `registerModule( def )` | Stable | Register a shared vendor library under a stable id. |
| `loadModules( ids )` | Stable | Imperatively load registered modules. Usually unnecessary — canvas wallpapers declare `needs[]` and the shell resolves. |
| `whenReady( cb )` | Stable | Run `cb` after `wp-desktop.init` has fired |
| `refreshMenu()` | Stable | Force a refetch of the live admin-menu split. Auto-fired on plugin activation / deactivation. |
| `setDefaultWindow( url \| null )` | Stable | Update the user's "open on startup" preference. |
| `config` | Stable | The `DesktopConfig` that booted the shell |

### Wallpaper surfaces

Collision-aware wallpapers (snow, rain, leaves, particle effects) need to know where things can "land" — window tops, the desktop floor, the taskbar top, the dock's inline edge, widget cards. Rather than having every wallpaper hand-query the shell's DOM + hope the class names don't move, the shell emits a live surface list through `wp.desktop.getWallpaperSurfaces()`.

```typescript
interface WallpaperSurface {
    id: string;             // 'window:foo', 'shell:floor', 'taskbar:top', 'dock:edge', 'widget:clock', or plugin-supplied
    kind: 'window' | 'shell' | 'taskbar' | 'dock' | 'widget' | 'custom';
    rect: { x: number; y: number; width: number; height: number };  // viewport coordinates
    face: 'top' | 'bottom' | 'left' | 'right';  // which edge is solid
    element: HTMLElement | null;                // null for synthetic surfaces
}
```

**Shell-seeded surfaces** (the baseline, before the filter runs):

- `window:<id>` — every non-minimized window's top edge (`face: 'top'`), one per window.
- `shell:floor` — bottom edge of the shell container.
- `taskbar:top` — top of the bottom taskbar pill, when present.
- `dock:edge` — right (inline-end) edge of the left-edge dock.
- `widget:<id>` — top edge of every mounted widget card.

**Adding a custom surface.** Plugins that own floating DOM use the `wp-desktop.wallpaper.surfaces` filter:

```javascript
wp.hooks.addFilter(
    'wp-desktop.wallpaper.surfaces',
    'myplugin/picker',
    ( surfaces ) => {
        const picker = document.querySelector( '.myplugin-picker' );
        if ( ! picker ) return surfaces;
        const r = picker.getBoundingClientRect();
        return [
            ...surfaces,
            {
                id: 'myplugin:picker',
                kind: 'custom',
                rect: { x: r.left, y: r.top, width: r.width, height: r.height },
                face: 'top',
                element: picker,
            },
        ];
    }
);
```

**Usage from a canvas wallpaper:**

```javascript
function onTick() {
    const surfaces = wp.desktop.getWallpaperSurfaces();
    // Rebuild collision cache from `surfaces`, run physics step, draw.
}
```

Call it each frame (or throttled — the function is cheap but it does walk the DOM). Rects are in viewport coordinates so a canvas mounted inside `#wp-desktop-wallpaper` can translate to its own drawing space using the wallpaper element's own `getBoundingClientRect()`.

**Pair with `wp-desktop.window.bounds-changed`.** During a drag or resize the shell fires `bounds-changed` once per animation frame with the live `{ x, y, width, height }`. Subscribe there to invalidate your surface cache instead of polling `getBoundingClientRect()` each tick.

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
