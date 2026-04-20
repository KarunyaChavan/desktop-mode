<?php
/**
 * Desktop Mode — PHP helpers for plugin authors.
 *
 * Two companion helpers live here:
 *
 *   - {@see wp_desktop_component()} prints a `<wpd-*>` tag with
 *     safely-escaped attributes. The intent is explicit (we're
 *     rendering a kit component, not arbitrary HTML) and the
 *     escape discipline is automatic.
 *
 *   - {@see wp_register_desktop_window()} collapses the
 *     boilerplate for declaring a PHP-owned native window: one
 *     call emits the `<template>` the shell clones, enqueues
 *     the plugin's JS render bundle, and wires a dock-or-taskbar
 *     tile on window-ready. Plugins write the template callback
 *     + the render callback on the JS side — the plumbing is ours.
 *
 * @package WPDesktopMode
 * @since   0.10.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * Output a `<wpd-*>` component with safely escaped attributes.
 *
 * ```php
 * wp_desktop_component( 'wpd-button', array(
 *     'variant'    => 'primary',
 *     'data-op'    => 'add',
 *     'aria-label' => __( 'Add', 'my-plugin' ),
 * ), '+' );
 * ```
 *
 * Attribute values flow through `esc_attr()` — no HTML injection
 * surface. Content is passed through verbatim; callers that want
 * to render user text should pre-escape with `esc_html()` /
 * `wp_kses()` themselves.
 *
 * Boolean-style attributes (present with a `true` value or an
 * empty string) render as bare attributes (`disabled`,
 * `fill-cell`) — matches the HTML5 boolean-attribute convention
 * every `<wpd-*>` follows.
 *
 * @since 0.10.0
 *
 * @param string                $tag     Tag name, e.g. `wpd-button`.
 *                                       Whitelisted to the `wpd-*` prefix
 *                                       to prevent the helper being
 *                                       misused as a generic HTML emitter.
 * @param array<string,mixed>   $attrs   Attribute key/value pairs.
 * @param string                $content Inner HTML. Pass pre-escaped.
 */
function wp_desktop_component( $tag, $attrs = array(), $content = '' ) {
	$tag = strtolower( (string) $tag );
	if ( ! preg_match( '/^wpd-[a-z][a-z0-9-]*$/', $tag ) ) {
		// Fail loud in debug so a typo surfaces immediately; silently
		// drop the output in production so a plugin with a bad tag
		// doesn't blow up the page.
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			_doing_it_wrong(
				__FUNCTION__,
				sprintf(
					/* translators: %s: the attempted tag name. */
					esc_html__( 'wp_desktop_component() only accepts tags with the wpd- prefix; got "%s".', 'wp-desktop-mode' ),
					esc_html( $tag )
				),
				'0.10.0'
			);
		}
		return;
	}

	$attr_parts = array();
	foreach ( (array) $attrs as $key => $value ) {
		$key = (string) $key;
		if ( ! preg_match( '/^[A-Za-z_][A-Za-z0-9_:.-]*$/', $key ) ) {
			// Silently skip attribute names that don't match the HTML5
			// name grammar. Same debug-vs-production split as the tag.
			continue;
		}
		if ( false === $value || null === $value ) {
			continue;
		}
		if ( true === $value || '' === $value ) {
			// Boolean attribute — render bare.
			$attr_parts[] = esc_attr( $key );
			continue;
		}
		$attr_parts[] = sprintf(
			'%s="%s"',
			esc_attr( $key ),
			esc_attr( (string) $value )
		);
	}

	$attr_str = $attr_parts ? ' ' . implode( ' ', $attr_parts ) : '';

	printf(
		'<%1$s%2$s>%3$s</%1$s>',
		// `$tag` is validated above against the wpd- allowlist; safe.
		$tag, // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		// `$attr_str` is pre-escaped via esc_attr() for each component.
		$attr_str, // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		// `$content` is the caller's responsibility to pre-escape.
		$content // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	);
}

