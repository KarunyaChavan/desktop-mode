/**
 * Desktop Mode — Entry Point.
 *
 * Initializes the desktop shell, restores the user's session if one
 * exists, opens the current admin page otherwise, wires session
 * persistence to change events, and normalizes the browser URL to
 * `/wp-desktop/` so the address bar shows a single stable location
 * regardless of which admin page is open in which window.
 *
 * @since 6.9.0
 */

import { WindowManager } from './window-manager';
import { Dock } from './dock';
import { OsSettings } from './settings';
import { deriveWindowId, urlMatchKey } from './utils';
import {
	HOOKS,
	doAction,
	rawHooks,
	whenReady,
	type WpHooks,
} from './hooks';
import * as registry from './wallpapers/registry';
import { WallpaperLayer } from './wallpapers/layer';
import { registerBuiltInWallpapers } from './wallpapers/built-in';
import { loadVendorScript } from './wallpapers/vendor-loader';
import { WidgetLayer } from './widgets/layer';
import { registerBuiltInWidgets } from './widgets/built-in';
import * as widgetRegistry from './widgets/registry';
import {
	registerModule,
	loadModules,
	type ModuleDef,
} from './modules/registry';
import type { WallpaperDef } from './wallpapers/types';
import './plugins';
import type { DesktopConfig, SessionWindow } from './types';

/** Stable id for the OS Settings native window. */
const OS_SETTINGS_WINDOW_ID = 'wp-desktop-os-settings';

/**
 * Public surface exposed on `window.wp.desktop`. Third-party plugins
 * rely on these members being stable — new fields may be added over
 * time, but nothing here is removed without a major-version bump.
 */
export interface WpDesktopPublicApi {
	windowManager: WindowManager;
	dock: Dock | null;
	saveSession: () => void;
	/** Raw `@wordpress/hooks` bridge. Alias of `window.wp.hooks`. */
	hooks: WpHooks;
	/** Convenience: register a wallpaper via `wp-desktop.wallpapers` filter. */
	registerWallpaper: ( def: WallpaperDef ) => void;
	/** Convenience: register a widget via `wp-desktop.widgets` filter. */
	registerWidget: ( def: import( './widgets/types' ).WidgetDef ) => void;
	/** Load a vendor script once, memoized. See `src/wallpapers/vendor-loader.ts`. */
	loadVendorScript: ( url: string ) => Promise<void>;
	/**
	 * Register a shared vendor module so other plugins can `needs:` it
	 * by id. Built-in ids (`pixijs`, …) are pre-registered by the shell.
	 */
	registerModule: ( def: ModuleDef ) => void;
	/** Imperatively load one or more registered modules. Usually unnecessary — canvas wallpapers declare `needs[]` and the shell resolves automatically. */
	loadModules: ( ids: string[] ) => Promise<void>;
	/** Run `cb` after `wp-desktop.init` has fired (immediately if already fired). */
	whenReady: ( cb: () => void ) => void;
	/**
	 * Update the user's "default window" preference — the window that
	 * opens when the user enters the portal with no saved session.
	 *
	 * - Passing a URL makes it the default (the shell clamps to
	 *   same-origin wp-admin URLs; invalid URLs reject).
	 * - Passing `null` disables the default entirely, giving the user
	 *   an empty desktop on portal entry.
	 *
	 * Updates `config.defaultWindow` in place and dispatches the
	 * `wp-desktop-default-window-changed` CustomEvent on `document`
	 * so the ⋯-menu checkmarks repaint.
	 */
	setDefaultWindow: ( url: string | null ) => Promise<void>;
	/**
	 * The `DesktopConfig` that booted this shell. Read-only for plugins
	 * — useful for picking up `pluginUrl` and other PHP-sourced bits.
	 */
	config: DesktopConfig;
}

declare global {
	interface Window {
		wpDesktopConfig?: DesktopConfig;
	}
	/**
	 * Contribute `desktop` to the merged `window.wp` namespace. The
	 * `hooks` slot is contributed by `src/hooks.ts`; a single `Window.wp`
	 * declaration (there) stitches them together.
	 */
	interface WpGlobal {
		desktop?: WpDesktopPublicApi;
	}
}

/** Debounce window for session writes. 500 ms is short enough to feel immediate and long enough to coalesce drag/resize storms. */
const SESSION_SAVE_DEBOUNCE_MS = 500;

