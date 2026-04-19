<?php
/**
 * Desktop Mode rendering.
 *
 * Handles body-class tagging, shell markup injection, asset enqueueing,
 * and the chromeless bridge script that lives inside iframed admin pages.
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

/**
 * Adds body classes for desktop mode and chromeless iframes.
 *
 * The classes anchor all CSS in the shell and chromeless overrides
 * stylesheets — `.wp-desktop-active` hides classic chrome and reveals
 * the shell, `.wp-desktop-chromeless` reshapes the page inside iframes.
 *
 * @since 0.1.0
 *
 * @param string $classes Space-separated CSS class string.
 * @return string
 */
function wpdm_admin_body_classes( $classes ) {
	if ( wpdm_is_chromeless_request() ) {
		return ltrim( $classes . ' wp-desktop-chromeless' );
	}

	// Per-request classic override: don't tag the body as desktop-active so
	// the classic chrome isn't hidden by CSS for this one tab.
	if ( wpdm_is_classic_request() ) {
		return $classes;
	}

	if ( wpdm_is_enabled() ) {
		return ltrim( $classes . ' wp-desktop-active' );
	}

	return $classes;
}
add_filter( 'admin_body_class', 'wpdm_admin_body_classes' );

/**
 * Enqueues the desktop mode shell assets (CSS + JS) when desktop mode is active.
 *
 * Only loads the full desktop shell scripts and styles when the user has
 * desktop mode enabled and the request is not a chromeless iframe load.
 *
 * @since 0.1.0
 */