/**
 * Register a PHP-owned native desktop window with one call.
 *
 * Under the hood this:
 *
 *   1. Captures the $args and stores them on a module-level
 *      registry so the relevant admin_footer + enqueue hooks fire
 *      only for the current user's desktop-mode shell.
 *   2. On `admin_footer` (shell-side only), emits
 *      `<template id="wpdm-native-window-<id>">` wrapping the
 *      output of the `template` callback. Each registered window
 *      gets its own template element.
 *   3. On `admin_enqueue_scripts` (shell-side), enqueues the
 *      caller's `script` handle — the script is expected to
 *      register a JS render callback that reads the cloned
 *      template and paints the body.
 *   4. Passes a localized config blob to the script
 *      (`wpDesktopNativeWindow_<id>`) carrying the window's
 *      `id`, `title`, `icon`, dimensions, and `placement`. The
 *      script then calls `wp.desktop.registerSystemTile()` +
 *      `wp.desktop.registerWindow()` to wire up the dock tile
 *      and the open-on-click behaviour.
 *
 * Plugins write the template callback + the render callback on
 * the JS side; everything else is shell plumbing. Capability gate
 * honours WP admin conventions: any `capabilities` entries must
 * ALL match for the window to register.
 *
 * Note on scope: the shell doesn't auto-open windows server-side
 * — `registerWindow` declares availability, not presence. Users
 * click the registered tile (or your plugin calls
 * `wp.desktop.windowManager.open()` programmatically) to surface
 * the window.
 *
 * @since 0.10.0
 *
 * @param string $id   Doubles as window id + dock-tile id. Must
 *                     be a kebab-case-ish slug.
 * @param array  $args {
 *     Window registration options.
 *
 *     @type string   $title        Window + tooltip title. Required.
 *     @type string   $icon         Dashicons class or URL. Required.
 *     @type callable $template     Called between `<template>` open
 *                                  + close tags on `admin_footer`.
 *                                  Receives no args; echoes HTML.
 *     @type string   $script       Registered script handle that
 *                                  owns the JS render callback.
 *                                  Required.
 *     @type int      $width        Initial width (px). Default 520.
 *     @type int      $height       Initial height (px). Default 400.
 *     @type int      $min_width    Minimum width (px). Default 280.
 *     @type int      $min_height   Minimum height (px). Default 220.
 *     @type string   $placement    'dock' | 'taskbar' | 'none'.
 *                                  Default 'taskbar'. 'none' skips
 *                                  the tile (plugin owns its own
 *                                  UI surface).
 *     @type string[] $capabilities User capabilities that gate the
 *                                  registration. ANY miss drops
 *                                  the window silently.
 *     @type bool|string $autofocus Passed verbatim to
 *                                  `NativeWindowDef.autofocus`.
 * }
 * @return bool True if the window was accepted into the registry.
 */
function wp_register_desktop_window( $id, $args = array() ) {
	$id = sanitize_key( (string) $id );
	if ( '' === $id ) {
		return false;
	}

	$defaults = array(
		'title'        => '',
		'icon'         => 'dashicons-admin-generic',
		'template'     => null,
		'script'       => '',
		'width'        => 520,
		'height'       => 400,
		'min_width'    => 280,
		'min_height'   => 220,
		'placement'    => 'taskbar',
		'capabilities' => array(),
		'autofocus'    => false,
	);
	$args = wp_parse_args( $args, $defaults );

	// Capability gate — ALL listed caps must match. Fail closed.
	foreach ( (array) $args['capabilities'] as $cap ) {
		if ( ! current_user_can( (string) $cap ) ) {
			return false;
		}
	}

	// Required fields.
	if ( '' === (string) $args['title'] || '' === (string) $args['script'] ) {
		return false;
	}
	if ( ! is_callable( $args['template'] ) ) {
		return false;
	}

	$placement = in_array( $args['placement'], array( 'dock', 'taskbar', 'none' ), true )
		? $args['placement']
		: 'taskbar';

	wpdm_native_window_registry( $id, array(
		'id'         => $id,
		'title'      => (string) $args['title'],
		'icon'       => (string) $args['icon'],
		'template'   => $args['template'],
		'script'     => (string) $args['script'],
		'width'      => (int) $args['width'],
		'height'     => (int) $args['height'],
		'min_width'  => (int) $args['min_width'],
		'min_height' => (int) $args['min_height'],
		'placement'  => $placement,
		'autofocus'  => $args['autofocus'],
	) );

	return true;
}

/**
 * Internal module-level registry for native windows registered
 * via {@see wp_register_desktop_window()}. Passing a second
 * argument stores the entry; passing only the id returns the
 * stored value (or null). Kept small and side-effect-free so
 * tests can introspect.
 *
 * @since 0.10.0
 * @internal
 *
 * @param string     $id    Window id.
 * @param array|null $entry Entry to store, or null to just read.
 * @return array|null Either the stored entry or the full registry
 *                    (when id is empty).
 */
function wpdm_native_window_registry( $id = '', $entry = null ) {
	static $store = array();

	if ( '' === (string) $id ) {
		return $store;
	}
	if ( null !== $entry ) {
		$store[ $id ] = $entry;
	}
	return isset( $store[ $id ] ) ? $store[ $id ] : null;
}