/** Minimum margin between the restored window and the desktop edges when clamping. */
const VIEWPORT_CLAMP_MARGIN = 12;

/**
 * Initialize Desktop Mode.
 */
function init(): void {
	const config = window.wpDesktopConfig;
	if ( ! config ) {
		return;
	}

	const desktopArea = document.getElementById( 'wp-desktop-area' );
	if ( ! desktopArea ) {
		return;
	}

	const manager = new WindowManager( desktopArea );

	// Wallpaper layer + registry. Built-in presets register immediately
	// (synchronously, before `wp-desktop.init` fires) so the filter chain
	// third-party plugins hook into already carries the full seed list.
	// The layer owns the wallpaper DOM element the shell markup reserves
	// as the first child of `#wp-desktop-shell`.
	const wallpaperEl = document.getElementById( 'wp-desktop-wallpaper' );
	const pluginUrl = config.pluginUrl || '';
	let wallpaperLayer: WallpaperLayer | null = null;
	if ( wallpaperEl ) {
		wallpaperLayer = new WallpaperLayer( wallpaperEl, pluginUrl );
	}
	registerBuiltInWallpapers();

	// Widget layer + registry. Same pattern as wallpapers: register
	// built-ins synchronously so the `wp-desktop.widgets` filter
	// already carries them when plugins hook in, then hydrate the
	// layer which mounts whichever widgets the user last had on.
	const widgetsEl = document.getElementById( 'wp-desktop-widgets' );
	let widgetLayer: WidgetLayer | null = null;
	registerBuiltInWidgets();
	if ( widgetsEl ) {
		widgetLayer = new WidgetLayer( widgetsEl, pluginUrl );
	}

	// Built-in modules: PixiJS is bundled in `assets/vendor/`. Plugins
	// that want to use it declare `needs: ['pixijs']` on their wallpaper
	// and the shell loads the script before mount fires — no URL lookup
	// for the plugin author to get wrong.
	registerModule( {
		id: 'pixijs',
		url: `${ pluginUrl }/assets/vendor/pixi.min.js`,
		isReady: () => typeof ( window as { PIXI?: unknown } ).PIXI !== 'undefined',
	} );

	// OS Settings — shell-level preferences. Takes the wallpaper layer
	// so it can delegate apply() through the registry-driven path.
	// Falls back to a stub layer when the shell markup somehow lacks
	// the wallpaper element (defensive; shouldn't happen in practice).
	const osSettings = new OsSettings(
		{
			mediaUrl: config.mediaUrl,
			restNonce: config.restNonce,
			canUpload: !! config.canUpload,
		},
		wallpaperLayer ?? new WallpaperLayer( document.createElement( 'div' ), pluginUrl ),
	);
	osSettings.apply();

	// Dock.
	const dockEl = document.getElementById( 'wp-desktop-dock' );
	let dock: Dock | null = null;
	if ( dockEl && config.dockItems ) {
		dock = new Dock( dockEl, manager, config.dockItems, config.adminUrl );
		desktopArea.classList.add( 'wp-desktop-area--with-dock' );

		// System tile at the bottom of the dock — last icon, after WP
		// Settings. Clicking opens the native OS Settings window; the
		// window manager focuses any existing instance instead of
		// stacking a second.
		dock.appendSystemItem( {
			id: OS_SETTINGS_WINDOW_ID,
			title: 'OS Settings',
			icon: 'dashicons-desktop',
			// "Open" for the dock dot means "open on the currently
			// active desktop." OS Settings on another desktop
			// shouldn't paint the dot on the active view.
			isOpen: () => {
				const win = manager.getById( OS_SETTINGS_WINDOW_ID );
				if ( ! win ) {
					return false;
				}
				return (
					( win.config.desktopId || manager.getActiveDesktopId() ) ===
					manager.getActiveDesktopId()
				);
			},
			onOpen: () => {
				manager.open( {
					id: OS_SETTINGS_WINDOW_ID,
					baseId: OS_SETTINGS_WINDOW_ID,
					url: '#os-settings',
					title: 'OS Settings',
					icon: 'dashicons-desktop',
					native: true,
					render: ( body ) => osSettings.renderPanel( body ),
					// Sized to comfortably fit three wallpaper swatches
					// across plus the media-library grid showing 5–6
					// thumbnails per row — smaller defaults forced the
					// sections into a single narrow column.
					width: 820,
					height: 720,
					minWidth: 560,
					minHeight: 480,
				} );
			},
		} );
	}

	// Bootstrap: restore session (if any), then decide whether to also
	// auto-open the current admin URL. The rules compose three signals:
	//
	//   1. `fromPortal=false`     → user navigated to a specific admin
	//      URL (e.g. /wp-admin/edit.php). Always honor that navigation
	//      by opening the page; direct URLs are intent.
	//
	//   2. `fromPortal=true`
	//      + session exists       → user is returning to their saved
	//      stack. Respect the stack verbatim — don't force Dashboard
	//      (or any other default) back in. Matches their last state.
	//
	//   3. `fromPortal=true`
	//      + session empty
	//      + defaultWindow.enabled=false
	//                              → user explicitly turned off the
	//      default window. Show them an empty desktop. No auto-open.
	//
	//   4. `fromPortal=true`
	//      + session empty
	//      + defaultWindow.enabled=true
	//                              → first visit or clean slate, and
	//      the default window is set (Dashboard by default). The
	//      portal already redirected to its URL, so the current page
	//      IS the default window — open it. The desktop is populated
	//      with the user's chosen startup.
	const hasSession = !! ( config.session && config.session.windows && config.session.windows.length > 0 );
	if ( hasSession ) {
		restoreSession( manager, config, desktopArea );
	}
	const defaultEnabled = config.defaultWindow?.enabled !== false;
	const suppressAutoOpen =
		config.fromPortal && ( hasSession || ! defaultEnabled );
	if ( ! suppressAutoOpen ) {
		openCurrentPage( manager, config );
	}

	// Persistence.
	const saveSession = createSessionSaver( manager, config );
	wireSessionEvents( saveSession );

	// Async writer for the default-window preference. Writes the user's
	// choice through the REST endpoint, mutates `config.defaultWindow`
	// in place, and dispatches a CustomEvent the ⋯-menu listens to so
	// the check state repaints live without an OS Settings reopen.
	const setDefaultWindow = async ( url: string | null ): Promise<void> => {
		try {
			const response = await fetch( config.defaultWindowUrl, {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': config.restNonce,
				},
				body: JSON.stringify( { url } ),
			} );
			if ( ! response.ok ) {
				throw new Error( `HTTP ${ response.status }` );
			}
			const data = ( await response.json() ) as {
				enabled: boolean;
				url: string;
			};
			config.defaultWindow = data;
			document.dispatchEvent(
				new CustomEvent( 'wp-desktop-default-window-changed', {
					detail: data,
				} ),
			);
		} catch ( err ) {
			if ( typeof console !== 'undefined' ) {
				console.error(
					'[wp-desktop-mode] Failed to save default window:',
					err,
				);
			}
		}
	};

	// Manager → public API wiring. When a user clicks "Open on startup"
	// in a window's ⋯ menu, the manager calls this callback with the
	// window. We either set this window's URL as the default, or — if
	// it's already the default — disable it.
	manager.onToggleStartupRequested = ( win ) => {
		const currentPref = config.defaultWindow;
		const winUrl = win.getCurrentUrl();
		const alreadyDefault =
			!! currentPref?.enabled &&
			urlMatchKey( currentPref.url ) === urlMatchKey( winUrl );
		void setDefaultWindow( alreadyDefault ? null : winUrl );
	};

	// Expose the public API on `window.wp.desktop`. The `hooks` field
	// aliases `window.wp.hooks` so plugins have one idiomatic entry
	// point for both the window manager and the filter/action bus.
	window.wp = window.wp || {};
	window.wp.desktop = {
		windowManager: manager,
		dock,
		saveSession,
		hooks: rawHooks(),
		registerWallpaper: ( def: WallpaperDef ) => {
			registry.register( def );
			// Re-apply so a plugin that registers its own wallpaper and
			// sets the user's selection to it in the same breath sees an
			// immediate repaint rather than having to wait for the next
			// OS Settings open.
			osSettings.apply();
		},
		registerWidget: ( def ) => {
			widgetRegistry.register( def );
			// No re-paint needed here: the layer only mounts IDs the
			// user explicitly enabled, so adding a new def just makes
			// it available in the next picker open. Plugins wanting
			// to force a widget on can call
			// `wp.desktop.widgetLayer.add(id)` — exposed below.
		},
		loadVendorScript,
		registerModule,
		loadModules,
		whenReady,
		setDefaultWindow,
		config,
	};

	// Fire `wp-desktop.init` — plugins can now register wallpapers
	// and hook other surfaces. Fired AFTER `window.wp.desktop` is
	// populated so subscribers see the full public API. Subscribers
	// that later re-apply the wallpaper pick up their own
	// registrations via registry re-read.
	doAction( HOOKS.INIT, { config } );

	// Re-apply the wallpaper once init subscribers have had a chance
	// to register — if the user's saved selection belongs to a plugin
	// that just registered, this is when it becomes visible.
	osSettings.apply();

	// Hydrate widgets AFTER `wp-desktop.init` so plugin-registered
	// defs are in the registry when the user's saved list is
	// resolved. Hydration is idempotent — safe if it fires twice
	// (shouldn't, but defensive).
	widgetLayer?.hydrate();

	// Tear down any active canvas wallpaper + every mounted widget
	// on page unload. Both hold intervals / tickers / WebGL
	// contexts that would otherwise compete with the session-beacon
	// flush.
	window.addEventListener( 'pagehide', () => {
		wallpaperLayer?.teardownActive();
		widgetLayer?.disposeAll();
	} );

	// Shell-level lifecycle actions — fired once the public API exists
	// so plugin authors can subscribe from `wp-desktop.init`.
	bindShellLifecycle();

	// Intercept top-window clicks on /wp-admin/ links so they route into
	// the window manager instead of reloading the whole page. Without this,
	// the admin bar's "Edit my profile", "New Post", comments counter, etc.
	// each trigger a full-tab navigation → portal redirect → shell re-boot
	// cycle even though the outcome is "open a window in this shell".
	// Chromeless iframes have their own interceptor in render.php; this one
	// covers the top-window chrome (admin bar, anything any plugin hangs
	// off the shell).
	bindTopWindowLinkInterceptor( manager, config );

	// Click on the desktop background to minimize all windows (like macOS "Show Desktop").
	//
	// Suppressed while overview is active. Overview owns its own
	// pointer surface and drives selection/cancel via pointerdown +
	// pointerup on the same element — the browser still synthesizes a
	// trailing `click` on the common ancestor (the desktop area) for
	// drag-across-thumbnails and backdrop taps, and without this guard
	// that click would minimize every window the moment the overview
	// animation starts, leaving thumbnail labels orphaned on an empty
	// backdrop. The guard checks the live class on `desktopArea`
	// because overview can be entered/exited repeatedly — a captured
	// boolean snapshot would go stale.
	desktopArea.addEventListener( 'click', ( e: MouseEvent ) => {
		if ( e.target !== desktopArea ) {
			return;
		}
		if ( desktopArea.classList.contains( 'wp-desktop-area--overview' ) ) {
			return;
		}
		const windows = manager.getAll();
		const allMinimized = windows.length > 0 && windows.every( ( w ) => w.state === 'minimized' );
		if ( allMinimized ) {
			for ( const win of windows ) {
				win.restore();
			}
		} else {
			for ( const win of windows ) {
				if ( win.state !== 'minimized' ) {
					win.minimize();
				}
			}
		}
	} );

	// The URL bar is intentionally NOT normalized to /wp-desktop/.
	// Prior versions did a `history.replaceState(..., config.portalUrl)`
	// here to unify the address bar around the portal URL — cosmetically
	// nicer, but every browser reload hit /wp-desktop/, which triggered
	// a portal HTTP redirect to the canonical admin URL, producing a
	// visible address-bar flash (`/wp-admin/index.php?wp_desktop_portal=1`
	// → `/wp-desktop/`) on every reload. Leaving the URL as the actual
	// admin URL eliminates the flash and makes reloads instant — the
	// user sees /wp-admin/... in the address bar in exchange, which is
	// also more transparent about where the shell is currently hosted.
	// `config.portalUrl` stays in the shell config so plugins that want
	// to build "home" links can still point at the portal.

	document.dispatchEvent(
		new CustomEvent( 'wp-desktop-init', {
			detail: { config, restored: hasSession },
		} ),
	);
}