function wpdm_enqueue_assets() {
	if ( ! is_admin() ) {
		return;
	}

	// Chromeless requests (iframes) need chromeless styles and overrides.
	if ( wpdm_is_chromeless_request() ) {
		wp_enqueue_style( 'wp-desktop' );
		wp_enqueue_style( 'wp-desktop-chromeless' );

		/**
		 * Fires when chromeless styles are enqueued inside a desktop mode iframe.
		 *
		 * Plugin and theme authors can hook here to enqueue their own CSS
		 * overrides for legacy pages rendered in chromeless mode. Use the
		 * `.wp-desktop-chromeless` body class to scope your rules.
		 *
		 * @since 0.1.0
		 */
		do_action( 'wp_desktop_chromeless_styles' );
		return;
	}

	if ( ! wpdm_is_enabled() || wpdm_is_classic_request() ) {
		return;
	}

	// CSS.
	wp_enqueue_style( 'wp-desktop' );
	wp_enqueue_style( 'wp-desktop-windows' );
	wp_enqueue_style( 'wp-desktop-dock' );

	// JS.
	wp_enqueue_script( 'wp-desktop' );

	// Pass configuration to JavaScript.
	global $title, $pagenow, $parent_file, $menu;

	$menu_icon = 'dashicons-admin-generic';
	if ( ! empty( $parent_file ) && ! empty( $menu ) ) {
		foreach ( $menu as $item ) {
			if ( ! empty( $item[2] ) && $item[2] === $parent_file && ! empty( $item[6] ) ) {
				$menu_icon = $item[6];
				break;
			}
		}
	}

	// Build dock items from the admin menu.
	$dock_items = wpdm_build_dock_items();

	// Build the current page URL from $pagenow + $_GET. Strip the portal
	// marker so the derived window ID matches what the dock would produce
	// for the same page — otherwise auto-opening the entry window and
	// clicking the same dock icon would create a duplicate.
	$current_query = $_GET; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	unset( $current_query[ WPDM_PORTAL_FLAG ] );
	$current_page = admin_url( $pagenow ) . ( ! empty( $current_query ) ? '?' . http_build_query( $current_query ) : '' );

	$from_portal = ! empty( $_GET[ WPDM_PORTAL_FLAG ] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended

	/**
	 * Filters the desktop shell configuration passed to JavaScript.
	 *
	 * @since 0.1.0
	 *
	 * @param array $config {
	 *     Desktop shell configuration.
	 *
	 *     @type string $currentPage  The current admin page URL.
	 *     @type string $currentTitle The current page title.
	 *     @type string $currentIcon  Dashicon class for the current page.
	 *     @type string $adminUrl     The base admin URL.
	 *     @type string $colorScheme  The active admin color scheme.
	 *     @type array  $dockItems    Dock items derived from admin menu.
	 *     @type array  $session      Saved session (windows, focused, updated).
	 *     @type string $sessionUrl       REST endpoint for saving the session.
	 *     @type string $mediaUrl         REST endpoint for media uploads (wp/v2/media).
	 *     @type string $defaultWindowUrl REST endpoint for saving the default-window preference.
	 *     @type array  $defaultWindow    { enabled: bool, url: string } — current default-window preference.
	 *     @type bool   $canUpload        Whether the user holds the `upload_files` capability.
	 *     @type string $pluginUrl        Plugin base URL (no trailing slash). Used by the shell to locate vendor assets and by plugins to build asset URLs.
	 *     @type string $restNonce        Nonce for the session REST endpoint.
	 *     @type string $portalUrl    Canonical `/wp-desktop/` URL.
	 *     @type bool   $fromPortal   Whether the shell was reached via the portal.
	 * }
	 */
	$config = apply_filters(
		'wp_desktop_shell_config',
		array(
			'currentPage'      => esc_url( $current_page ),
			'currentTitle'     => wp_strip_all_tags( $title ),
			'currentIcon'      => sanitize_html_class( $menu_icon ),
			'adminUrl'         => esc_url( admin_url() ),
			'colorScheme'      => sanitize_html_class( get_user_option( 'admin_color' ), 'fresh' ),
			'dockItems'        => $dock_items,
			'session'          => wpdm_get_session( get_current_user_id() ),
			'sessionUrl'       => esc_url_raw( rest_url( 'wp-desktop/v1/session' ) ),
			'mediaUrl'         => esc_url_raw( rest_url( 'wp/v2/media' ) ),
			'defaultWindowUrl' => esc_url_raw( rest_url( 'wp-desktop/v1/default-window' ) ),
			'defaultWindow'    => wpdm_get_default_window( get_current_user_id() ),
			'canUpload'        => current_user_can( 'upload_files' ),
			'pluginUrl'        => esc_url_raw( untrailingslashit( WPDM_URL ) ),
			'restNonce'        => wp_create_nonce( 'wp_rest' ),
			'portalUrl'        => esc_url( wpdm_portal_url() ),
			'fromPortal'       => $from_portal,
		)
	);

	wp_localize_script( 'wp-desktop', 'wpDesktopConfig', $config );

	/**
	 * Fires when desktop mode assets are enqueued.
	 *
	 * @since 0.1.0
	 */
	do_action( 'wp_desktop_mode_init' );
}
add_action( 'admin_enqueue_scripts', 'wpdm_enqueue_assets' );

/**
 * Injects the desktop shell markup into the admin page.
 *
 * Runs on `in_admin_header` at priority 5 so the shell renders right
 * after the classic admin bar but before the page content. The shell
 * floats above the classic layout via `position: fixed` in CSS; the
 * classic sidebar, body, and footer are hidden with `body.wp-desktop-active`
 * selectors.
 *
 * @since 0.1.0
 */
function wpdm_render_shell() {
	if ( wpdm_is_chromeless_request() || ! wpdm_is_enabled() || wpdm_is_classic_request() ) {
		return;
	}

	/**
	 * Fires right before the desktop shell markup is rendered.
	 *
	 * @since 0.1.0
	 */
	do_action( 'wp_desktop_shell_before' );

	// Stamp the user's admin color scheme onto the shell root so the
	// variables.css per-scheme selectors kick in before first paint —
	// doing this from JS on init() would show the default palette for a
	// frame before swapping.
	$scheme = sanitize_html_class( get_user_option( 'admin_color' ), 'fresh' );
	?>
	<div id="wp-desktop-shell" class="wp-desktop-shell" data-wp-desktop-scheme="<?php echo esc_attr( $scheme ); ?>" role="application" aria-label="<?php esc_attr_e( 'Desktop shell', 'wp-desktop-mode' ); ?>">
		<?php
		/*
		 * Wallpaper layer — sits behind both the dock and the desktop
		 * area so a translucent dock bleeds through to the wallpaper
		 * (macOS pattern). Canvas-driven wallpapers mount their own
		 * DOM into this element; static CSS wallpapers just inherit
		 * the `--wp-desktop-bg` custom property the shell sets at
		 * boot. Presentational only.
		 */
		?>
		<div id="wp-desktop-wallpaper" class="wp-desktop-wallpaper" aria-hidden="true"></div>
		<div class="wp-desktop-shell__body">
			<nav id="wp-desktop-dock" class="wp-desktop-dock" role="toolbar" aria-label="<?php esc_attr_e( 'Admin navigation', 'wp-desktop-mode' ); ?>"></nav>
			<div id="wp-desktop-area" class="wp-desktop-area wp-desktop-area--with-dock">
				<?php
				/*
				 * Widget column — paints above the wallpaper but
				 * beneath windows (z-index 1 vs. windows at 100+).
				 * Hosted INSIDE `.wp-desktop-area` so scrolling the
				 * area (not that we do today) would scroll widgets
				 * with it, and so the dock/taskbar naturally frame
				 * it. Empty on first render — JS (`WidgetLayer`)
				 * populates it on boot.
				 */
				?>
				<aside id="wp-desktop-widgets" class="wp-desktop-widgets" aria-label="<?php esc_attr_e( 'Widgets', 'wp-desktop-mode' ); ?>"></aside>
			</div>
		</div>
	</div>
	<?php
	/**
	 * Fires right after the desktop shell markup has rendered.
	 *
	 * @since 0.1.0
	 */
	do_action( 'wp_desktop_shell_after' );
}
add_action( 'in_admin_header', 'wpdm_render_shell', 5 );

/**
 * Forces Gutenberg out of fullscreen mode and dismisses welcome guides
 * inside chromeless iframes.
 *
 * The block editor's fullscreen mode renders a "back to dashboard" button
 * (the "W" logo in the top-left). Clicking it navigates the iframe to
 * `/wp-admin/edit.php` without the `wp_desktop=1` flag, which re-renders
 * the entire classic admin inside the chromeless window.
 *
 * Timing: Core's `initializeEditor()` runs inside a `window.load` handler
 * emitted by `edit-form-blocks.php` and synchronously calls
 * `setPersistenceLayer()` on the `core/preferences` store. That swap
 * produces the first state update the store ever emits — earlier defaults
 * come from the registered reducer at module-load time and don't reach
 * subscribers. So we scope a `wp.data.subscribe` to `core/preferences`,
 * wait for the first notification, and apply our overrides then. No
 * timers, no polling — the store tells us exactly when it's safe to write.
 *
 * A previous iteration swapped the persistence layer for a no-op at
 * module-load time. That silenced user dismissals during the window
 * before `initializeEditor()` ran, breaking "Got it" persistence for the
 * welcome guide. Don't do that.
 *
 * Belt-and-suspenders: `chromeless.css` hides the fullscreen close button
 * and welcome modal so there's no visible flash between window open and
 * our overrides firing.
 *
 * @since 0.1.0
 */
function wpdm_chromeless_editor_preferences() {
	if ( ! wpdm_is_chromeless_request() ) {
		return;
	}

	$script = <<<'JS'
( function () {
	if ( ! window.wp || ! wp.data || typeof wp.data.subscribe !== 'function' ) {
		return;
	}

	// Minimize writes: each set() triggers a debounced REST persist, so we
	// only flip values that are currently truthy. Skipping no-ops avoids
	// re-saving the user's meta on every chromeless load.
	//
	// Note: we intentionally do NOT touch `fullscreenMode`. Gutenberg's
	// non-fullscreen layout hardcodes top: 32px / left: 160px on
	// .interface-interface-skeleton to reserve space for the admin bar and
	// sidebar — both of which we've hidden — producing visible gaps inside
	// chromeless windows. Leaving fullscreenMode at its default (true)
	// makes the skeleton fill the viewport naturally. The W logo that
	// fullscreen surfaces is hidden via chromeless.css.
	var OVERRIDES = [
		[ 'core/edit-post', 'welcomeGuide' ],
		[ 'core/edit-post', 'welcomeGuideTemplate' ],
		[ 'core/edit-site', 'welcomeGuide' ],
		[ 'core/edit-site', 'welcomeGuideStyles' ],
		[ 'core/edit-site', 'welcomeGuidePage' ],
		[ 'core/edit-site', 'welcomeGuideTemplate' ],
		[ 'core/edit-widgets', 'welcomeGuide' ]
	];

	function applyOverrides() {
		var select = wp.data.select( 'core/preferences' );
		var prefs  = wp.data.dispatch( 'core/preferences' );
		if ( ! select || ! prefs || typeof prefs.set !== 'function' ) {
			return;
		}
		for ( var i = 0; i < OVERRIDES.length; i++ ) {
			var scope = OVERRIDES[ i ][ 0 ];
			var key   = OVERRIDES[ i ][ 1 ];
			try {
				if ( select.get( scope, key ) ) {
					prefs.set( scope, key, false );
				}
			} catch ( e ) {}
		}
	}

	// initializeEditor() runs inside a window.load handler and calls
	// setPersistenceLayer() on the preferences store. That call emits the
	// first state update the store ever sends to subscribers — which is
	// exactly the moment it's safe for us to write. Subscribe scoped to
	// this store, fire once, unsubscribe.
	var fired  = false;
	var unsub  = wp.data.subscribe( function () {
		if ( fired ) {
			return;
		}
		fired = true;
		unsub();
		applyOverrides();
	}, 'core/preferences' );
} )();
JS;

	// Attach after whichever editor package is loaded on this screen.
	// wp_add_inline_script silently no-ops for handles that aren't registered.
	wp_add_inline_script( 'wp-edit-post', $script, 'after' );
	wp_add_inline_script( 'wp-edit-site', $script, 'after' );
	wp_add_inline_script( 'wp-edit-widgets', $script, 'after' );
}
add_action( 'enqueue_block_editor_assets', 'wpdm_chromeless_editor_preferences' );

/**
 * Outputs the chromeless screen-meta bridge script.
 *
 * Detects Screen Options / Help panels in the iframed page and relays
 * their availability + open/closed state to the parent desktop shell
 * via postMessage. The parent shell uses this to render matching
 * buttons in the window title bar.
 *
 * @since 0.1.0
 */
function wpdm_chromeless_bridge_script() {
	if ( ! wpdm_is_chromeless_request() ) {
		return;
	}

	/**
	 * Fires after chromeless content in desktop mode.
	 *
	 * @since 0.1.0
	 *
	 * @param string $hook_suffix The current admin page hook suffix.
	 */
	do_action( 'wp_desktop_chromeless_after', isset( $GLOBALS['hook_suffix'] ) ? $GLOBALS['hook_suffix'] : '' );

	// Emit via wp_print_inline_script_tag so CSP nonces and `<script>`
	// attribute hygiene go through Core rather than being hand-rolled.
	$js = <<<'JS'
( function() {
	// Escape hatch: a chromeless page is only meant to live inside a
	// desktop-mode window iframe. If the top window IS this page, the
	// user ended up here directly — either bookmarked it, followed a
	// stale link, or got stranded by a bad portal redirect. Without
	// an admin bar there's no toggle to turn desktop mode off, so
	// strip the chromeless flag and reload as classic admin. That
	// puts the admin bar back and lets the user decide what to do.
	if ( ! window.parent || window.parent === window ) {
		try {
			var here = new URL( window.location.href );
			if ( here.searchParams.has( 'wp_desktop' ) ) {
				here.searchParams.delete( 'wp_desktop' );
				here.searchParams.delete( 'wp_desktop_portal' );
				window.location.replace( here.toString() );
			}
		} catch ( err ) {
			/* URL parse failure — let the broken state stand rather than
			 * navigate somewhere worse. */
		}
		return;
	}

	/*
	 * Link & form interceptor.
	 *
	 * Every same-origin wp-admin <a> href and <form> action gets the
	 * `wp_desktop=1` flag appended so navigation inside the iframe stays
	 * chromeless. Without this, a stray link to /wp-admin/edit.php (see
	 * Gutenberg's fullscreen close button, help-tab links, "Return to
	 * posts" affordances, etc.) re-renders the full classic admin inside
	 * our window.
	 *
	 * Excluded from rewriting:
	 *   - modifier clicks (cmd/ctrl/shift/alt) — user wants to open a
	 *     new tab/window, respect that
	 *   - target="_blank" / target="_top" / target="_parent"
	 *   - download attribute
	 *   - in-page anchors (#)
	 *   - mailto:, tel:, javascript: schemes
	 *   - cross-origin URLs
	 *   - URLs that already carry wp_desktop=
	 */
	function rewriteAdminUrl( href, base ) {
		if ( ! href || href.charAt( 0 ) === '#' ) {
			return null;
		}
		if ( /^(mailto:|tel:|javascript:|data:)/i.test( href ) ) {
			return null;
		}
		var url;
		try {
			url = new URL( href, base );
		} catch ( err ) {
			return null;
		}
		if ( url.origin !== window.location.origin ) {
			return null;
		}
		if ( url.pathname.indexOf( '/wp-admin/' ) === -1 ) {
			return null;
		}
		if ( url.searchParams.has( 'wp_desktop' ) ) {
			return null;
		}
		url.searchParams.set( 'wp_desktop', '1' );
		return url.toString();
	}

	/*
	 * Classify a link so we know whether to rewrite it (admin),
	 * escalate it to the parent shell (external / non-admin), or let
	 * the browser navigate naturally (mailto, anchor, download, etc.).
	 *
	 *   'admin'       — same-origin /wp-admin/ URL we rewrite in place.
	 *   'external'    — http(s) URL we want the parent shell to open
	 *                   as a sub-tab instead of navigating the iframe
	 *                   out of wp-admin. Covers both cross-origin
	 *                   links (plugin author sites, external docs) AND
	 *                   same-origin non-admin links (the site's own
	 *                   front-end pages).
	 *   'passthrough' — anything else (mailto, tel, javascript, data,
	 *                   anchors, unparseable). The browser handles it.
	 */
	function classifyLink( href, base ) {
		if ( ! href || href.charAt( 0 ) === '#' ) {
			return 'passthrough';
		}
		if ( /^(mailto:|tel:|javascript:|data:)/i.test( href ) ) {
			return 'passthrough';
		}
		var url;
		try {
			url = new URL( href, base );
		} catch ( err ) {
			return 'passthrough';
		}
		if ( url.protocol !== 'http:' && url.protocol !== 'https:' ) {
			return 'passthrough';
		}
		if (
			url.origin === window.location.origin &&
			url.pathname.indexOf( '/wp-admin/' ) !== -1
		) {
			return 'admin';
		}
		return 'external';
	}

	document.addEventListener( 'click', function ( e ) {
		if ( e.defaultPrevented ) {
			return;
		}
		if ( e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ) {
			return;
		}
		var link = e.target && e.target.closest ? e.target.closest( 'a[href]' ) : null;
		if ( ! link ) {
			return;
		}
		if ( link.target && link.target !== '' && link.target !== '_self' ) {
			return;
		}
		if ( link.hasAttribute( 'download' ) ) {
			return;
		}
		var href = link.getAttribute( 'href' );
		var kind = classifyLink( href, window.location.href );
		if ( kind === 'admin' ) {
			var rewritten = rewriteAdminUrl( href, window.location.href );
			if ( rewritten ) {
				link.setAttribute( 'href', rewritten );
			}
			return;
		}
		if ( kind === 'external' ) {
			/*
			 * External navigation inside an admin iframe would leave
			 * the user stranded in a chrome-free version of whatever
			 * site the link points at. Escalate to the parent shell
			 * so it opens the URL as a closeable sub-tab (with a
			 * detach button) alongside the admin tab — the user
			 * stays inside the desktop shell.
			 *
			 * Resolving the href against the document base gives the
			 * parent an absolute URL it doesn't have to re-resolve.
			 */
			e.preventDefault();
			var absolute;
			try {
				absolute = new URL( href, window.location.href ).toString();
			} catch ( err ) {
				return;
			}
			var label = ( link.textContent || '' ).trim() ||
				link.getAttribute( 'title' ) ||
				absolute;
			window.parent.postMessage(
				{
					type: 'wp-desktop-external-link',
					url: absolute,
					label: label.slice( 0, 80 )
				},
				window.location.origin
			);
		}
	}, true );

	document.addEventListener( 'submit', function ( e ) {
		var form = e.target;
		if ( ! form || form.tagName !== 'FORM' ) {
			return;
		}
		var action = form.getAttribute( 'action' );
		var rewritten = rewriteAdminUrl( action || window.location.href, window.location.href );
		if ( rewritten ) {
			form.setAttribute( 'action', rewritten );
		}
	}, true );

	var links = document.getElementById( 'screen-meta-links' );
	if ( ! links ) {
		return;
	}
	var screenOptionsBtn = document.getElementById( 'show-settings-link' );
	var helpBtn = document.getElementById( 'contextual-help-link' );
	var panels = [];
	if ( screenOptionsBtn ) {
		panels.push( 'screen-options' );
	}
	if ( helpBtn ) {
		panels.push( 'help' );
	}
	if ( panels.length === 0 ) {
		return;
	}

	var origin = window.location.origin;

	window.parent.postMessage( {
		type: 'wp-desktop-screen-meta',
		panels: panels
	}, origin );

	function getOpenPanel() {
		if ( screenOptionsBtn && screenOptionsBtn.getAttribute( 'aria-expanded' ) === 'true' ) {
			return 'screen-options';
		}
		if ( helpBtn && helpBtn.getAttribute( 'aria-expanded' ) === 'true' ) {
			return 'help';
		}
		return null;
	}

	function reportState() {
		window.parent.postMessage( {
			type: 'wp-desktop-screen-meta-state',
			open: getOpenPanel()
		}, origin );
	}

	reportState();

	var observer = new MutationObserver( reportState );
	if ( screenOptionsBtn ) {
		observer.observe( screenOptionsBtn, { attributes: true, attributeFilter: [ 'aria-expanded' ] } );
	}
	if ( helpBtn ) {
		observer.observe( helpBtn, { attributes: true, attributeFilter: [ 'aria-expanded' ] } );
	}

	// WP's close() animates and shares #screen-meta between both panels,
	// so racing two animated clicks hides the panel that just opened.
	// Jump the other panel to its closed end state synchronously instead.
	function forceClose( button ) {
		if ( ! button || button.getAttribute( 'aria-expanded' ) !== 'true' ) {
			return;
		}
		var panelId = button.getAttribute( 'aria-controls' );
		var panel = panelId ? document.getElementById( panelId ) : null;
		if ( ! panel ) {
			return;
		}
		if ( window.jQuery ) {
			window.jQuery( panel ).stop( true, false );
		}
		panel.style.display = 'none';
		panel.classList.add( 'hidden' );
		if ( panel.parentNode instanceof HTMLElement ) {
			panel.parentNode.style.display = 'none';
		}
		button.classList.remove( 'screen-meta-active' );
		button.setAttribute( 'aria-expanded', 'false' );
		var toggles = document.querySelectorAll( '.screen-meta-toggle' );
		for ( var i = 0; i < toggles.length; i++ ) {
			toggles[ i ].style.visibility = '';
		}
	}

	window.addEventListener( 'message', function( e ) {
		if ( e.origin !== origin ) {
			return;
		}
		if ( ! e.data || e.data.type !== 'wp-desktop-toggle-panel' ) {
			return;
		}
		var target = null;
		if ( e.data.panel === 'screen-options' && screenOptionsBtn ) {
			target = screenOptionsBtn;
		} else if ( e.data.panel === 'help' && helpBtn ) {
			target = helpBtn;
		}
		if ( ! target ) {
			return;
		}
		if ( target.getAttribute( 'aria-expanded' ) !== 'true' ) {
			var other = target === screenOptionsBtn ? helpBtn : screenOptionsBtn;
			forceClose( other );
		}
		target.click();
	} );
} )();
JS;

	wp_print_inline_script_tag( $js );
}
add_action( 'admin_footer', 'wpdm_chromeless_bridge_script' );

/**
 * Outputs a same-origin admin link/form rewriter for detached ("classic
 * override") tabs.
 *
 * Without this, the first navigation after a detach drops the
 * `wp_desktop_classic=1` flag and the next page falls back to the
 * desktop shell — because the user meta is still `'1'` and the
 * `admin_init` portal redirect kicks in. The JS here re-stamps the flag
 * on every same-origin `/wp-admin/` `<a href>` and `<form action>` so
 * navigations within the tab stay classic. Server-side redirects are
 * covered by {@see wpdm_classic_preserve_redirect}.
 *
 * Narrowly scoped: only runs when the current request itself carries
 * the classic flag. Skips modifier-clicks (cmd/ctrl/shift/alt), targets
 * other than `_self`, downloads, anchors, and non-http schemes so we
 * don't break "open in new tab" or mailto links.
 *
 * @since 0.4.0
 */
function wpdm_classic_link_interceptor() {
	if ( ! wpdm_is_classic_request() ) {
		return;
	}

	$flag_literal = wp_json_encode( WPDM_CLASSIC_FLAG );

	$js = <<<JS
( function () {
	var FLAG = {$flag_literal};

	function rewriteAdminUrl( href, base ) {
		if ( ! href || href.charAt( 0 ) === '#' ) {
			return null;
		}
		if ( /^(mailto:|tel:|javascript:|data:)/i.test( href ) ) {
			return null;
		}
		var url;
		try {
			url = new URL( href, base );
		} catch ( err ) {
			return null;
		}
		if ( url.origin !== window.location.origin ) {
			return null;
		}
		if ( url.pathname.indexOf( '/wp-admin/' ) === -1 ) {
			return null;
		}
		if ( url.searchParams.has( FLAG ) ) {
			return null;
		}
		url.searchParams.set( FLAG, '1' );
		return url.toString();
	}

	document.addEventListener( 'click', function ( e ) {
		if ( e.defaultPrevented ) {
			return;
		}
		if ( e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ) {
			return;
		}
		var link = e.target && e.target.closest ? e.target.closest( 'a[href]' ) : null;
		if ( ! link ) {
			return;
		}
		if ( link.target && link.target !== '' && link.target !== '_self' ) {
			return;
		}
		if ( link.hasAttribute( 'download' ) ) {
			return;
		}
		var rewritten = rewriteAdminUrl( link.getAttribute( 'href' ), window.location.href );
		if ( rewritten ) {
			link.setAttribute( 'href', rewritten );
		}
	}, true );

	document.addEventListener( 'submit', function ( e ) {
		var form = e.target;
		if ( ! form || form.tagName !== 'FORM' ) {
			return;
		}
		var action = form.getAttribute( 'action' );
		var rewritten = rewriteAdminUrl( action || window.location.href, window.location.href );
		if ( rewritten ) {
			form.setAttribute( 'action', rewritten );
		}
	}, true );
} )();
JS;

	wp_print_inline_script_tag( $js );
}
add_action( 'admin_footer', 'wpdm_classic_link_interceptor' );
