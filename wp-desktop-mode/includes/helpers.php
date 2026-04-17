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
function wp_is_desktop_mode() {
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
 * actual render is stopped by `wp_desktop_chromeless_suppress_admin_bar`
 * below; this filter is kept for completeness + tests.
 *
 * @since 0.1.0
 *
 * @param bool $show Whether the admin bar should be shown.
 * @return bool
 */
function wp_desktop_chromeless_hide_admin_bar( $show ) {
	if ( wp_is_chromeless_request() ) {
		return false;
	}
	return $show;
}
add_filter( 'show_admin_bar', 'wp_desktop_chromeless_hide_admin_bar' );

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
function wp_desktop_chromeless_suppress_admin_bar() {
	if ( wp_is_chromeless_request() ) {
		remove_action( 'in_admin_header', 'wp_admin_bar_render', 0 );
		remove_action( 'wp_body_open', 'wp_admin_bar_render', 0 );
	}
}
add_action( 'admin_init', 'wp_desktop_chromeless_suppress_admin_bar' );

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
function wp_is_chromeless_request() {
	if ( empty( $_GET['wp_desktop'] ) || '1' !== $_GET['wp_desktop'] ) {
		return false;
	}

	// Only allow chromeless mode if the user actually has desktop mode enabled.
	// This prevents stripping admin chrome via a bare ?wp_desktop=1 parameter.
	return wp_is_desktop_mode();
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
function wp_desktop_build_dock_items() {
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

		// Determine the icon.
		$icon = ! empty( $item[6] ) ? $item[6] : 'dashicons-admin-generic';

		// Build the full URL for the menu item.
		$url = wp_desktop_menu_item_url( $item[2] );

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
					'url'   => wp_desktop_menu_item_url( $sub_item[2] ),
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
function wp_desktop_menu_item_url( $slug ) {
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