/**
 * Restores windows from a saved session into the manager.
 *
 * Each window's geometry is clamped to fit the current desktop area
 * before construction — so a layout captured on an ultrawide display
 * lands sanely on a laptop. Stacking order follows the session order
 * (earliest-opened first, focused id brought to the top at the end).
 */
function restoreSession(
	manager: WindowManager,
	config: DesktopConfig,
	desktopArea: HTMLElement,
): void {
	const rect = desktopArea.getBoundingClientRect();

	// Seed desktops + active id BEFORE recreating windows. Windows
	// pass `desktopId` from the session through to their config; the
	// manager honours that exactly as long as the desktop already
	// exists in the registry, otherwise it falls back to the active
	// desktop. Establishing the registry first preserves the user's
	// per-desktop window grouping across reloads.
	if ( Array.isArray( config.session.desktops ) && config.session.desktops.length > 0 ) {
		manager.seedDesktops(
			config.session.desktops,
			config.session.activeDesktop || config.session.desktops[ 0 ].id,
		);
	}

	for ( const win of config.session.windows ) {
		const clamped = clampGeometryToViewport( win, rect );
		const dockEntry = findDockEntryForUrl( win.url, config );

		const opened = manager.open( {
			id: win.id,
			baseId: win.baseId || win.id,
			desktopId: win.desktopId,
			multi: !! dockEntry?.multi,
			url: win.url,
			title: win.title,
			icon: win.icon || 'dashicons-admin-generic',
			x: clamped.x,
			y: clamped.y,
			width: clamped.width,
			height: clamped.height,
			initialState: win.state,
			submenu: dockEntry?.submenu,
		} );

		// Rehydrate any external sub-tabs the user had open on this
		// window at save time. Each becomes a fresh closeable tab with
		// its own iframe, ordered left-to-right in the order they
		// were added originally.
		if ( Array.isArray( win.externalTabs ) ) {
			for ( const ext of win.externalTabs ) {
				if ( ext && typeof ext.url === 'string' && ext.url !== '' ) {
					opened.addExternalTab(
						ext.url,
						typeof ext.label === 'string' && ext.label !== ''
							? ext.label
							: ext.url,
					);
				}
			}
		}
	}

	// Restore focus to whichever window the user left focused. If that id
	// is no longer around (e.g., the saved focus pointed at a window we
	// failed to reconstruct), `getById` returns undefined and we leave
	// the default — topmost-of-stack — focus in place.
	if ( config.session.focused ) {
		const focused = manager.getById( config.session.focused );
		if ( focused ) {
			manager.focus( focused );
		}
	}
}

