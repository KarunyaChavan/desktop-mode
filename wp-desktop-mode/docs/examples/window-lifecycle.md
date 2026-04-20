# Subscribe to window lifecycle events

The shell fires a hook at every meaningful window state change — open, focus, minimize, maximize, drag-end, close, detach, fullscreen. Plugins can subscribe to any of them to drive their own UI or send analytics.

## The hook bus

Every event goes through `window.wp.hooks` (the `@wordpress/hooks` API). The shell aliases it at `wp.desktop.hooks` for convenience; either works. All window actions include at minimum `{ windowId: string }`; the richer payloads are documented in [javascript-reference.md](../javascript-reference.md#window-lifecycle).

## Minimum viable subscriber

```js
// my-plugin.js
( function () {
    // whenReady fires immediately if the shell has already booted, or
    // subscribes to `wp-desktop.init` otherwise. Either way, your
    // subscribers land after `window.wp.desktop` is populated.
    wp.desktop.whenReady( function () {
        wp.desktop.hooks.addAction(
            'wp-desktop.window.opened',
            'my-plugin/track-open',
            function ( payload ) {
                // payload: { windowId, page, title, url }
                console.log( 'Opened', payload.title, '→', payload.url );
            }
        );

        wp.desktop.hooks.addAction(
            'wp-desktop.window.closed',
            'my-plugin/track-close',
            function ( payload ) {
                // payload: { windowId }
                console.log( 'Closed', payload.windowId );
            }
        );
    } );
} )();
```

## Typed subscribers (TypeScript)

Use the `HOOKS` enum so a renamed hook fails at typecheck instead of silently disconnecting:

```ts
import { HOOKS } from 'wp-desktop-mode';

wp.desktop.whenReady( () => {
    wp.desktop.hooks.addAction(
        HOOKS.WINDOW_MAXIMIZED,
        'my-plugin/maximize-fanfare',
        ( e: { windowId: string } ) => {
            console.log( 'Maximized', e.windowId );
        }
    );
} );
```

## What to listen for

| Event | Payload | When |
|---|---|---|
| `wp-desktop.window.opened` | `{ windowId, page, title, url }` | After mount, before the opening animation completes |
| `wp-desktop.window.focused` | `{ windowId }` | Every focus change (click, keyboard, iframe bridge) |
| `wp-desktop.window.closed` | `{ windowId }` | After the close animation starts |
| `wp-desktop.window.minimized` | `{ windowId }` | User clicks minimize or hits a dock shortcut |
| `wp-desktop.window.restored` | `{ windowId }` | From minimized back to normal |
| `wp-desktop.window.maximized` | `{ windowId }` | Full desktop-area fill |
| `wp-desktop.window.unmaximized` | `{ windowId }` | Back to floating (e.g. drag-restore) |
| `wp-desktop.window.fullscreen-entered` | `{ windowId }` | Covers the entire viewport |
| `wp-desktop.window.fullscreen-exited` | `{ windowId }` | Back to whichever state preceded |
| `wp-desktop.window.moved` | `{ windowId, x, y }` | Fires with `drag-end` |
| `wp-desktop.window.resized` | `{ windowId, width, height }` | Fires with `resize-end` |
| `wp-desktop.window.title-changed` | `{ windowId, title }` | Iframe-sourced title updates |
| `wp-desktop.window.detached` | `{ windowId, url }` | Open-in-new-tab via the detach button |

## Cleaning up

`@wordpress/hooks` subscribers stay registered until the page unloads or you explicitly remove them:

```js
wp.desktop.hooks.removeAction(
    'wp-desktop.window.opened',
    'my-plugin/track-open'
);
```

## Related

- [JavaScript reference: window lifecycle](../javascript-reference.md#window-lifecycle) — full payload shapes.
- [Dock badges react to window counts](./dock-badge.md) — worked example using these events.
