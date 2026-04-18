<?php
/**
 * Desktop Mode — `/wp-desktop` Portal Entry Point.
 *
 * Registers `/wp-desktop` as a shareable URL that behaves like the
 * front door of the desktop UI:
 *   1. Logged-out users are bounced through `wp-login.php` with a
 *      redirect back to `/wp-desktop/`.
 *   2. Logged-in users with basic admin-read capability have the
 *      `wp_desktop_mode` user-meta toggle auto-enabled on first visit,
 *      then are forwarded into `wp-admin` at whichever window was
 *      last focused in their saved session (or the dashboard as
 *      fallback).
 *
 * The URL is served virtually (no rewrite rules, no `.htaccess`
 * surgery) by intercepting `parse_request` before WordPress routes the
 * URL to 404. This keeps the plugin drop-in.
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/** The URL path that triggers the portal handler. */
const WPDM_PORTAL_PATH = 'wp-desktop';

/** Query var the admin shell reads to know it was entered via the portal. */
const WPDM_PORTAL_FLAG = 'wp_desktop_portal';

/**
 * Query var set by the window-title-bar "Detach" action. Tells the
 * admin_init redirect to skip portal forwarding for this request so the
 * user can view the page as classic wp-admin in a new tab even when
 * desktop mode is globally enabled for their account.
 */
const WPDM_CLASSIC_FLAG = 'wp_desktop_classic';

/**
 * Returns the canonical portal URL, e.g. `https://example.com/wp-desktop/`.
 *
 * @since 0.4.0
 *
 * @return string
 */
function wpdm_portal_url() {
	return home_url( '/' . WPDM_PORTAL_PATH . '/' );
}

/**
 * Intercepts requests to `/wp-desktop` and forwards them into the admin.
 *
 * Hooks on `parse_request` — early enough to pre-empt 404 handling but
 * late enough that `is_user_logged_in()` is reliable.
 *
 * @since 0.4.0
 *
 * @param WP $wp Current WordPress environment instance.
 */
function wpdm_handle_portal_request( $wp ) {
	unset( $wp );

	if ( ! wpdm_is_portal_request() ) {
		return;
	}

	// Logged-out: bounce through login, returning to the portal URL.
	if ( ! is_user_logged_in() ) {
		wp_safe_redirect( wp_login_url( wpdm_portal_url() ) );
		exit;
	}

	// Require basic admin-read capability so subscribers of sites that
	// blocked `read` from admin don't land in a broken window.
	if ( ! current_user_can( 'read' ) ) {
		wp_die(
			esc_html__( 'Sorry, you are not allowed to access the WordPress desktop.', 'wp-desktop-mode' ),
			'',
			array( 'response' => 403 )
		);
	}

	$user_id = get_current_user_id();

	/**
	 * Filters whether visiting the `/wp-desktop` portal should auto-enable
	 * desktop mode for the current user.
	 *
	 * Default: true — the portal is an explicit opt-in action, so flipping
	 * the user meta mirrors the intent of visiting the URL.
	 *
	 * @since 0.4.0
	 *
	 * @param bool $auto_enable Whether to auto-enable desktop mode.
	 * @param int  $user_id     The current user's ID.
	 */
	$auto_enable = apply_filters( 'wp_desktop_portal_auto_enable', true, $user_id );

	if ( $auto_enable && '1' !== get_user_meta( $user_id, 'wp_desktop_mode', true ) ) {
		update_user_meta( $user_id, 'wp_desktop_mode', '1' );
	}

	// Pick the landing page: the last-focused window from the saved
	// session, or the dashboard if no session / no focused window.
	$target = wpdm_portal_entry_url( $user_id );

	// Flag the forward so the shell can stamp the address bar back to
	// /wp-desktop/ via history.replaceState once it has loaded.
	$target = add_query_arg( WPDM_PORTAL_FLAG, '1', $target );

	wp_safe_redirect( $target );
	exit;
}
add_action( 'parse_request', 'wpdm_handle_portal_request' );

/**
 * Detects whether the current request is for the portal URL.
 *
 * Strips any query string and trailing slash and compares against
 * `/wp-desktop` relative to the site's home path.
 *
 * @since 0.4.0
 *
 * @return bool
 */
function wpdm_is_portal_request() {
	if ( empty( $_SERVER['REQUEST_URI'] ) ) {
		return false;
	}

	$uri  = wp_unslash( $_SERVER['REQUEST_URI'] );
	$path = wp_parse_url( $uri, PHP_URL_PATH );
	if ( ! is_string( $path ) ) {
		return false;
	}

	$home_path = wp_parse_url( home_url( '/' ), PHP_URL_PATH );
	$home_path = is_string( $home_path ) ? rtrim( $home_path, '/' ) : '';

	$expected = $home_path . '/' . WPDM_PORTAL_PATH;
	$path     = '/' . ltrim( rtrim( $path, '/' ), '/' );

	return $path === $expected;
}