/**
 * Opens the current admin page in a fresh window — the "no saved session" path.
 */
function openCurrentPage( manager: WindowManager, config: DesktopConfig ): void {
	const windowId = deriveWindowId( config.currentPage, config.adminUrl );
	const dockEntry = findDockEntryForUrl( config.currentPage, config );

	manager.open( {
		id: windowId,
		baseId: windowId,
		multi: !! dockEntry?.multi,
		url: config.currentPage,
		title: config.currentTitle,
		icon: config.currentIcon,
		submenu: dockEntry?.submenu,
	} );
}

/**
 * Intercepts clicks on `/wp-admin/` anchors in the top window and opens
 * (or focuses) a matching shell window instead of letting the browser
 * navigate the whole tab.
 *
 * Runs in the capture phase so we beat any handler that calls
 * `stopPropagation` on the bubble phase — the admin bar's own JS, for
 * instance. Handlers that call `preventDefault()` before us (like the
 * desktop-mode toggle, which uses `href="#"`) are respected: we bail on
 * `defaultPrevented` and on anchor links.
 *
 * Iframe content is a separate document realm — clicks inside a window
 * don't bubble up to this listener, so the chromeless iframe's own link
 * rewriter still owns iframe-internal navigation.
 */
function bindTopWindowLinkInterceptor(
	manager: WindowManager,
	config: DesktopConfig,
): void {
	document.addEventListener(
		'click',
		( e: MouseEvent ) => {
			if ( e.defaultPrevented ) {
				return;
			}
			if ( e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ) {
				return;
			}
			const target = e.target as Element | null;
			const link = target && target.closest ? target.closest( 'a[href]' ) : null;
			if ( ! link ) {
				return;
			}
			const anchor = link as HTMLAnchorElement;
			const linkTarget = anchor.getAttribute( 'target' );
			if ( linkTarget && linkTarget !== '' && linkTarget !== '_self' ) {
				return;
			}
			if ( anchor.hasAttribute( 'download' ) ) {
				return;
			}

			const rawHref = anchor.getAttribute( 'href' );
			if ( ! rawHref || rawHref.charAt( 0 ) === '#' ) {
				return;
			}
			if ( /^(mailto:|tel:|javascript:|data:)/i.test( rawHref ) ) {
				return;
			}

			let url: URL;
			try {
				url = new URL( rawHref, window.location.href );
			} catch {
				return;
			}

			if ( url.origin !== window.location.origin ) {
				return;
			}
			let adminPath: string;
			try {
				adminPath = new URL( config.adminUrl ).pathname;
			} catch {
				adminPath = '/wp-admin/';
			}
			if ( ! url.pathname.startsWith( adminPath ) ) {
				return;
			}

			// admin-post.php and admin-ajax.php are endpoints, not pages.
			// Logout and similar auth routes carry their own redirects and
			// must be allowed to navigate the tab normally.
			if ( /\/(admin-post|admin-ajax)\.php$/.test( url.pathname ) ) {
				return;
			}
			if ( url.searchParams.has( 'action' ) && url.searchParams.get( 'action' ) === 'logout' ) {
				return;
			}
			// The Detach-to-classic action explicitly wants a real tab with
			// classic chrome — don't steal it back into the shell.
			if ( url.searchParams.has( 'wp_desktop_classic' ) ) {
				return;
			}

			e.preventDefault();
			e.stopPropagation();

			const windowId = deriveWindowId( url.href, config.adminUrl );
			const dockEntry = findDockEntryForUrl( url.href, config );
			const fallbackTitle = ( anchor.textContent || '' ).trim() || dockEntry?.title || '';

			manager.open( {
				id: windowId,
				baseId: windowId,
				multi: !! dockEntry?.multi,
				url: url.href,
				title: dockEntry?.title || fallbackTitle,
				icon: dockEntry?.icon || 'dashicons-admin-generic',
				submenu: dockEntry?.submenu,
			} );
		},
		true,
	);
}

