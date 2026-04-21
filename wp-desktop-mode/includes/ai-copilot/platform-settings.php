<?php
/**
 * Desktop Mode — AI Copilot platform-wide settings.
 *
 * Stores site-level AI configuration in `wp_options` so every user and
 * every background job (hooks, cron, WP-CLI) can use the same API key
 * without requiring each individual user to configure one.
 *
 * Priority when resolving which key to use:
 *   1. Per-user key (user meta) — personal override, takes precedence.
 *   2. Platform key (wp_options) — site-wide fallback.
 *
 * The REST endpoint is gated behind `manage_options` so only admins
 * can read or update the platform key.
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/** wp_options key for the platform-wide AI settings. */
const WPDM_AI_PLATFORM_OPTION = 'wp_desktop_ai_platform';

// ---------------------------------------------------------------------------
// Get / save
// ---------------------------------------------------------------------------

/**
 * Returns the platform AI settings, with defaults merged in.
 *
 * @since 0.14.0
 *
 * @return array{ enabled: bool, provider: string, apiKey: string }
 */
function wpdm_ai_get_platform_settings() {
	$defaults = array(
		'enabled'  => false,
		'provider' => 'openai',
		'apiKey'   => '',
	);

	$raw = get_option( WPDM_AI_PLATFORM_OPTION, array() );
	if ( ! is_array( $raw ) ) {
		return $defaults;
	}

	return array(
		'enabled'  => ! empty( $raw['enabled'] ),
		'provider' => ( isset( $raw['provider'] ) && in_array( $raw['provider'], WPDM_OS_SETTINGS_AI_PROVIDERS, true ) )
			? (string) $raw['provider']
			: $defaults['provider'],
		'apiKey'   => ( isset( $raw['apiKey'] ) && is_string( $raw['apiKey'] ) )
			? $raw['apiKey']
			: $defaults['apiKey'],
	);
}

/**
 * Sanitizes and saves platform AI settings to `wp_options`.
 *
 * @since 0.14.0
 *
 * @param mixed $raw Incoming settings payload (from REST or direct call).
 * @return bool True on success.
 */
function wpdm_ai_save_platform_settings( $raw ) {
	if ( ! is_array( $raw ) ) {
		return false;
	}

	$clean = array(
		'enabled'  => ! empty( $raw['enabled'] ),
		'provider' => ( isset( $raw['provider'] ) && in_array( $raw['provider'], WPDM_OS_SETTINGS_AI_PROVIDERS, true ) )
			? (string) $raw['provider']
			: 'openai',
		'apiKey'   => ( isset( $raw['apiKey'] ) && is_string( $raw['apiKey'] ) )
			? substr( sanitize_text_field( $raw['apiKey'] ), 0, 512 )
			: '',
	);

	return update_option( WPDM_AI_PLATFORM_OPTION, $clean, false );
}

// ---------------------------------------------------------------------------
// REST endpoint
// ---------------------------------------------------------------------------

/**
 * Registers the platform settings REST route.
 *
 * @since 0.14.0
 */
function wpdm_register_ai_platform_settings_rest_route() {
	register_rest_route(
		'wp-desktop/v1',
		'/ai/platform-settings',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'wpdm_rest_get_ai_platform_settings',
				'permission_callback' => 'wpdm_rest_ai_platform_permission',
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'wpdm_rest_save_ai_platform_settings',
				'permission_callback' => 'wpdm_rest_ai_platform_permission',
				'args'                => array(
					'settings' => array(
						'required' => true,
						'type'     => 'object',
					),
				),
			),
		)
	);
}
add_action( 'rest_api_init', 'wpdm_register_ai_platform_settings_rest_route' );

/**
 * Permission: administrators only.
 *
 * @since 0.14.0
 *
 * @return bool|WP_Error
 */
function wpdm_rest_ai_platform_permission() {
	if ( ! is_user_logged_in() || ! current_user_can( 'manage_options' ) ) {
		return new WP_Error(
			'wpdm_ai_forbidden',
			'Only administrators can manage platform AI settings.',
			array( 'status' => 403 )
		);
	}
	return true;
}

/**
 * GET /wp-desktop/v1/ai/platform-settings
 *
 * @since 0.14.0
 *
 * @return WP_REST_Response
 */
function wpdm_rest_get_ai_platform_settings() {
	return rest_ensure_response( wpdm_ai_get_platform_settings() );
}

/**
 * POST /wp-desktop/v1/ai/platform-settings
 *
 * @since 0.14.0
 *
 * @param WP_REST_Request $request
 * @return WP_REST_Response
 */
function wpdm_rest_save_ai_platform_settings( WP_REST_Request $request ) {
	$payload = $request->get_param( 'settings' );
	wpdm_ai_save_platform_settings( $payload );
	return rest_ensure_response( wpdm_ai_get_platform_settings() );
}
