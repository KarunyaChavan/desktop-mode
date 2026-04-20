# Hooks Reference

Every PHP action and filter the plugin fires, with signatures, examples, and **implementation status**.

- **Stable** — shipping today, keep working across the current major version.
- **Experimental** — shipping, but signature may change.
- **Planned** — reserved name, not yet fired. Do not subscribe in production.

If something you need isn't here, open an issue. New hooks are welcome — our rule of thumb: *if a function decides something, wrap it in a filter; if it does something, fire an action around it.*

> **Looking for JavaScript hooks?** The browser-side shell exposes WordPress-style filters and actions via `window.wp.hooks` under the `wp-desktop.*` namespace — including hooks for wallpaper registration, window lifecycle, and the animated logo wallpaper's visibility events. See the [JavaScript Reference](./javascript-reference.md#4-hooks--wp-desktop) for the full catalog.

### PHP vs. JS hook parity

The two hook surfaces are **deliberately not mirrored** — they target different extension points:

- **PHP hooks** (this file) fire on the server: shell mount, chromeless render, dock-items composition, portal / session logic. If you're changing server-rendered state, you want PHP.
- **JS hooks** (javascript-reference.md) fire in the browser: window lifecycle, drag / resize, overview, arrange actions, wallpaper + widget mount lifecycle, virtual-desktop transitions. If you're reacting to user interaction, you want JS.

A few concepts ARE mirrored (e.g. `wp_desktop_dock_items` PHP filter ↔ `wp-desktop.widgets` JS filter — both shape registries), but most aren't. Don't be surprised if a JS hook has no PHP counterpart or vice versa — that's the design.

---

## Actions

### `wp_desktop_mode_init` — Stable
Fires once inside the parent shell render, after desktop assets have been enqueued. Use this to enqueue your own shell-side JS/CSS.

```php
do_action( 'wp_desktop_mode_init' );
```

**Example:**

```php
add_action( 'wp_desktop_mode_init', function () {
    wp_enqueue_script(
        'my-ext',
        plugin_dir_url( __FILE__ ) . 'ext.js',
        array(),
        '1.0',
        true
    );
} );
```

---

### `wp_desktop_shell_before` — Stable
Fires just before the shell's opening `<div id="wp-desktop-shell">`. Echo HTML here to prepend sibling markup (e.g. a global announcement banner that sits above the shell).

```php
do_action( 'wp_desktop_shell_before' );
```

---

### `wp_desktop_shell_after` — Stable
Fires just after the shell's closing `</div>`. Echo HTML to append below it.

```php
do_action( 'wp_desktop_shell_after' );
```

---

### `wp_desktop_chromeless_styles` — Stable
Fires inside iframe (chromeless) requests, during `admin_enqueue_scripts`. Use it to enqueue **iframe-scoped** CSS that fine-tunes how specific admin pages render inside a window.

```php
do_action( 'wp_desktop_chromeless_styles' );
```

**Example:**

```php
add_action( 'wp_desktop_chromeless_styles', function () {
    wp_add_inline_style(
        'wp-desktop-chromeless',
        'body.edit-php .subsubsub { margin-top: 4px; }'
    );
} );
```

---

### `wp_desktop_chromeless_after` — Stable
Fires in the `admin_footer` of chromeless iframe requests. Receives the current admin page's `$hook_suffix`.

```php
do_action( 'wp_desktop_chromeless_after', $hook_suffix );
```

**Example — emit a ready ping from the iframe:**

```php
add_action( 'wp_desktop_chromeless_after', function ( $hook_suffix ) {
    ?>
    <script>
        window.parent.postMessage(
            { type: 'my-ext-ready', hook: <?php echo wp_json_encode( $hook_suffix ); ?> },
            window.location.origin
        );
    </script>
    <?php
} );
```

---

### `wp_desktop_prepare_window` — Planned
Will fire once per window the shell is about to construct (both on fresh open and session restore). Planned signature:

```php
do_action( 'wp_desktop_prepare_window', string $page, array $args );
```

---

## Filters

### `wp_desktop_mode_enabled` — Stable

Gates whether desktop mode can be activated (or stay active) for a given user. The AJAX save endpoint consults this after the nonce check.

```php
apply_filters( 'wp_desktop_mode_enabled', bool $enabled, int $user_id );
```

**Example — disable for contributors:**