/**
 * Finds the dock entry whose URL — or whose submenu's URL — resolves to
 * the same window ID as the given URL.
 *
 * Used on session restore and fresh-page auto-open so a window that
 * lands on a sub-page (e.g. Categories) still gets the parent menu's
 * submenu tabs rendered — and so the parent's `multi` flag threads
 * through to the window chrome.
 */
function findDockEntryForUrl(
	url: string,
	config: DesktopConfig,
): DesktopConfig[ 'dockItems' ][ number ] | undefined {
	const windowId = deriveWindowId( url, config.adminUrl );
	return ( config.dockItems || [] ).find(
		( i ) =>
			deriveWindowId( i.url, config.adminUrl ) === windowId ||
			( i.submenu || [] ).some(
				( s ) => deriveWindowId( s.url, config.adminUrl ) === windowId,
			),
	);
}

/**
 * Clamp a persisted window's geometry to fit inside the current desktop
 * area, preserving the window's aspect ratio when the saved size exceeds
 * the area. Handles the ultrawide-to-laptop transition gracefully:
 *
 *   - A window that sat at x=2800 on a 3440px desktop gets pulled back
 *     onto the smaller viewport.
 *   - A window bigger than the viewport is scaled down, not cropped.
 *   - Negative positions (shouldn't happen but defend anyway) become 0.
 *
 * Returns a plain geometry object — caller applies it to the WindowConfig.
 */
