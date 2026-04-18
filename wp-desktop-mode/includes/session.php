<?php
/**
 * Desktop Mode — Session Persistence.
 *
 * Persists each user's open desktop windows — URLs, positions, sizes,
 * states, and which window was focused — to user meta so a session can
 * be restored across page loads and, via the `/wp-desktop` portal,
 * across devices. Cross-device viewport adaptation (a window that sat
 * in the far-right corner of a 3440px ultrawide landing sanely on a
 * 1280px laptop) happens client-side on restore.
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/** User meta key holding the serialized desktop session. */
const WPDM_SESSION_META_KEY = 'wp_desktop_session';

/** Hard cap on persisted windows — guards against runaway meta size. */
const WPDM_SESSION_MAX_WINDOWS = 32;

/** Allowed values for a window's state field. */
const WPDM_SESSION_STATES = array( 'normal', 'minimized', 'maximized', 'fullscreen' );

/**
 * Returns the default empty session shape.
 *
 * @since 0.4.0
 *
 * @return array{windows: array, focused: string, updated: int}
 */
function wpdm_empty_session() {
	return array(
		'windows' => array(),
		'focused' => '',
		'updated' => 0,
	);
}

/**
 * Retrieves the saved desktop session for a user.
 *
 * Always returns a well-shaped array so callers don't have to defend
 * against corrupt or partial meta.
 *
 * @since 0.4.0
 *
 * @param int $user_id The user ID.
 * @return array{windows: array, focused: string, updated: int}
 */
function wpdm_get_session( $user_id ) {
	$user_id = (int) $user_id;
	if ( $user_id <= 0 ) {
		return wpdm_empty_session();
	}

	$raw = get_user_meta( $user_id, WPDM_SESSION_META_KEY, true );
	if ( ! is_array( $raw ) ) {
		return wpdm_empty_session();
	}

	return array(
		'windows' => isset( $raw['windows'] ) && is_array( $raw['windows'] ) ? array_values( $raw['windows'] ) : array(),
		'focused' => isset( $raw['focused'] ) ? (string) $raw['focused'] : '',
		'updated' => isset( $raw['updated'] ) ? (int) $raw['updated'] : 0,
	);
}

/**
 * Persists a sanitized desktop session to user meta.
 *
 * @since 0.4.0
 *
 * @param int   $user_id The user ID.
 * @param array $session Raw session payload (will be sanitized).
 * @return bool True on success, false on failure.
 */
function wpdm_save_session( $user_id, $session ) {
	$user_id = (int) $user_id;
	if ( $user_id <= 0 ) {
		return false;
	}

	$clean = wpdm_sanitize_session( $session );

	return false !== update_user_meta( $user_id, WPDM_SESSION_META_KEY, $clean );
}

/**
 * Clears a user's saved desktop session.
 *
 * @since 0.4.0
 *
 * @param int $user_id The user ID.
 * @return bool True on success.
 */
function wpdm_clear_session( $user_id ) {
	$user_id = (int) $user_id;
	if ( $user_id <= 0 ) {
		return false;
	}
	return (bool) delete_user_meta( $user_id, WPDM_SESSION_META_KEY );
}

/**
 * Sanitizes a session payload before persistence.
 *
 * Rejects windows whose `url` isn't a same-origin admin URL, clamps
 * geometry to sane integer ranges, and normalizes the state enum.
 * Windows beyond {@see WPDM_SESSION_MAX_WINDOWS} are dropped.
 *
 * @since 0.4.0
 *
 * @param mixed $session Raw session data from the client.
 * @return array{windows: array, focused: string, updated: int}
 */
