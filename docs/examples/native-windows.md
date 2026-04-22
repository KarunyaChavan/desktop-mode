# Native windows — coming in Phase 7

**Status: Planned.** Track progress in [native-windows-proposal.md](../native-windows-proposal.md).

Native windows are windows whose content renders directly in the parent DOM instead of inside a chromeless iframe. They're intended for desktop-first UI — small tools, chat widgets, status HUDs — that would be awkward to wedge into a full admin-page iframe.

The **OS Settings** window in the current shell already uses the native-window path internally. Once the API is public, it'll look roughly like this:

```php
<?php
/**
 * Plugin Name: Jorvy (Marvel Quotes)
 */
defined( 'ABSPATH' ) || exit;

wp_register_desktop_window( 'jorvy', array(
    'title' => 'Jorvy',
    'icon'  => 'dashicons-star-filled',
    'width' => 320,
    'height' => 180,
    // Sketch: a path to an enqueued script handle that exports a render function.
    // Exact API is still being designed — see the proposal for the current draft.
    'render' => 'jorvy/render',
) );

wp_register_desktop_icon( 'jorvy', array(
    'title'  => 'Jorvy',
    'icon'   => 'dashicons-star-filled',
    'window' => 'native',
) );
```

```js
// jorvy.js
wp.desktop.registerNativeWindow( 'jorvy', {
    render: ( body ) => {
        const quote = document.createElement( 'p' );
        quote.textContent = '"I am Iron Man."';
        body.appendChild( quote );
        return () => { /* cleanup */ };
    },
} );
```

Meanwhile — if your extension happens to render inside an iframe (a plugin admin page at a specific `admin.php?page=my-plugin` URL), the existing iframe-window path works today. Register it as a dock item and open it via `wp.desktop.windowManager.open()`.

## Related

- [Dock badges](./dock-badge.md) — registering a regular iframe-backed dock item.
- [Architecture: two window types](../architecture.md) — iframe vs native distinction.
- [native-windows-proposal.md](../native-windows-proposal.md) — the RFC.
