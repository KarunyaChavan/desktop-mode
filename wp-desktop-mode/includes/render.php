<?php
/**
 * Desktop Mode rendering.
 *
 * Handles body-class tagging, shell markup injection, asset enqueueing,
 * and the chromeless bridge script that lives inside iframed admin pages.
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/**
 * Adds body classes for desktop mode and chromeless iframes.
 *
 * The classes anchor all CSS in the shell and chromeless overrides
 * stylesheets — `.wp-desktop-active` hides classic chrome and reveals
 * the shell, `.wp-desktop-chromeless` reshapes the page inside iframes.
 *
 * @since 0.1.0
 *
 * @param string $classes Space-separated CSS class string.
 * @return string
 */
function wp_desktop_admin_body_classes( $classes ) {
	if ( wp_is_chromeless_request() ) {
		return ltrim( $classes . ' wp-desktop-chromeless' );
	}

	if ( wp_is_desktop_mode() ) {
		return ltrim( $classes . ' wp-desktop-active' );
	}

	return $classes;
}
add_filter( 'admin_body_class', 'wp_desktop_admin_body_classes' );

/**
 * Enqueues the desktop mode shell assets (CSS + JS) when desktop mode is active.
 *
 * Only loads the full desktop shell scripts and styles when the user has
 * desktop mode enabled and the request is not a chromeless iframe load.
 *
 * @since 0.1.0
 */
function wp_enqueue_desktop_mode_assets() {
	if ( ! is_admin() ) {
		return;
	}

	// Chromeless requests (iframes) need chromeless styles and overrides.
	if ( wp_is_chromeless_request() ) {
		wp_enqueue_style( 'wp-desktop' );
		wp_enqueue_style( 'wp-desktop-chromeless' );

		/**
		 * Fires when chromeless styles are enqueued inside a desktop mode iframe.
		 *
		 * Plugin and theme authors can hook here to enqueue their own CSS
		 * overrides for legacy pages rendered in chromeless mode. Use the
		 * `.wp-desktop-chromeless` body class to scope your rules.
		 *
		 * @since 0.1.0
		 */
		do_action( 'wp_desktop_chromeless_styles' );
		return;
	}

	if ( ! wp_is_desktop_mode() ) {
		return;
	}

	// CSS.
	wp_enqueue_style( 'wp-desktop' );
	wp_enqueue_style( 'wp-desktop-windows' );
	wp_enqueue_style( 'wp-desktop-dock' );

	// JS.
	wp_enqueue_script( 'wp-desktop' );

	// Pass configuration to JavaScript.
	global $title, $pagenow, $parent_file, $menu;

	$menu_icon = 'dashicons-admin-generic';
	if ( ! empty( $parent_file ) && ! empty( $menu ) ) {
		foreach ( $menu as $item ) {
			if ( ! empty( $item[2] ) && $item[2] === $parent_file && ! empty( $item[6] ) ) {
				$menu_icon = $item[6];
				break;
			}
		}
	}

	// Build dock items from the admin menu.
	$dock_items = wp_desktop_build_dock_items();

	/**
	 * Filters the desktop shell configuration passed to JavaScript.
	 *
	 * @since 0.1.0
	 *
	 * @param array $config {
	 *     Desktop shell configuration.
	 *
	 *     @type string $currentPage  The current admin page URL.
	 *     @type string $currentTitle The current page title.
	 *     @type string $currentIcon  Dashicon class for the current page.
	 *     @type string $adminUrl     The base admin URL.
	 *     @type string $colorScheme  The active admin color scheme.
	 *     @type array  $dockItems    Dock items derived from admin menu.
	 * }
	 */
	$config = apply_filters(
		'wp_desktop_shell_config',
		array(
			'currentPage'  => esc_url( admin_url( $pagenow ) . ( ! empty( $_GET ) ? '?' . http_build_query( $_GET ) : '' ) ),
			'currentTitle' => wp_strip_all_tags( $title ),
			'currentIcon'  => sanitize_html_class( $menu_icon ),
			'adminUrl'     => esc_url( admin_url() ),
			'colorScheme'  => sanitize_html_class( get_user_option( 'admin_color' ), 'modern' ),
			'dockItems'    => $dock_items,
		)
	);

	wp_localize_script( 'wp-desktop', 'wpDesktopConfig', $config );

	/**
	 * Fires when desktop mode assets are enqueued.
	 *
	 * @since 0.1.0
	 */
	do_action( 'wp_desktop_mode_init' );
}
add_action( 'admin_enqueue_scripts', 'wp_enqueue_desktop_mode_assets' );

/**
 * Injects the desktop shell markup into the admin page.
 *
 * Runs on `in_admin_header` at priority 5 so the shell renders right
 * after the classic admin bar but before the page content. The shell
 * floats above the classic layout via `position: fixed` in CSS; the
 * classic sidebar, body, and footer are hidden with `body.wp-desktop-active`
 * selectors.
 *
 * @since 0.1.0
 */
