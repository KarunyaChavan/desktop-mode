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
function wp_admin_bar_desktop_mode_toggle( $wp_admin_bar ) {
	if ( ! is_admin() || ! is_user_logged_in() ) {
		return;
	}

	$is_active = wp_is_desktop_mode();
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
add_action( 'admin_bar_menu', 'wp_admin_bar_desktop_mode_toggle', 190 );

/**
 * Enqueues the inline CSS and JS for the desktop mode toggle.
 *
 * Uses `admin-bar` as the carrier handle so the inline assets always ship
 * with the admin bar itself — no matter which admin screen is showing.
 *
 * @since 0.1.0
 */
function wp_enqueue_desktop_mode_toggle_assets() {
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

	$nonce  = wp_create_nonce( 'save-desktop-mode' );
	$active = wp_is_desktop_mode() ? 'true' : 'false';

	$js = <<<JS
( function() {
	var toggle = document.getElementById( 'wp-admin-bar-desktop-mode-toggle' );
	if ( ! toggle ) {
		return;
	}
	toggle.addEventListener( 'click', function( e ) {
		e.preventDefault();
		var isActive = {$active};
		var newValue = isActive ? '' : '1';
		var xhr = new XMLHttpRequest();
		xhr.open( 'POST', ajaxurl, true );
		xhr.setRequestHeader( 'Content-Type', 'application/x-www-form-urlencoded' );
		xhr.onload = function() {
			if ( xhr.status === 200 ) {
				window.location.reload();
			}
		};
		xhr.send( 'action=save-desktop-mode&nonce={$nonce}&enabled=' + newValue );
	} );
} )();
JS;
	wp_add_inline_script( 'admin-bar', $js );
}
add_action( 'admin_enqueue_scripts', 'wp_enqueue_desktop_mode_toggle_assets' );