/**
 * Forwards plain `/wp-admin/...` requests to the `/wp-desktop/` portal
 * when the current user has desktop mode enabled.
 *
 * Why: when desktop mode is on, `/wp-desktop/` is meant to be the one
 * canonical address. A user who bookmarks `/wp-admin/plugins.php` or
 * follows an old admin link should still land in the shell, not in
 * vanilla admin with the shell glued over the top. Running through the
 * portal unifies the address bar and honors the saved session's focused
 * window.
 *
 * Narrowly scoped to bail on every automated or sub-request entry point
 * — AJAX, REST, cron, admin-post.php, non-GET methods — so the hook
 * can't corrupt a form submission or break an API call.
 *
 * Disable via the `wp_desktop_admin_redirect_to_portal` filter (return
 * false). Passthrough kicks in automatically when the current request
 * is chromeless or already carries the portal flag.
 *
 * @since 0.4.0
 */
function wpdm_redirect_plain_admin_to_portal() {
	if ( ! wpdm_is_enabled() ) {
		return;
	}
	if ( wpdm_is_chromeless_request() ) {
		return;
	}
	if ( wp_doing_ajax() || wp_doing_cron() ) {
		return;
	}
	if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
		return;
	}
	if ( ! empty( $_SERVER['REQUEST_METHOD'] ) && 'GET' !== strtoupper( (string) $_SERVER['REQUEST_METHOD'] ) ) {
		return;
	}

	// The portal handler adds this flag after it forwards into admin.
	// Bailing here keeps us out of an infinite redirect loop.
	if ( ! empty( $_GET[ WPDM_PORTAL_FLAG ] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return;
	}

	// The "Detach to new tab" button tags its URL with this flag so the
	// user can view one admin page classically without disabling desktop
	// mode account-wide. Only affects the single request — subsequent
	// navigations inside the tab lose the flag and follow normal rules.
	if ( ! empty( $_GET[ WPDM_CLASSIC_FLAG ] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return;
	}

	// admin-post.php and admin-ajax.php handle form submissions and JSON
	// endpoints; redirecting them would break the call.
	global $pagenow;
	if ( in_array( $pagenow, array( 'admin-post.php', 'admin-ajax.php' ), true ) ) {
		return;
	}

	/**
	 * Filters whether plain admin URLs should redirect to the portal
	 * when desktop mode is active.
	 *
	 * @since 0.4.0
	 *
	 * @param bool $redirect Whether to redirect. Default true.
	 * @param int  $user_id  The current user's ID.
	 */
	$redirect = apply_filters( 'wp_desktop_admin_redirect_to_portal', true, get_current_user_id() );
	if ( ! $redirect ) {
		return;
	}

	wp_safe_redirect( wpdm_portal_url() );
	exit;
}
add_action( 'admin_init', 'wpdm_redirect_plain_admin_to_portal' );

/**
 * Resolves the admin URL the portal should forward to for a given user.
 *
 * Looks up the user's session and returns the URL of the window flagged
 * as `focused`. If the session is empty, has no focused window, or the
 * focused window's URL isn't same-origin admin, falls back to the
 * dashboard.
 *
 * The portal navigates the TOP window, not an iframe, so any chromeless
 * `wp_desktop=1` flag baked into the stored URL is stripped — a leftover
 * flag would land the user in a standalone chromeless page (no admin
 * bar, no toggle, no way out) instead of the shell.
 *
 * @since 0.4.0
 *
 * @param int $user_id The user whose session to consult.
 * @return string The admin URL to redirect to.
 */
function wpdm_portal_entry_url( $user_id ) {
	$session   = wpdm_get_session( $user_id );
	$admin_url = admin_url();
	$fallback  = admin_url( 'index.php' );

	if ( empty( $session['focused'] ) || empty( $session['windows'] ) ) {
		return $fallback;
	}

	foreach ( $session['windows'] as $win ) {
		if ( ! isset( $win['id'], $win['url'] ) ) {
			continue;
		}
		if ( $win['id'] !== $session['focused'] ) {
			continue;
		}
		if ( 0 !== strpos( $win['url'], $admin_url ) ) {
			return $fallback;
		}
		return remove_query_arg( array( 'wp_desktop', WPDM_PORTAL_FLAG ), $win['url'] );
	}

	return $fallback;
}
