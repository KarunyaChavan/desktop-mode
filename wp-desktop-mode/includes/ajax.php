<?php
/**
 * Desktop Mode AJAX endpoints.
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/**
 * Handles saving the user's desktop mode preference via AJAX.
 *
 * @since 0.1.0
 */
function wp_ajax_save_desktop_mode() {
	check_ajax_referer( 'save-desktop-mode', 'nonce' );

	/**
	 * Filters whether desktop mode is available for this user.
	 *
	 * Plugins can disable desktop mode for certain roles, capabilities, or conditions.
	 *
	 * @since 0.1.0
	 *
	 * @param bool $enabled Whether desktop mode is enabled. Default true.
	 * @param int  $user_id The current user ID.
	 */
	$allowed = apply_filters( 'wp_desktop_mode_enabled', true, get_current_user_id() );
	if ( ! $allowed ) {
		wp_send_json_error( 'desktop_mode_disabled' );
	}

	$enabled = ! empty( $_POST['enabled'] ) && '1' === $_POST['enabled'] ? '1' : '';

	update_user_meta( get_current_user_id(), 'wp_desktop_mode', $enabled );

	wp_send_json_success( array( 'enabled' => $enabled ) );
}
add_action( 'wp_ajax_save-desktop-mode', 'wp_ajax_save_desktop_mode' );
