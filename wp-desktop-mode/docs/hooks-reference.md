# Hooks Reference

Every PHP action and filter the plugin fires, with signatures, examples, and **implementation status**.

- **Stable** — shipping today, keep working across the current major version.
- **Experimental** — shipping, but signature may change.
- **Planned** — reserved name, not yet fired. Do not subscribe in production.

If something you need isn't here, open an issue. New hooks are welcome — our rule of thumb: *if a function decides something, wrap it in a filter; if it does something, fire an action around it.*

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