/**
 * Register a server-side desktop widget. Symmetric to
 * {@see wp_register_desktop_window()} for the right-column widget
 * layer: plugin declares the widget's metadata + script handle in
 * PHP; shell syncs its registry from the live payload so
 * activation / deactivation map to picker add / remove without a
 * browser reload.
 *
 * The mount callback still lives in JS — not serializable across
 * the wire. Plugins register it on
 * `window.wpDesktopWidgets[ <id> ]` as a `(container, ctx) =>
 * teardown` function. The shell reads that global once the
 * declared script loads and wraps it into a WidgetDef.
 *
 * Example:
 *
 * ```php
 * wp_register_desktop_widget( 'myplugin/stats', array(
 *     'label'          => __( 'Stats', 'my-plugin' ),
 *     'description'    => __( 'Live analytics rollup', 'my-plugin' ),
 *     'icon'           => 'dashicons-chart-bar',
 *     'script'         => 'my-plugin-desktop-widgets',
 *     'movable'        => true,
 *     'resizable'      => true,
 *     'default_width'  => 280,
 *     'default_height' => 180,
 * ) );
 * ```
 *
 * ```js
 * // Inside my-plugin-desktop-widgets.js:
 * window.wpDesktopWidgets = window.wpDesktopWidgets || {};
 * window.wpDesktopWidgets[ 'myplugin/stats' ] = function ( container, ctx ) {
 *     container.append( buildDOM() );
 *     return function teardown() { };
 * };
 * ```
 *
 * @since 0.10.0
 *
 * @param string $id   Widget id. Must match the key the JS side
 *                     uses on `window.wpDesktopWidgets[ … ]`.
 * @param array  $args {
 *     @type string   $label          Human-readable picker label. Required.
 *     @type string   $description    Picker subtitle. Default empty.
 *     @type string   $icon           Dashicons class for the picker. Required.
 *     @type string   $script         Enqueued script handle that owns
 *                                    the mount callback. Required.
 *     @type bool     $movable        Allow drag out of the right column.
 *     @type bool     $resizable      Allow user resize.
 *     @type int      $min_width
 *     @type int      $min_height
 *     @type int      $max_width
 *     @type int      $max_height
 *     @type int      $default_width  First-mount floating width.
 *     @type int      $default_height First-mount floating height.
 *     @type string[] $capabilities   Gate: ALL caps must match.
 * }
 * @return bool True when accepted into the registry.
 */
function wp_register_desktop_widget( $id, $args = array() ) {
	$id = (string) $id;
	if ( '' === $id ) {
		return false;
	}

	$defaults = array(
		'label'          => '',
		'description'    => '',
		'icon'           => 'dashicons-admin-generic',
		'script'         => '',
		'movable'        => false,
		'resizable'      => false,
		'min_width'      => 0,
		'min_height'     => 0,
		'max_width'      => 0,
		'max_height'     => 0,
		'default_width'  => 0,
		'default_height' => 0,
		'capabilities'   => array(),
	);
	$args = wp_parse_args( $args, $defaults );

	foreach ( (array) $args['capabilities'] as $cap ) {
		if ( ! current_user_can( (string) $cap ) ) {
			return false;
		}
	}

	// Required fields. The script handle isn't strictly required —
	// a plugin could register a widget whose mount callback is
	// declared on the shell page's own JS (edge case; still valid).
	if ( '' === (string) $args['label'] ) {
		return false;
	}

	wpdm_desktop_widget_registry( $id, array(
		'id'             => $id,
		'label'          => (string) $args['label'],
		'description'    => (string) $args['description'],
		'icon'           => (string) $args['icon'],
		'script'         => (string) $args['script'],
		'movable'        => (bool) $args['movable'],
		'resizable'      => (bool) $args['resizable'],
		'min_width'      => (int) $args['min_width'],
		'min_height'     => (int) $args['min_height'],
		'max_width'      => (int) $args['max_width'],
		'max_height'     => (int) $args['max_height'],
		'default_width'  => (int) $args['default_width'],
		'default_height' => (int) $args['default_height'],
	) );
	return true;
}

/**
 * Internal module-level registry for widgets registered via
 * {@see wp_register_desktop_widget()}. Same pattern as
 * {@see wpdm_native_window_registry()}.
 *
 * @since 0.10.0
 * @internal
 */
function wpdm_desktop_widget_registry( $id = '', $entry = null ) {
	static $store = array();

	if ( '' === (string) $id ) {
		return $store;
	}
	if ( null !== $entry ) {
		$store[ $id ] = $entry;
	}
	return isset( $store[ $id ] ) ? $store[ $id ] : null;
}