```php
add_filter( 'wp_desktop_mode_enabled', function ( $enabled, $user_id ) {
    if ( user_can( $user_id, 'contributor' ) && ! user_can( $user_id, 'edit_posts' ) ) {
        return false;
    }
    return $enabled;
}, 10, 2 );
```

A `false` return means the user cannot toggle the mode on — the AJAX endpoint returns `desktop_mode_disabled`.

---

### `wp_desktop_shell_config` — Stable

The JS configuration blob injected as `window.wpDesktopConfig`. Powers the window manager, dock, and session restore. Filter this to inject custom payloads the shell can read at boot.

```php
apply_filters( 'wp_desktop_shell_config', array $config );
```

`$config` shape:

```php
array(
    'currentPage'    => string,   // e.g. 'http://localhost:8889/wp-admin/'
    'currentTitle'   => string,   // human title of the current page
    'currentIcon'    => string,   // dashicons-* class
    'adminUrl'       => string,   // admin_url()
    'portalUrl'      => string,   // wpdm_portal_url()
    'sessionUrl'     => string,   // REST session URL
    'restNonce'      => string,   // X-WP-Nonce
    'dockItems'      => array[],  // see wp_desktop_dock_items
    'session'        => array,    // prior session snapshot or empty
)
```

**Example — add a flag for your feature:**

```php
add_filter( 'wp_desktop_shell_config', function ( $config ) {
    $config['myFeature'] = array(
        'enabled'  => (bool) get_option( 'my_ext_shell_feature' ),
        'endpoint' => rest_url( 'my-ext/v1/data' ),
    );
    return $config;
} );
```

Read it from JS:

```javascript
const cfg = window.wpDesktopConfig;
if ( cfg.myFeature && cfg.myFeature.enabled ) { /* ... */ }
```

---

### `wp_desktop_dock_items` — Stable

The final list of dock items, as an array of item arrays. Return a modified list — add, remove, reorder.

```php
apply_filters( 'wp_desktop_dock_items', array $items );
```

Each item:

```php
array(
    'slug'    => string,   // stable ID; drives the window ID too
    'title'   => string,   // hover tooltip
    'icon'    => string,   // dashicons-* or a sanitized http(s)/data: URL
    'url'     => string,   // page to open when clicked
    'badge'   => int,      // e.g. update count; 0 = hidden
    'submenu' => array[]?, // optional [ [ 'title' => ..., 'url' => ... ], ... ]
)
```

**Example — add a virtual dock item:**

```php
add_filter( 'wp_desktop_dock_items', function ( $items ) {
    $items[] = array(
        'slug'    => 'analytics',
        'title'   => __( 'Analytics', 'my-ext' ),
        'icon'    => 'dashicons-chart-bar',
        'url'     => admin_url( 'admin.php?page=my-analytics' ),
        'badge'   => 0,
        'submenu' => array(),
    );
    return $items;
} );
```

**Example — remove an item by slug:**

```php
add_filter( 'wp_desktop_dock_items', function ( $items ) {
    return array_values( array_filter( $items, fn( $i ) => 'edit-comments.php' !== $i['slug'] ) );
} );
```

---

### `wp_desktop_dock_item` — Stable

Fires for each item as the dock is assembled, with the source admin-menu slug for context.

```php
apply_filters( 'wp_desktop_dock_item', array $item, string $menu_slug );
```

**Example — rewrite the Posts icon:**

```php
add_filter( 'wp_desktop_dock_item', function ( $item, $slug ) {
    if ( 'edit.php' === $slug ) {
        $item['icon'] = 'dashicons-welcome-write-blog';
    }
    return $item;
}, 10, 2 );
```

---

### `wp_desktop_dock_item_multi` — Stable

Controls whether a dock item supports multiple simultaneous windows. Multi-capable pages expose a "+" chip on the dock icon and an "Open another" action in the window's title-bar menu; singletons always focus the existing window when re-opened.

Built-in defaults: `edit.php`, `edit-tags.php`, `upload.php`, `users.php`, and `edit-comments.php` are multi; everything else is singleton. The base filename is matched against the list, so every CPT (`edit.php?post_type=page`) and every taxonomy inherits the same rule as its parent admin file.

```php
apply_filters( 'wp_desktop_dock_item_multi', bool $multi, string $menu_slug );
```

**Example — let a custom plugin page open multiple windows:**

```php
add_filter( 'wp_desktop_dock_item_multi', function ( $multi, $slug ) {
    if ( 'my-plugin-entities' === $slug ) {
        return true;
    }
    return $multi;
}, 10, 2 );
```