function wp_desktop_render_shell() {
	if ( wp_is_chromeless_request() || ! wp_is_desktop_mode() ) {
		return;
	}

	/**
	 * Fires right before the desktop shell markup is rendered.
	 *
	 * @since 0.1.0
	 */
	do_action( 'wp_desktop_shell_before' );
	?>
	<div id="wp-desktop-shell" class="wp-desktop-shell" role="application" aria-label="<?php esc_attr_e( 'Desktop shell', 'wp-desktop-mode' ); ?>">
		<div class="wp-desktop-shell__body">
			<nav id="wp-desktop-dock" class="wp-desktop-dock" role="toolbar" aria-label="<?php esc_attr_e( 'Admin navigation', 'wp-desktop-mode' ); ?>"></nav>
			<div id="wp-desktop-area" class="wp-desktop-area wp-desktop-area--with-dock"></div>
		</div>
	</div>
	<?php
	/**
	 * Fires right after the desktop shell markup has rendered.
	 *
	 * @since 0.1.0
	 */
	do_action( 'wp_desktop_shell_after' );
}
add_action( 'in_admin_header', 'wp_desktop_render_shell', 5 );

/**
 * Outputs the chromeless screen-meta bridge script.
 *
 * Detects Screen Options / Help panels in the iframed page and relays
 * their availability + open/closed state to the parent desktop shell
 * via postMessage. The parent shell uses this to render matching
 * buttons in the window title bar.
 *
 * @since 0.1.0
 */
function wp_desktop_chromeless_bridge_script() {
	if ( ! wp_is_chromeless_request() ) {
		return;
	}

	/**
	 * Fires after chromeless content in desktop mode.
	 *
	 * @since 0.1.0
	 *
	 * @param string $hook_suffix The current admin page hook suffix.
	 */
	do_action( 'wp_desktop_chromeless_after', isset( $GLOBALS['hook_suffix'] ) ? $GLOBALS['hook_suffix'] : '' );
	?>
	<script>
	( function() {
		if ( ! window.parent || window.parent === window ) {
			return;
		}
		var links = document.getElementById( 'screen-meta-links' );
		if ( ! links ) {
			return;
		}
		var screenOptionsBtn = document.getElementById( 'show-settings-link' );
		var helpBtn = document.getElementById( 'contextual-help-link' );
		var panels = [];
		if ( screenOptionsBtn ) {
			panels.push( 'screen-options' );
		}
		if ( helpBtn ) {
			panels.push( 'help' );
		}
		if ( panels.length === 0 ) {
			return;
		}

		var origin = window.location.origin;

		window.parent.postMessage( {
			type: 'wp-desktop-screen-meta',
			panels: panels
		}, origin );

		function getOpenPanel() {
			if ( screenOptionsBtn && screenOptionsBtn.getAttribute( 'aria-expanded' ) === 'true' ) {
				return 'screen-options';
			}
			if ( helpBtn && helpBtn.getAttribute( 'aria-expanded' ) === 'true' ) {
				return 'help';
			}
			return null;
		}

		function reportState() {
			window.parent.postMessage( {
				type: 'wp-desktop-screen-meta-state',
				open: getOpenPanel()
			}, origin );
		}

		reportState();

		var observer = new MutationObserver( reportState );
		if ( screenOptionsBtn ) {
			observer.observe( screenOptionsBtn, { attributes: true, attributeFilter: [ 'aria-expanded' ] } );
		}
		if ( helpBtn ) {
			observer.observe( helpBtn, { attributes: true, attributeFilter: [ 'aria-expanded' ] } );
		}

		// WP's close() animates and shares #screen-meta between both panels,
		// so racing two animated clicks hides the panel that just opened.
		// Jump the other panel to its closed end state synchronously instead.
		function forceClose( button ) {
			if ( ! button || button.getAttribute( 'aria-expanded' ) !== 'true' ) {
				return;
			}
			var panelId = button.getAttribute( 'aria-controls' );
			var panel = panelId ? document.getElementById( panelId ) : null;
			if ( ! panel ) {
				return;
			}
			if ( window.jQuery ) {
				window.jQuery( panel ).stop( true, false );
			}
			panel.style.display = 'none';
			panel.classList.add( 'hidden' );
			if ( panel.parentNode instanceof HTMLElement ) {
				panel.parentNode.style.display = 'none';
			}
			button.classList.remove( 'screen-meta-active' );
			button.setAttribute( 'aria-expanded', 'false' );
			var toggles = document.querySelectorAll( '.screen-meta-toggle' );
			for ( var i = 0; i < toggles.length; i++ ) {
				toggles[ i ].style.visibility = '';
			}
		}

		window.addEventListener( 'message', function( e ) {
			if ( e.origin !== origin ) {
				return;
			}
			if ( ! e.data || e.data.type !== 'wp-desktop-toggle-panel' ) {
				return;
			}
			var target = null;
			if ( e.data.panel === 'screen-options' && screenOptionsBtn ) {
				target = screenOptionsBtn;
			} else if ( e.data.panel === 'help' && helpBtn ) {
				target = helpBtn;
			}
			if ( ! target ) {
				return;
			}
			if ( target.getAttribute( 'aria-expanded' ) !== 'true' ) {
				var other = target === screenOptionsBtn ? helpBtn : screenOptionsBtn;
				forceClose( other );
			}
			target.click();
		} );
	} )();
	</script>
	<?php
}
add_action( 'admin_footer', 'wp_desktop_chromeless_bridge_script' );
