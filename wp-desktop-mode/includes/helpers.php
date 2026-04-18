<?php
/**
 * Desktop Mode helper functions.
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/**
 * Checks whether the current user has desktop mode enabled.
 *
 * @since 0.1.0
 *
 * @return bool True if the current user has desktop mode active.
 */
function wpdm_is_enabled() {
	if ( ! is_user_logged_in() ) {
		return false;
	}

	return '1' === get_user_meta( get_current_user_id(), 'wp_desktop_mode', true );
}

/**
 * Disables the admin bar on chromeless (iframe) requests.
 *
 * Hooked on the `show_admin_bar` filter so the front-end bar path also
 * sees a false return. In admin, `is_admin_bar_showing()` short-circuits
 * to true for any is_admin() request regardless of this filter, so the
 * actual render is stopped by `wpdm_chromeless_suppress_admin_bar`
 * below; this filter is kept for completeness + tests.
 *
 * @since 0.1.0
 *
 * @param bool $show Whether the admin bar should be shown.
 * @return bool
 */
function wpdm_chromeless_hide_admin_bar( $show ) {
	if ( wpdm_is_chromeless_request() ) {
		return false;
	}
	return $show;
}
add_filter( 'show_admin_bar', 'wpdm_chromeless_hide_admin_bar' );

/**
 * Suppresses the admin bar render inside chromeless iframes.
 *
 * `is_admin_bar_showing()` unconditionally returns true in admin context,
 * so the `show_admin_bar` filter alone can't stop `wp_admin_bar_render()`
 * from firing on `in_admin_header`. We detach the render action instead
 * and let chromeless.css hide the `wp-toolbar` padding on `<html>`.
 *
 * @since 0.1.0
 */
function wpdm_chromeless_suppress_admin_bar() {
	if ( wpdm_is_chromeless_request() ) {
		remove_action( 'in_admin_header', 'wp_admin_bar_render', 0 );
		remove_action( 'wp_body_open', 'wp_admin_bar_render', 0 );
	}
}
add_action( 'admin_init', 'wpdm_chromeless_suppress_admin_bar' );

/**
 * Preserves the `wp_desktop` flag through admin redirects.
 *
 * A chromeless iframe can be navigated away from chromeless mode by any
 * redirect that drops the query string — `wp_redirect( admin_url( 'edit.php' ) )`
 * after saving a classic-editor post is the canonical example. The client-side
 * form interceptor handles the outgoing request, but the server-built redirect
 * URL is what the browser follows. Re-append the flag here so the landing page
 * stays chromeless and the window doesn't "break out" into a nested admin.
 *
 * Scope is intentionally narrow: only same-site admin URLs are touched, and
 * only when the current request is itself chromeless. Anything else passes
 * through unchanged.
 *
 * @since 0.1.0
 *
 * @param string $location The redirect URL.
 * @return string The redirect URL, with `wp_desktop=1` appended when applicable.
 */
function wpdm_chromeless_preserve_redirect( $location ) {
	if ( empty( $location ) || ! wpdm_is_chromeless_request() ) {
		return $location;
	}

	// Only rewrite redirects that land inside wp-admin.
	if ( false === strpos( $location, '/wp-admin/' ) ) {
		return $location;
	}

	// Don't double-append if the URL already carries the flag.
	if ( false !== strpos( $location, 'wp_desktop=' ) ) {
		return $location;
	}

	return add_query_arg( 'wp_desktop', '1', $location );
}
add_filter( 'wp_redirect', 'wpdm_chromeless_preserve_redirect', 999 );