**Example — force Users into singleton mode:**

```php
add_filter( 'wp_desktop_dock_item_multi', function ( $multi, $slug ) {
    return 'users.php' === $slug ? false : $multi;
}, 10, 2 );
```

---

### `wp_desktop_dock_placement` — Stable

Chooses where a menu item appears in the desktop shell. Three values are recognized:

- `'dock'` — left-edge vertical strip (core WordPress menus — Dashboard, Posts, Media, Users, Settings, CPTs, taxonomies…).
- `'taskbar'` — bottom horizontal pill (default for installed-plugin top-level menus routed through `admin.php?page=*`).
- `'hidden'` — suppress the item entirely. The underlying admin menu entry still exists server-side; this only prevents rendering on either desktop-mode rail. Plugins that don't want to claim chrome real estate (utility tools, background services, plugins that render only into existing surfaces) set this.

```php
apply_filters( 'wp_desktop_dock_placement', string $placement, string $menu_slug );
```

The built-in routing heuristic (`wpdm_dock_placement`) returns `'dock'` for:

- Hardcoded core menu files (`index.php`, `edit.php`, `upload.php`, `plugins.php`, `users.php`, `tools.php`, `options-*.php`, `themes.php`, `site-health.php`, `update-core.php`, and every admin file in the core allowlist).
- Every `edit.php?post_type=*` route (all Custom Post Types render alongside core menus).
- Every `edit-tags.php?taxonomy=*` route (taxonomies follow their parent).

Every other top-level menu returns `'taskbar'`. Return `'dock'` to promote a plugin menu onto the left rail, `'taskbar'` to demote a core-looking menu out of it, or `'hidden'` to remove it from the shell entirely.

Return values other than those three are silently ignored — the item falls back to the default. That keeps a misbehaving filter (returning `null`, a bool, etc.) from corrupting the rail split.

**Example — pin a plugin menu to the left dock because it's a first-class admin surface on this install:**

```php
add_filter( 'wp_desktop_dock_placement', function ( $placement, $slug ) {
    if ( 'woocommerce' === $slug ) {
        return 'dock';
    }
    return $placement;
}, 10, 2 );
```

**Example — move Tools down to the taskbar because the site never uses it:**

```php
add_filter( 'wp_desktop_dock_placement', function ( $placement, $slug ) {
    if ( 'tools.php' === $slug ) {
        return 'taskbar';
    }
    return $placement;
}, 10, 2 );
```

