<?php
/**
 * Desktop Mode asset registration.
 *
 * Registers all desktop-mode CSS and JS handles with WordPress so they can
 * be enqueued from anywhere in the plugin (or by third parties).
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers the desktop mode CSS and JS handles.
 *
 * @since 0.1.0
 */
function wp_desktop_register_assets() {
	$version = WP_DESKTOP_MODE_VERSION;
	$suffix  = defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ? '' : '.min';

	// Styles.
	wp_register_style(
		'wp-desktop-variables',
		WP_DESKTOP_MODE_URL . 'assets/css/variables.css',
		array(),
		$version
	);
	wp_register_style(
		'wp-desktop',
		WP_DESKTOP_MODE_URL . 'assets/css/desktop.css',
		array( 'wp-desktop-variables' ),
		$version
	);
	wp_register_style(
		'wp-desktop-windows',
		WP_DESKTOP_MODE_URL . 'assets/css/windows.css',
		array( 'wp-desktop-variables', 'dashicons' ),
		$version
	);
	wp_register_style(
		'wp-desktop-dock',
		WP_DESKTOP_MODE_URL . 'assets/css/dock.css',
		array( 'wp-desktop-variables', 'dashicons' ),
		$version
	);
	wp_register_style(
		'wp-desktop-chromeless',
		WP_DESKTOP_MODE_URL . 'assets/css/chromeless.css',
		array( 'wp-desktop' ),
		$version
	);

	// Scripts.
	wp_register_script(
		'wp-desktop',
		WP_DESKTOP_MODE_URL . 'assets/js/desktop' . $suffix . '.js',
		array(),
		$version,
		true
	);
}
add_action( 'init', 'wp_desktop_register_assets' );