/**
 * Preserves the `wp_desktop_classic` flag through admin redirects.
 *
 * The detached-tab workflow depends on the classic flag living on every
 * same-tab navigation — otherwise a `wp_redirect()` after saving a post
 * (for instance) would drop it and the very next page would fall back
 * into the desktop shell. The JS interceptor stamps the flag onto every
 * outbound link and form, but it can't touch server-built redirect URLs.
 *
 * Scope mirrors the chromeless preserver: only same-site wp-admin
 * targets, only when the current request is itself a classic-override
 * request, and the flag is never appended twice.
 *
 * @since 0.4.0
 *
 * @param string $location The redirect URL.
 * @return string The redirect URL, with `wp_desktop_classic=1` appended when applicable.
 */
function wpdm_classic_preserve_redirect( $location ) {
	if ( empty( $location ) || ! wpdm_is_classic_request() ) {
		return $location;
	}

	if ( false === strpos( $location, '/wp-admin/' ) ) {
		return $location;
	}

	if ( false !== strpos( $location, WPDM_CLASSIC_FLAG . '=' ) ) {
		return $location;
	}

	return add_query_arg( WPDM_CLASSIC_FLAG, '1', $location );
}
add_filter( 'wp_redirect', 'wpdm_classic_preserve_redirect', 999 );

/**
 * Checks whether the current request is a chromeless request.
 *
 * Chromeless requests are admin pages loaded inside desktop mode
 * windows (iframes). They render only the page content without
 * the admin shell (sidebar, admin bar, footer).
 *
 * @since 0.1.0
 *
 * @return bool True if this is a chromeless (iframe) request.
 */
function wpdm_is_chromeless_request() {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only request flag, no state change.
	if ( empty( $_GET['wp_desktop'] ) || '1' !== wp_unslash( $_GET['wp_desktop'] ) ) {
		return false;
	}

	// Only allow chromeless mode if the user actually has desktop mode enabled.
	// This prevents stripping admin chrome via a bare ?wp_desktop=1 parameter.
	return wpdm_is_enabled();
}

/**
 * Checks whether the current request carries the "classic override" flag.
 *
 * The window-chrome "Detach" action opens an admin page in a new browser tab
 * with `?wp_desktop_classic=1` so the user can view that one page outside the
 * desktop shell without disabling desktop mode account-wide. The flag is a
 * per-request override: `wpdm_is_enabled()` still returns true (the user's
 * preference hasn't changed), but the shell, shell assets, and body class are
 * skipped for this request so the classic admin renders normally.
 *
 * Keep this separate from `wpdm_is_enabled()` so the admin-bar toggle in
 * the detached tab correctly reflects the account state — letting the user
 * disable desktop mode entirely from the tab if they want to.
 *
 * @since 0.4.0
 *
 * @return bool True if the request carries `?wp_desktop_classic=1`.
 */
function wpdm_is_classic_request() {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only request flag.
	if ( empty( $_GET[ WPDM_CLASSIC_FLAG ] ) ) {
		return false;
	}
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only request flag.
	return '1' === (string) wp_unslash( $_GET[ WPDM_CLASSIC_FLAG ] );
}

/**
 * Builds the dock items array from the admin menu data.
 *
 * Iterates through the global $menu and $submenu arrays, filters out
 * separators and items the current user can't access, and returns a
 * clean array of dock items ready for JSON serialization.
 *
 * @since 0.1.0
 *
 * @return array[] Array of dock item arrays, each containing:
 *                 id, title, icon, url, badge, submenu.
 */