**Example — hide a plugin from the shell entirely (from inside that plugin's own PHP):**

```php
add_filter( 'wp_desktop_dock_placement', function ( $placement, $slug ) {
    if ( 'my-background-tool' === $slug ) {
        return 'hidden';
    }
    return $placement;
}, 10, 2 );
```

The split happens once per request, server-side, in `includes/render.php` — each item's `placement` key is computed when `wpdm_build_dock_items()` runs, then the shell splits the list into `config.dockItems` + `config.taskbarItems` before localizing to JS. Hidden items are dropped before either list is built. The client never re-sorts, so the filter is the only place to override routing.

The live menu-refresh endpoint (`GET /wp-desktop/v1/menu`, fired after plugin activation / deactivation inside a windowed `plugins.php`) runs the same builder, so a filter change takes effect without a full tab reload.

---

### `wp_desktop_arrange_menu_items` — Stable

The list of plugin-contributed items appended to the admin bar's **Arrange** submenu — the dropdown that sits next to the "Switch to…" toggle when desktop mode is active. Built-ins (Cascade, Overview, Snap to grid, Tile all windows) are always present; this filter adds to them. Only invoked when the user is viewing the desktop shell.

```php
apply_filters( 'wp_desktop_arrange_menu_items', array $items );
```

Each item is an associative array:

```php
array(
    'id'          => string, // unique slug; letters/digits/dashes only
    'title'       => string, // menu label (already translated)
    'description' => string, // optional; tooltip + accessible description
    'position'    => int,    // optional sort key (default 10); lower sorts earlier
)
```

Items with missing `id` or `title` are silently dropped — plugins can't accidentally create an unrouteable entry. Ties on `position` preserve registration order.

**Click wiring:** clicking a custom item fires the JS action `wp-desktop.arrange.custom-action` with payload `{ id }`. Subscribe via `wp.hooks.addAction()`:

```php
add_filter( 'wp_desktop_arrange_menu_items', function ( $items ) {
    $items[] = array(
        'id'          => 'diagonal',
        'title'       => __( 'Diagonal cascade', 'my-ext' ),
        'description' => __( 'Cascade windows along a 45° line.', 'my-ext' ),
        'position'    => 15,
    );
    return $items;
} );
```

```js
// In your shell-side script (enqueued with `wp-hooks` as a dependency):
wp.hooks.addAction(
    'wp-desktop.arrange.custom-action',
    'my-ext/diagonal',
    function ( payload ) {
        if ( payload.id !== 'diagonal' ) {
            return;
        }
        const windows = wp.desktop.windowManager.getAll();
        windows.forEach( ( w, i ) => w.move( i * 40, i * 40 ) );
    }
);
```

---

### `wp_desktop_portal_auto_enable` — Stable

When a user lands on `/wp-desktop/` without desktop mode enabled, the portal auto-enables it for them by default. Return `false` to require an explicit toggle instead.

```php
apply_filters( 'wp_desktop_portal_auto_enable', bool $auto_enable, int $user_id );
```

**Example:**

```php
add_filter( 'wp_desktop_portal_auto_enable', '__return_false' );
```

---

### `wp_desktop_admin_redirect_to_portal` — Stable

Governs the `admin_init` redirect from classic `/wp-admin/` URLs to `/wp-desktop/` for users with desktop mode on. Return `false` to keep the user on the classic URL even when they have the mode enabled (useful for support sessions).

```php
apply_filters( 'wp_desktop_admin_redirect_to_portal', bool $redirect, int $user_id );
```

---

## Planned (not yet fired)

The filters and actions below are **reserved names** documented for forward compatibility. They will land with the phase indicated. Do not register listeners in production code until the status flips to Stable.

### Window — Phase 3
```php
apply_filters( 'wp_desktop_window_args',           array $args, string $page );
apply_filters( 'wp_desktop_window_reuse',          bool  $reuse, string $page );
apply_filters( 'wp_desktop_window_excluded_pages', array $excluded );
```

### Taskbar — Phase 3
```php
apply_filters( 'wp_desktop_taskbar_items',    array  $items );
apply_filters( 'wp_desktop_taskbar_tray',     array  $tray );
apply_filters( 'wp_desktop_taskbar_position', string $position );
```

### Dock (extended) — Phase 3+
```php
apply_filters( 'wp_desktop_dock_position', string $position );   // 'left' | 'bottom'
apply_filters( 'wp_desktop_dock_style',    array  $style );      // icon size, gap, blur
```

### Desktop area — Phase 4+
```php
apply_filters( 'wp_desktop_wallpaper',    string $url,   string $color_scheme );
apply_filters( 'wp_desktop_widgets',      array  $widgets );
apply_filters( 'wp_desktop_context_menu', array  $menu_items );
apply_filters( 'wp_desktop_icons',        array  $icons );
apply_filters( 'wp_desktop_icon',         array  $icon_config, string $icon_id );
```

### Responsive — Phase 5–6
```php
apply_filters( 'wp_desktop_mode_type',           string $mode );   // 'desktop' | 'tablet' | 'mobile'
apply_filters( 'wp_desktop_mobile_grid_items',   array  $items );
apply_filters( 'wp_desktop_mobile_tab_bar',      array  $tabs );
apply_filters( 'wp_desktop_mobile_app_switcher', array  $cards );
apply_filters( 'wp_desktop_tablet_split_config', array  $config );
```

### Native windows — Phase 7
```php
apply_filters( 'wp_desktop_native_windows',       array $windows );
apply_filters( 'wp_desktop_native_window_config', array $window_config, string $window_id );
```

### Drag & Drop — Phase 8
```php
apply_filters( 'wp_desktop_drag_mime_types', array $mime_types );
apply_filters( 'wp_desktop_drag_payload',    array $payload, string $source_page, string $target_page );
apply_filters( 'wp_desktop_drop_accepts',    bool  $accepts, array $payload, string $target_page );
```

### Body classes — Stable (applied, filter planned)
```php
apply_filters( 'wp_desktop_body_classes', string $classes );
```
Currently the `wp-desktop-active` / `wp-desktop-chromeless` classes are added unfiltered via `admin_body_class`. A named filter is planned.

---

## See also

- [JavaScript Reference](./javascript-reference.md) — the event + postMessage side of the contract.
- [Examples](./examples/README.md) — full-plugin recipes.