function clampGeometryToViewport(
	win: SessionWindow,
	rect: DOMRect,
): { x: number; y: number; width: number; height: number } {
	const maxW = Math.max( 200, rect.width - VIEWPORT_CLAMP_MARGIN * 2 );
	const maxH = Math.max( 200, rect.height - VIEWPORT_CLAMP_MARGIN * 2 );

	const width = Math.min( win.width, maxW );
	const height = Math.min( win.height, maxH );

	const maxX = Math.max( 0, rect.width - width - VIEWPORT_CLAMP_MARGIN );
	const maxY = Math.max( 0, rect.height - height - VIEWPORT_CLAMP_MARGIN );

	const x = Math.max( VIEWPORT_CLAMP_MARGIN, Math.min( win.x, maxX ) );
	const y = Math.max( VIEWPORT_CLAMP_MARGIN, Math.min( win.y, maxY ) );

	return { x, y, width, height };
}

/**
 * Creates the debounced+immediate session saver. Returns a single
 * function that schedules a debounced REST write on each call. Also
 * exposed on `wp.desktop.saveSession()` for plugins that want to flush.
 */
function createSessionSaver( manager: WindowManager, config: DesktopConfig ): () => void {
	let debounceTimer: number | null = null;
	let inFlight = false;

	const doSave = async (): Promise<void> => {
		if ( inFlight ) {
			return;
		}
		const payload = manager.snapshot();
		inFlight = true;
		try {
			await fetch( config.sessionUrl, {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': config.restNonce,
				},
				body: JSON.stringify( { session: payload } ),
				// Best-effort: we don't block the UI on persistence.
				keepalive: true,
			} );
		} catch {
			/* Network error is non-fatal — next change triggers another save. */
		} finally {
			inFlight = false;
		}
	};

	const flushImmediately = (): void => {
		if ( debounceTimer !== null ) {
			clearTimeout( debounceTimer );
			debounceTimer = null;
		}
		// Use sendBeacon for unload-time saves where fetch may not
		// complete. WP REST's cookie-auth middleware reads the nonce
		// from `$_REQUEST` (URL query string + form-encoded body),
		// NOT from JSON bodies — so to satisfy auth we append the
		// nonce to the URL as a query param. Without this, the
		// beacon arrives but WP returns 403 before our handler runs,
		// and the session on disk stays at its pre-close state.
		// Symptom: close a window, reload fast, window reappears.
		const payload = manager.snapshot();
		const body = new Blob(
			[ JSON.stringify( { session: payload } ) ],
			{ type: 'application/json' },
		);
		const beaconUrl =
			config.sessionUrl +
			( config.sessionUrl.includes( '?' ) ? '&' : '?' ) +
			'_wpnonce=' +
			encodeURIComponent( config.restNonce );
		if ( navigator.sendBeacon && navigator.sendBeacon( beaconUrl, body ) ) {
			return;
		}
		void doSave();
	};

	const schedule = (): void => {
		if ( debounceTimer !== null ) {
			clearTimeout( debounceTimer );
		}
		debounceTimer = window.setTimeout( () => {
			debounceTimer = null;
			void doSave();
		}, SESSION_SAVE_DEBOUNCE_MS ) as unknown as number;
	};

	// pagehide is the reliable unload signal across browsers (mobile Safari
	// in particular never fires beforeunload in the BFCache case).
	window.addEventListener( 'pagehide', flushImmediately );
	// Hidden tabs might never fire pagehide if the user switches away and
	// kills the browser — save opportunistically on visibility change too.
	document.addEventListener( 'visibilitychange', () => {
		if ( document.visibilityState === 'hidden' ) {
			flushImmediately();
		}
	} );

	return schedule;
}