function wpdm_build_dock_items() {
	global $menu, $submenu;

	if ( empty( $menu ) ) {
		return array();
	}

	$items = array();

	foreach ( $menu as $item ) {
		// Skip separators.
		if ( ! empty( $item[4] ) && false !== strpos( $item[4], 'wp-menu-separator' ) ) {
			continue;
		}

		// Skip items without a slug.
		if ( empty( $item[2] ) ) {
			continue;
		}

		// Check capability.
		if ( ! empty( $item[1] ) && ! current_user_can( $item[1] ) ) {
			continue;
		}

		// Extract the clean title: strip badge spans first, then strip remaining tags.
		$raw_title = preg_replace( '/<span[^>]*>.*?<\/span>/s', '', $item[0] );
		$title     = trim( wp_strip_all_tags( $raw_title ) );

		// Extract badge count from the title HTML.
		$badge = 0;
		if ( preg_match( '/class="(?:update-plugins|awaiting-mod)[^"]*count-(\d+)"/', $item[0], $matches ) ) {
			$badge = (int) $matches[1];
		}

		// Determine the icon. Menu entries can set `$item[6]` to anything
		// — a dashicon class, a remote URL, a data:URI, 'none', or 'div'
		// — so normalize before we serialize it for the shell JS.
		$icon = wpdm_sanitize_dock_icon( $item[6] ?? '' );

		// Build the full URL for the menu item.
		$url = wpdm_menu_item_url( $item[2] );

		// Build submenu items.
		$sub_items = array();
		if ( ! empty( $submenu[ $item[2] ] ) ) {
			foreach ( $submenu[ $item[2] ] as $sub_item ) {
				if ( ! empty( $sub_item[1] ) && ! current_user_can( $sub_item[1] ) ) {
					continue;
				}
				// Skip items with hide-if classes.
				if ( ! empty( $sub_item[4] ) && false !== strpos( $sub_item[4], 'hide-if-no-customize' ) ) {
					continue;
				}
				$sub_raw_title = preg_replace( '/<span[^>]*>.*?<\/span>/s', '', $sub_item[0] );
				$sub_items[]   = array(
					'title' => trim( wp_strip_all_tags( $sub_raw_title ) ),
					'url'   => wpdm_menu_item_url( $sub_item[2] ),
				);
			}
		}

		$dock_item = array(
			'id'      => sanitize_key( $item[5] ?? $item[2] ),
			'title'   => $title,
			'icon'    => $icon,
			'url'     => $url,
			'badge'   => $badge,
			'submenu' => $sub_items,
			'multi'   => wpdm_dock_item_is_multi( $item[2] ),
		);

		/**
		 * Filters a single dock item's data.
		 *
		 * @since 0.1.0
		 *
		 * @param array  $dock_item The dock item data.
		 * @param string $menu_slug The menu slug.
		 */
		$dock_item = apply_filters( 'wp_desktop_dock_item', $dock_item, $item[2] );

		$items[] = $dock_item;
	}

	/**
	 * Filters the dock items before they are passed to JavaScript.
	 *
	 * @since 0.1.0
	 *
	 * @param array[] $items Array of dock item arrays.
	 */
	return apply_filters( 'wp_desktop_dock_items', $items );
}

/**
 * Sanitizes a dock icon value for safe injection into the shell JS.
 *
 * Menu items can set their icon to any of the following:
 *
 *   - A Dashicons class (e.g. `dashicons-admin-post`)
 *   - A Dashicons-prefixed string (we allow the full class list)
 *   - A `data:image/svg+xml;base64,...` URI
 *   - A `data:image/svg+xml;utf8,...` URI
 *   - An http/https URL
 *   - `'none'` or `'div'` (CSS hooks, no icon asset)
 *
 * Anything else — in particular `javascript:` URIs, inline event
 * handlers, or non-image data URIs — is dropped and replaced with the
 * generic fallback. The return value is always a string that is safe
 * to drop into an `img.src` or a CSS class without further escaping.
 *
 * @since 0.4.0
 *
 * @param mixed $icon Raw icon value from the menu registration.
 * @return string Sanitized icon string.
 */
