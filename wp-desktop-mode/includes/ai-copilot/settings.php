<?php
/**
 * Desktop Mode — AI Copilot settings helpers.
 *
 * Thin wrappers around `wpdm_get_os_settings()` scoped to the AI block.
 * All other copilot modules call these instead of reading user meta
 * directly so the key path is one place to change.
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/**
 * Returns the AI settings block for a given user.
 *
 * @since 0.14.0
 *
 * @param int $user_id
 * @return array{ enabled: bool, provider: string, apiKey: string }
 */
function wpdm_ai_get_settings( $user_id ) {
	$os = wpdm_get_os_settings( (int) $user_id );
	$defaults = array(
		'enabled'  => false,
		'provider' => 'openai',
		'apiKey'   => '',
	);
	$ai = isset( $os['ai'] ) && is_array( $os['ai'] ) ? $os['ai'] : array();
	return array_merge( $defaults, $ai );
}

/**
 * Whether AI processing is active — checks platform settings first,
 * then falls back to the user's personal settings.
 *
 * Priority:
 *   1. Platform-wide settings (wp_options) — enabled by any admin.
 *   2. Per-user settings (user meta) — personal override.
 *
 * @since 0.14.0
 *
 * @param int $user_id
 * @return bool
 */
function wpdm_ai_is_enabled( $user_id ) {
	// 1. Platform key — works for any user, including anonymous contexts.
	$platform = wpdm_ai_get_platform_settings();
	if ( ! empty( $platform['enabled'] ) && ! empty( $platform['apiKey'] ) ) {
		return true;
	}

	// 2. Per-user override.
	$ai = wpdm_ai_get_settings( (int) $user_id );
	if ( empty( $ai['enabled'] ) ) {
		return false;
	}
	if ( 'openai' !== $ai['provider'] ) {
		return false;
	}
	if ( empty( $ai['apiKey'] ) || ! is_string( $ai['apiKey'] ) ) {
		return false;
	}

	return true;
}

/**
 * Returns the API key to use for a given user.
 *
 * Per-user key takes precedence (personal override); falls back to the
 * platform-wide key so anonymous contexts (cron, WP-CLI, anonymous
 * comments) always have a key available when the admin has configured one.
 *
 * @since 0.14.0
 *
 * @param int $user_id
 * @return string API key, or empty string if none configured.
 */
function wpdm_ai_get_api_key( $user_id ) {
	// Per-user override takes precedence.
	$ai = wpdm_ai_get_settings( (int) $user_id );
	if ( ! empty( $ai['apiKey'] ) && is_string( $ai['apiKey'] ) ) {
		return $ai['apiKey'];
	}

	// Fall back to platform key.
	$platform = wpdm_ai_get_platform_settings();
	return ! empty( $platform['apiKey'] ) ? (string) $platform['apiKey'] : '';
}