/**
 * Build the widget list for the shell payload. Runs through
 * every entry registered via `wp_register_desktop_widget()` and
 * attaches the resolved script URL (`wp_scripts()` lookup) so
 * the shell can dynamically inject the script on mid-session
 * plugin activation.
 *
 * @since 0.10.0
 *
 * @return array[]
 */
function wpdm_build_desktop_widgets_payload() {
	$registry = wpdm_desktop_widget_registry();
	if ( ! is_array( $registry ) || empty( $registry ) ) {
		return array();
	}

	$out = array();
	foreach ( $registry as $entry ) {
		$script_url = wpdm_resolve_script_url( $entry['script'] );

		$out[] = array(
			'id'            => $entry['id'],
			'label'         => $entry['label'],
			'description'   => $entry['description'],
			'icon'          => $entry['icon'],
			'movable'       => $entry['movable'],
			'resizable'     => $entry['resizable'],
			'minWidth'      => $entry['min_width'],
			'minHeight'     => $entry['min_height'],
			'maxWidth'      => $entry['max_width'],
			'maxHeight'     => $entry['max_height'],
			'defaultWidth'  => $entry['default_width'],
			'defaultHeight' => $entry['default_height'],
			'scriptUrl'     => $script_url,
			'scriptHandle'  => $entry['script'],
		);
	}
	return $out;
}

/**
 * Enqueue plugin-registered widget scripts on the shell page so
 * widgets active at boot time have their mount callbacks
 * available without any dynamic-load roundtrip.
 *
 * @since 0.10.0
 */
function wpdm_enqueue_desktop_widget_scripts() {
	if ( ! wpdm_is_enabled() || wpdm_is_chromeless_request() || wpdm_is_classic_request() ) {
		return;
	}
	$registry = wpdm_desktop_widget_registry();
	if ( ! is_array( $registry ) ) {
		return;
	}
	foreach ( $registry as $entry ) {
		if ( ! empty( $entry['script'] ) ) {
			wp_enqueue_script( $entry['script'] );
		}
	}
}
add_action( 'admin_enqueue_scripts', 'wpdm_enqueue_desktop_widget_scripts', 20 );

/**
 * Enqueue every registered native window's script when the shell
 * is active. Runs on `admin_enqueue_scripts` alongside the main
 * shell enqueue so ordering (shell → plugin scripts) is
 * deterministic.
 *
 * @since 0.10.0
 */
function wpdm_enqueue_native_window_scripts() {
	if ( ! wpdm_is_enabled() || wpdm_is_chromeless_request() || wpdm_is_classic_request() ) {
		return;
	}
	$registry = wpdm_native_window_registry();
	if ( ! is_array( $registry ) ) {
		return;
	}
	foreach ( $registry as $entry ) {
		if ( empty( $entry['script'] ) ) {
			continue;
		}
		wp_enqueue_script( $entry['script'] );
		// Localize the config the JS side reads to register itself.
		wp_localize_script(
			$entry['script'],
			'wpDesktopNativeWindow_' . str_replace( '-', '_', $entry['id'] ),
			array(
				'id'        => $entry['id'],
				'title'     => $entry['title'],
				'icon'      => $entry['icon'],
				'width'     => $entry['width'],
				'height'    => $entry['height'],
				'minWidth'  => $entry['min_width'],
				'minHeight' => $entry['min_height'],
				'placement' => $entry['placement'],
				'autofocus' => $entry['autofocus'],
				'templateId' => 'wpdm-native-window-' . $entry['id'],
			)
		);
	}
}
add_action( 'admin_enqueue_scripts', 'wpdm_enqueue_native_window_scripts', 20 );

/**
 * Emit a `<template>` tag for every registered native window on
 * `admin_footer` when the shell is active. The JS side resolves
 * these via `document.getElementById( `wpdm-native-window-${id}` )`
 * and clones them into each opened window's body.
 *
 * @since 0.10.0
 */
function wpdm_render_native_window_templates() {
	if ( ! wpdm_is_enabled() || wpdm_is_chromeless_request() || wpdm_is_classic_request() ) {
		return;
	}
	$registry = wpdm_native_window_registry();
	if ( ! is_array( $registry ) ) {
		return;
	}
	foreach ( $registry as $entry ) {
		if ( ! is_callable( $entry['template'] ) ) {
			continue;
		}
		printf(
			'<template id="wpdm-native-window-%s">',
			esc_attr( $entry['id'] )
		);
		// Template callback is plugin-authored; it emits its own
		// markup and is responsible for escaping content. No
		// automatic wrap — keeps `<template>` literal.
		call_user_func( $entry['template'] );
		echo '</template>';
	}
}
add_action( 'admin_footer', 'wpdm_render_native_window_templates', 20 );
