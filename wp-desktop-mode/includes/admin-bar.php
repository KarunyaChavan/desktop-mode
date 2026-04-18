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

	$is_active = wpdm_is_enabled();
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
		#wp-admin-bar-desktop-mode-toggle .ab-icon.dashicons {
			font: normal 20px/1 dashicons;
			-webkit-font-smoothing: antialiased;
			-moz-osx-font-smoothing: grayscale;
		}
		#wp-admin-bar-desktop-mode-toggle .ab-icon.dashicons::before {
			content: "\f472";
			top: 2px;
			position: relative;
		}
		#wp-admin-bar-desktop-mode-toggle.desktop-mode-active .ab-icon.dashicons::before {
			color: #72aee6;
		}
		@media screen and (max-width: 782px) {
			#wp-admin-bar-desktop-mode-toggle .ab-label {
				display: none;
			}
		}
	';
	wp_add_inline_style( 'admin-bar', $css );

	// All PHP→JS values are emitted as JSON literals (never interpolated
	// raw into the script body) so special characters, quotes, and
	// unexpected shapes can't break the parser or be exploited.
	$config = wp_json_encode(
		array(
			'nonce'      => wp_create_nonce( 'save-desktop-mode' ),
			'active'     => wpdm_is_enabled(),
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
} )();
JS;
	wp_add_inline_script( 'admin-bar', $js );
}
add_action( 'admin_enqueue_scripts', 'wpdm_enqueue_toggle_assets' );