/**
 * Wire the session saver to every window lifecycle event that should
 * end up persisted. Close/focus come from the manager; moved/resized/
 * state come from individual windows via `wp-desktop-window-changed`.
 */
function wireSessionEvents( save: () => void ): void {
	document.addEventListener( 'wp-desktop-window-opened', save );
	document.addEventListener( 'wp-desktop-window-closed', save );
	document.addEventListener( 'wp-desktop-window-focused', save );
	document.addEventListener( 'wp-desktop-window-changed', save );
}

/** Debounce window for the shell-resized action. Trailing-edge only. */
const SHELL_RESIZE_DEBOUNCE_MS = 120;

/**
 * Wire browser-resize and document-visibility into `wp-desktop.shell.*`
 * actions. Resize is debounced so a drag-to-resize storm collapses to a
 * single hook fire; visibility is edge-triggered (fires exactly once per
 * state change).
 */
function bindShellLifecycle(): void {
	const shellEl = document.getElementById( 'wp-desktop-shell' );

	let resizeTimer: number | null = null;
	const fireShellResize = (): void => {
		resizeTimer = null;
		const rect = shellEl ? shellEl.getBoundingClientRect() : null;
		doAction( HOOKS.SHELL_RESIZED, {
			width: rect ? Math.round( rect.width ) : window.innerWidth,
			height: rect ? Math.round( rect.height ) : window.innerHeight,
		} );
	};
	window.addEventListener( 'resize', () => {
		if ( resizeTimer !== null ) {
			window.clearTimeout( resizeTimer );
		}
		resizeTimer = window.setTimeout( fireShellResize, SHELL_RESIZE_DEBOUNCE_MS ) as unknown as number;
	} );

	document.addEventListener( 'visibilitychange', () => {
		doAction( HOOKS.SHELL_VISIBILITY, {
			state: document.hidden ? 'hidden' : 'visible',
		} );
	} );
}

// Initialize when DOM is ready.
if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', init );
} else {
	init();
}

// Re-export so the bundle can be tested without tight coupling.
export { clampGeometryToViewport };
