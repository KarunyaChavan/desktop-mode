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
function wpdm_register_assets() {
	$version = WPDM_VERSION;
	$suffix  = defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ? '' : '.min';

	// Styles.
	wp_register_style(
		'wp-desktop-variables',
		WPDM_URL . 'assets/css/variables.css',
		array(),
		$version
	);
	wp_register_style(
		'wp-desktop',
		WPDM_URL . 'assets/css/desktop.css',
		array( 'wp-desktop-variables' ),
		$version
	);
	wp_register_style(
		'wp-desktop-windows',
		WPDM_URL . 'assets/css/windows.css',
		array( 'wp-desktop-variables', 'dashicons' ),
		$version
	);
	wp_register_style(
		'wp-desktop-dock',
		WPDM_URL . 'assets/css/dock.css',
		array( 'wp-desktop-variables', 'dashicons' ),
		$version
	);
	wp_register_style(
		'wp-desktop-chromeless',
		WPDM_URL . 'assets/css/chromeless.css',
		array( 'wp-desktop' ),
		$version
	);

	// Scripts.
	//
	// `wp-hooks` is a hard dependency: the shell exposes a WordPress-style
	// filter/action API (`window.wp.hooks`) to third-party plugins. Core
	// only pre-enqueues `wp-hooks` when a Gutenberg-adjacent dep pulls it
	// in, so we can't rely on transitive loads — list it explicitly.
	wp_register_script(
		'wp-desktop',
		WPDM_URL . 'assets/js/desktop' . $suffix . '.js',
		array( 'wp-hooks' ),
		$version,
		true
	);
}
add_action( 'init', 'wpdm_register_assets' );