function wpdm_sanitize_session( $session ) {
	$clean = wpdm_empty_session();
	$clean['updated'] = time();

	if ( ! is_array( $session ) ) {
		return $clean;
	}

	if ( isset( $session['focused'] ) && is_string( $session['focused'] ) ) {
		$clean['focused'] = sanitize_key( $session['focused'] );
	}

	if ( isset( $session['windows'] ) && is_array( $session['windows'] ) ) {
		$admin_url = admin_url();
		foreach ( $session['windows'] as $win ) {
			if ( ! is_array( $win ) ) {
				continue;
			}

			$id = isset( $win['id'] ) ? sanitize_key( (string) $win['id'] ) : '';
			if ( '' === $id ) {
				continue;
			}

			$url = isset( $win['url'] ) ? esc_url_raw( (string) $win['url'] ) : '';
			// Only allow URLs that land inside our own wp-admin — both
			// a safety net against storing arbitrary origins in user meta
			// and a guarantee the restore path won't try to iframe a
			// cross-origin page.
			if ( '' === $url || 0 !== strpos( $url, $admin_url ) ) {
				continue;
			}
			// Strip transient/routing flags before storage. The chromeless
			// `wp_desktop` flag is an iframe-only concern and must never
			// end up in a top-level URL (e.g., the portal's entry URL);
			// the portal and classic flags only live on a single request.
			$url = remove_query_arg(
				array( 'wp_desktop', WPDM_PORTAL_FLAG, WPDM_CLASSIC_FLAG ),
				$url
			);

			$state = isset( $win['state'] ) ? (string) $win['state'] : 'normal';
			if ( ! in_array( $state, WPDM_SESSION_STATES, true ) ) {
				$state = 'normal';
			}

			$clean['windows'][] = array(
				'id'     => $id,
				'url'    => $url,
				'title'  => isset( $win['title'] ) ? wp_strip_all_tags( (string) $win['title'] ) : '',
				'icon'   => isset( $win['icon'] ) ? sanitize_html_class( (string) $win['icon'] ) : 'dashicons-admin-generic',
				'state'  => $state,
				'x'      => wpdm_sanitize_session_dimension( $win['x'] ?? 0, -10000, 10000 ),
				'y'      => wpdm_sanitize_session_dimension( $win['y'] ?? 0, -10000, 10000 ),
				'width'  => wpdm_sanitize_session_dimension( $win['width'] ?? 800, 0, 20000 ),
				'height' => wpdm_sanitize_session_dimension( $win['height'] ?? 600, 0, 20000 ),
			);

			if ( count( $clean['windows'] ) >= WPDM_SESSION_MAX_WINDOWS ) {
				break;
			}
		}
	}

	return $clean;
}

/**
 * Clamps a numeric dimension into a sane range.
 *
 * Geometry coming from the client is untrusted. A malicious or buggy
 * payload could try to stash multi-million-pixel values in meta or
 * negative values that break the shell. This enforces integer type
 * and min/max bounds.
 *
 * @since 0.4.0
 *
 * @param mixed $value The raw value.
 * @param int   $min   Minimum allowed value.
 * @param int   $max   Maximum allowed value.
 * @return int The clamped integer.
 */
function wpdm_sanitize_session_dimension( $value, $min, $max ) {
	$value = (int) $value;
	if ( $value < $min ) {
		return $min;
	}
	if ( $value > $max ) {
		return $max;
	}
	return $value;
}

/**
 * Registers the REST routes used by the desktop shell to load and save
 * the current user's session.
 *
 * @since 0.4.0
 */
function wpdm_register_session_rest_routes() {
	register_rest_route(
		'wp-desktop/v1',
		'/session',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'wpdm_rest_get_session',
				'permission_callback' => 'wpdm_rest_session_permission',
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'wpdm_rest_save_session',
				'permission_callback' => 'wpdm_rest_session_permission',
				'args'                => array(
					'session' => array(
						'required' => true,
						'type'     => 'object',
					),
				),
			),
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => 'wpdm_rest_clear_session',
				'permission_callback' => 'wpdm_rest_session_permission',
			),
		)
	);
}
add_action( 'rest_api_init', 'wpdm_register_session_rest_routes' );

/**
 * Permission gate for the session REST routes: logged-in users with
 * basic admin-read capability.
 *
 * @since 0.4.0
 *
 * @return bool
 */
function wpdm_rest_session_permission() {
	return is_user_logged_in() && current_user_can( 'read' );
}

/**
 * GET /wp-desktop/v1/session — returns the caller's session.
 *
 * @since 0.4.0
 *
 * @return WP_REST_Response
 */
function wpdm_rest_get_session() {
	return rest_ensure_response( wpdm_get_session( get_current_user_id() ) );
}

/**
 * POST /wp-desktop/v1/session — replaces the caller's session.
 *
 * @since 0.4.0
 *
 * @param WP_REST_Request $request The REST request.
 * @return WP_REST_Response The stored session (after sanitization).
 */
function wpdm_rest_save_session( WP_REST_Request $request ) {
	$user_id = get_current_user_id();
	$payload = $request->get_param( 'session' );
	wpdm_save_session( $user_id, $payload );
	return rest_ensure_response( wpdm_get_session( $user_id ) );
}

/**
 * DELETE /wp-desktop/v1/session — clears the caller's session.
 *
 * @since 0.4.0
 *
 * @return WP_REST_Response
 */
function wpdm_rest_clear_session() {
	wpdm_clear_session( get_current_user_id() );
	return rest_ensure_response( wpdm_empty_session() );
}
