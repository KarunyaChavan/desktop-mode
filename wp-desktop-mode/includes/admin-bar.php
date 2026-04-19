<?php
/**
 * Desktop Mode admin-bar toggle.
 *
 * Adds the "Switch to Desktop Mode" button to the admin bar's top-right
 * area and wires its click handler to the save-desktop-mode AJAX endpoint.
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/**
 * Adds the desktop mode toggle to the admin bar.
 *
 * Allows users to switch between classic admin and desktop mode,
 * which renders admin screens in draggable, resizable windows.
 *
 * @since 0.1.0
 *
 * @param WP_Admin_Bar $wp_admin_bar The WP_Admin_Bar instance.
 */
function wpdm_admin_bar_toggle( $wp_admin_bar ) {
	if ( ! is_admin() || ! is_user_logged_in() ) {
		return;
	}

	// "Active" means "the user is *currently viewing* desktop mode",
	// not "the preference is enabled in user meta." These diverge on
	// requests carrying the per-request classic override
	// (`?wp_desktop_classic=1`) — the user's meta may be '1' but the
	// page they're looking at right now is classic admin. If we went
	// by meta alone, the toggle here would read "Switch to Classic
	// Admin" on a page that's already classic, and the user's first
	// click would disable desktop mode entirely (redirecting to
	// classic admin) instead of taking them back into the shell.
	// The second click would then re-enable it — a two-click trap.
	$is_active = wpdm_is_enabled() && ! wpdm_is_classic_request();
	$label     = $is_active
		? __( 'Switch to Classic Admin', 'wp-desktop-mode' )
		: __( 'Switch to Desktop Mode', 'wp-desktop-mode' );

	$wp_admin_bar->add_node(
		array(
			'parent' => 'top-secondary',
			'id'     => 'desktop-mode-toggle',
			'title'  => '<span class="ab-icon dashicons dashicons-desktop" aria-hidden="true"></span>'
				. '<span class="ab-label">' . $label . '</span>',
			'href'   => '#',
			'meta'   => array(
				'class'    => $is_active ? 'desktop-mode-active' : '',
				'tabindex' => 0,
				'title'    => $label,
			),
		)
	);

	// Layout menu — only surfaced when the user is actually viewing
	// the desktop shell (the actions don't make sense in classic
	// admin, which has no windows to arrange). Parent renders as a
	// dashicon with a hover-opened submenu; each child is routed to
	// `wp.desktop.windowManager.*` by the inline JS.
	if ( $is_active ) {
		$wp_admin_bar->add_node(
			array(
				'parent' => 'top-secondary',
				'id'     => 'desktop-layout-menu',
				'title'  => '<span class="ab-icon dashicons dashicons-grid-view" aria-hidden="true"></span>'
					. '<span class="ab-label">' . esc_html__( 'Arrange', 'wp-desktop-mode' ) . '</span>',
				'href'   => '#',
				'meta'   => array(
					'title'    => __( 'Arrange windows', 'wp-desktop-mode' ),
					'tabindex' => 0,
				),
			)
		);
		$wp_admin_bar->add_node(
			array(
				'parent' => 'desktop-layout-menu',
				'id'     => 'desktop-layout-cascade',
				'title'  => esc_html__( 'Cascade', 'wp-desktop-mode' ),
				'href'   => '#',
				'meta'   => array(
					'class' => 'wpdm-layout-action',
					'title' => __( 'Lay all windows out from top-left, offset so every title bar stays visible.', 'wp-desktop-mode' ),
				),
			)
		);
		$wp_admin_bar->add_node(
			array(
				'parent' => 'desktop-layout-menu',
				'id'     => 'desktop-layout-overview',
				'title'  => esc_html__( 'Overview', 'wp-desktop-mode' ),
				'href'   => '#',
				'meta'   => array(
					'class' => 'wpdm-layout-action',
					'title' => __( 'Zoom out to see every window at once. Click one to focus it.', 'wp-desktop-mode' ),
				),
			)
		);
	}
}
add_action( 'admin_bar_menu', 'wpdm_admin_bar_toggle', 190 );

/**
 * Enqueues the inline CSS and JS for the desktop mode toggle.
 *
 * Uses `admin-bar` as the carrier handle so the inline assets always ship
 * with the admin bar itself — no matter which admin screen is showing.
 *
 * @since 0.1.0
 */