function wpdm_sanitize_dock_icon( $icon ) {
	$fallback = 'dashicons-admin-generic';
	if ( ! is_string( $icon ) || '' === $icon ) {
		return $fallback;
	}

	$icon = trim( $icon );

	if ( 'none' === $icon || 'div' === $icon ) {
		return $fallback;
	}

	if ( 0 === strpos( $icon, 'dashicons-' ) ) {
		// Allow only the safe subset of characters a Dashicons class can
		// contain — prevents class-attribute break-out via spaces or
		// quotes if a plugin registers a malicious "dashicons-…" value.
		return preg_replace( '/[^a-z0-9_-]/', '', $icon );
	}

	if ( 0 === stripos( $icon, 'data:image/svg+xml' ) ) {
		// A benign SVG data URI — accept it after running it through
		// esc_url_raw so any embedded quotes/scheme tricks get neutered.
		$clean = esc_url_raw( $icon, array( 'data' ) );
		return $clean ? $clean : $fallback;
	}

	if ( 0 === stripos( $icon, 'http://' ) || 0 === stripos( $icon, 'https://' ) ) {
		$clean = esc_url_raw( $icon, array( 'http', 'https' ) );
		return $clean ? $clean : $fallback;
	}

	return $fallback;
}

/**
 * Decides whether a given admin page should support multiple open windows.
 *
 * List-style screens (Posts, Pages, custom post types, Media, Users,
 * Comments, taxonomy terms) often benefit from being open more than once:
 * a writer may want to read one post while drafting another, compare two
 * users side-by-side, pick media from one window and drop it into a draft
 * in another. Singleton-ish screens (Dashboard, Settings, Tools, Profile)
 * have a single logical state — opening two makes no sense.
 *
 * The default rule matches the base filename of the menu slug against a
 * known list. Plugin authors can override via the
 * `wp_desktop_dock_item_multi` filter to mark any custom page as multi
 * (or force a stock list page into singleton mode).
 *
 * @since 0.5.0
 *
 * @param string $menu_slug The raw menu slug (e.g. `edit.php`, `upload.php`,
 *                          or `my-plugin-page`). Query strings are preserved
 *                          so `edit.php?post_type=page` resolves correctly.
 * @return bool True if this page supports multiple simultaneous windows.
 */
function wpdm_dock_item_is_multi( $menu_slug ) {
	// Multi-capable admin files. Match by the base file regardless of
	// any query string (post_type, taxonomy, page, paged, etc.) so every
	// CPT and every taxonomy inherits the same rule as their parent.
	$multi_files = array(
		'edit.php',
		'edit-tags.php',
		'upload.php',
		'users.php',
		'edit-comments.php',
	);

	$base = strtok( (string) $menu_slug, '?' );
	$multi = in_array( $base, $multi_files, true );

	/**
	 * Filters whether a dock item supports multiple open windows.
	 *
	 * Return true to let the user open more than one window of this page.
	 * A "+" affordance appears on the dock icon and a "Open another" action
	 * becomes available in the window's title-bar menu. Singletons (false)
	 * always focus the existing window when re-opened.
	 *
	 * @since 0.5.0
	 *
	 * @param bool   $multi     Whether this page is multi-capable.
	 * @param string $menu_slug The menu slug (e.g. `edit.php?post_type=page`).
	 */
	return (bool) apply_filters( 'wp_desktop_dock_item_multi', $multi, $menu_slug );
}

/**
 * Converts a menu item slug to a full admin URL.
 *
 * Handles both direct file references (e.g., 'edit.php') and
 * plugin page slugs (e.g., 'admin.php?page=my-plugin').
 *
 * @since 0.1.0
 *
 * @param string $slug The menu item slug or URL.
 * @return string The full admin URL.
 */
function wpdm_menu_item_url( $slug ) {
	// Already a full URL.
	if ( str_starts_with( $slug, 'http://' ) || str_starts_with( $slug, 'https://' ) ) {
		return esc_url( $slug );
	}

	// Strip path traversal sequences.
	$slug = str_replace( '..', '', $slug );

	// Direct file reference (e.g., 'edit.php', 'upload.php').
	if ( false !== strpos( $slug, '.php' ) ) {
		return esc_url( admin_url( $slug ) );
	}

	// Plugin page slug — route through admin.php.
	return esc_url( admin_url( 'admin.php?page=' . rawurlencode( $slug ) ) );
}