function wpdm_enqueue_toggle_assets() {
	if ( ! is_admin() || ! is_user_logged_in() ) {
		return;
	}

	$css = '
		#wp-admin-bar-desktop-mode-toggle .ab-icon.dashicons,
		#wp-admin-bar-desktop-layout-menu .ab-icon.dashicons {
			font: normal 20px/1 dashicons;
			-webkit-font-smoothing: antialiased;
			-moz-osx-font-smoothing: grayscale;
		}
		#wp-admin-bar-desktop-mode-toggle .ab-icon.dashicons::before {
			content: "\f472";
			top: 2px;
			position: relative;
		}
		#wp-admin-bar-desktop-layout-menu .ab-icon.dashicons::before {
			/* dashicons-grid-view */
			content: "\f509";
			top: 2px;
			position: relative;
		}
		#wp-admin-bar-desktop-mode-toggle.desktop-mode-active .ab-icon.dashicons::before {
			color: #72aee6;
		}
		@media screen and (max-width: 782px) {
			#wp-admin-bar-desktop-mode-toggle .ab-label,
			#wp-admin-bar-desktop-layout-menu .ab-label {
				display: none;
			}
		}
	';
	wp_add_inline_style( 'admin-bar', $css );

	// All PHP→JS values are emitted as JSON literals (never interpolated
	// raw into the script body) so special characters, quotes, and
	// unexpected shapes can't break the parser or be exploited.
	// `active` must match the visual state shown on the toggle above —
	// i.e. "currently viewing desktop mode." Using `wpdm_is_enabled()`
	// alone would misclassify a classic-override request (meta = '1',
	// URL carrying `wp_desktop_classic=1`) as active, causing the
	// click handler to send `enabled=0` when the user actually wants
	// to return to the shell.
	$config = wp_json_encode(
		array(
			'nonce'      => wp_create_nonce( 'save-desktop-mode' ),
			'active'     => wpdm_is_enabled() && ! wpdm_is_classic_request(),
			'classicUrl' => esc_url_raw( admin_url() ),
			'portalUrl'  => esc_url_raw( wpdm_portal_url() ),
			'ajaxUrl'    => esc_url_raw( admin_url( 'admin-ajax.php' ) ),
		)
	);

	$js = <<<JS
( function() {
	var toggle = document.getElementById( 'wp-admin-bar-desktop-mode-toggle' );
	if ( ! toggle ) {
		return;
	}
	var cfg = {$config};
	toggle.addEventListener( 'click', function( e ) {
		e.preventDefault();
		var isActive = !! cfg.active;
		var newValue = isActive ? '' : '1';
		// Fallback targets if the server response is missing a `redirect`
		// field (shouldn't happen, but keep the click functional either
		// way). Disabling -> classic admin (NOT the portal, which would
		// auto-re-enable); enabling -> portal URL so the shell takes over.
		var fallback = isActive ? cfg.classicUrl : cfg.portalUrl;
		// The toggle lives in an admin bar that may be rendered either in
		// the top window (classic) or — today it's suppressed in iframes,
		// but a plugin could surface it — inside a chromeless iframe. In
		// either case we want the ENTIRE browser tab to navigate, so we
		// hit `window.top` and fall back to `window` if cross-origin
		// security blocks access.
		function navigate( url ) {
			try {
				window.top.location.href = url;
			} catch ( err ) {
				window.location.href = url;
			}
		}
		var body = new URLSearchParams();
		body.set( 'action', 'save-desktop-mode' );
		body.set( 'nonce', cfg.nonce );
		body.set( 'enabled', newValue );
		var xhr = new XMLHttpRequest();
		xhr.open( 'POST', cfg.ajaxUrl, true );
		xhr.setRequestHeader( 'Content-Type', 'application/x-www-form-urlencoded' );
		xhr.onload = function() {
			if ( xhr.status !== 200 ) {
				return;
			}
			var target = fallback;
			try {
				var resp = JSON.parse( xhr.responseText );
				if ( resp && resp.success && resp.data && resp.data.redirect ) {
					target = resp.data.redirect;
				}
			} catch ( parseErr ) {}
			navigate( target );
		};
		xhr.send( body.toString() );
	} );

	// Layout menu — each child item calls a WindowManager method on
	// the public shell API. We bind one delegated click listener on
	// the parent submenu so adding more layouts in the future (tile,
	// full-width, etc.) is a matter of adding nodes in PHP, not new
	// JS. `href=#` is set server-side; we preventDefault + intercept.
	var layoutMenu = document.getElementById( 'wp-admin-bar-desktop-layout-menu' );
	if ( layoutMenu ) {
		layoutMenu.addEventListener( 'click', function( e ) {
			var link = e.target && e.target.closest ? e.target.closest( '.wpdm-layout-action > .ab-item, .wpdm-layout-action' ) : null;
			if ( ! link ) return;
			e.preventDefault();
			var id = link.closest( '[id^="wp-admin-bar-desktop-layout-"]' );
			if ( ! id ) return;
			var wm = window.wp && window.wp.desktop && window.wp.desktop.windowManager;
			if ( ! wm ) return;
			if ( id.id === 'wp-admin-bar-desktop-layout-cascade' && typeof wm.cascade === 'function' ) {
				wm.cascade();
			} else if ( id.id === 'wp-admin-bar-desktop-layout-overview' && typeof wm.enterOverview === 'function' ) {
				wm.enterOverview();
			}
		} );
	}
} )();
JS;
	wp_add_inline_script( 'admin-bar', $js );
}
add_action( 'admin_enqueue_scripts', 'wpdm_enqueue_toggle_assets' );
