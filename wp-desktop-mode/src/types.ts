/**
 * Desktop Mode type definitions.
 *
 * @since 6.9.0
 */

/**
 * Window state enum.
 */
export type WindowState = 'normal' | 'maximized' | 'minimized' | 'fullscreen' | 'snapped-left' | 'snapped-right';

/**
 * Configuration for a desktop window.
 */
export interface WindowConfig {
	/** Unique window identifier, derived from the admin page slug. */
	id: string;
	/**
	 * Grouping key shared across every instance of the same admin page.
	 * For the first instance `baseId` equals `id`; additional instances
	 * carry suffixed ids (`${baseId}-2`, `${baseId}-3`, ...) while keeping
	 * the same baseId so the dock can group them.
	 */
	baseId?: string;
	/**
	 * Whether this page supports multiple simultaneous windows. When true,
	 * the title-bar menu exposes an "Open another" action and the dock
	 * icon gets a secondary "+" tap target. Singletons (false/undefined)
	 * always reuse the existing window.
	 */
	multi?: boolean;
	/** The admin page URL to load in the iframe. */
	url: string;
	/** Window title displayed in the title bar. */
	title: string;
	/** Dashicon class for the window icon (e.g., 'dashicons-admin-post'). */
	icon: string;
	/** Initial x position in pixels. */
	x: number;
	/** Initial y position in pixels. */
	y: number;
	/** Initial width in pixels. */
	width: number;
	/** Initial height in pixels. */
	height: number;
	/** Minimum width in pixels. */
	minWidth: number;
	/** Minimum height in pixels. */
	minHeight: number;
	/**
	 * Submenu items that render as a tab strip below the title bar.
	 * Each tab navigates the iframe within the same window — no new window opens.
	 * Pass an empty array (or omit) to hide the strip.
	 */
	submenu?: { title: string; url: string }[];
	/**
	 * Optional initial state. When present, the window is constructed
	 * into this state directly — used by session restore so a minimized
	 * or maximized window comes back in the same shape the user left it.
	 */
	initialState?: WindowState;
	/**
	 * Native window flag. When true, the window's body is rendered
	 * directly in the parent DOM via {@link WindowConfig.render} instead
	 * of loading {@link WindowConfig.url} in an iframe. Native windows
	 * inherit the full chrome (drag/resize/minimize/maximize) but skip
	 * iframe-only affordances (detach-to-tab, screen-meta bridge, tab
	 * strip, postMessage listener). Used for desktop-shell-native panels
	 * like OS Settings where an iframe would be wasteful and where the
	 * module wants direct access to the shell.
	 */
	native?: boolean;
	/**
	 * Render callback for native windows. Invoked once after the window
	 * element mounts; receives the empty `.wp-desktop-window__body` and
	 * fills it with whatever DOM the module wants. Ignored when
	 * `native` is falsy.
	 */
	render?: ( body: HTMLElement ) => void;
}

/**
 * Serialized window state for persistence.
 */
export interface WindowSnapshot {
	id: string;
	url: string;
	title: string;
	icon: string;
	x: number;
	y: number;
	width: number;
	height: number;
	state: WindowState;
}

/**
 * A dock item passed from PHP menu data.
 */
export interface DockItemConfig {
	/** Unique identifier (menu slug). */
	id: string;
	/** Display label. */
	title: string;
	/** Icon: dashicons class, data:image/svg+xml, URL, or 'none'. */
	icon: string;
	/** Admin page URL. */
	url: string;
	/** Badge count (updates, comments, etc.). */
	badge: number;
	/** Submenu items. */
	submenu: { title: string; url: string }[];
	/**
	 * Whether this admin page supports multiple open windows. Determined
	 * server-side — list screens (Posts, Pages, Media, Users, Comments,
	 * taxonomies) are true by default; Settings / Tools / Dashboard are
	 * false. Filterable via `wp_desktop_dock_item_multi`.
	 */
	multi?: boolean;
}

/**
 * A single persisted window entry.
 *
 * Shape mirrors the server-side sanitizer in includes/session.php — any
 * field added here must be validated server-side or it will be dropped.
 */
export interface SessionWindow {
	id: string;
	/**
	 * Grouping key for multi-instance windows. Optional for back-compat
	 * with sessions saved before the field existed — restore falls back
	 * to the id when missing.
	 */
	baseId?: string;
	url: string;
	title: string;
	icon: string;
	state: WindowState;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * The user's saved desktop session — open windows, focused id, last-write
 * timestamp. Restored by the shell on load; written back debounced.
 */
export interface Session {
	windows: SessionWindow[];
	focused: string;
	updated: number;
}

/**
 * Desktop shell configuration passed from PHP via wp_localize_script.
 */
export interface DesktopConfig {
	/** The current admin page URL (to auto-open in the first window). */
	currentPage: string;
	/** The current admin page title. */
	currentTitle: string;
	/** The current admin page icon class. */
	currentIcon: string;
	/** Base admin URL (e.g., 'http://localhost:8889/wp-admin/'). */
	adminUrl: string;
	/** The active color scheme slug. */
	colorScheme: string;
	/** Dock items derived from the admin menu. */
	dockItems: DockItemConfig[];
	/** Previously saved session (may be empty on first run). */
	session: Session;
	/** REST endpoint for reading/writing the session. */
	sessionUrl: string;
	/** Nonce for the REST endpoint (X-WP-Nonce header). */
	restNonce: string;
	/** Canonical `/wp-desktop/` URL — used for history.replaceState. */
	portalUrl: string;
	/** True when the shell was reached via the portal redirect. */
	fromPortal: boolean;
}

/**
 * Bridge events sent from iframe to parent shell.
 */
export type BridgeEventFromIframe =
	| { type: 'wp-desktop-title-change'; title: string }
	| { type: 'wp-desktop-navigate'; url: string; target: 'self' | 'new' }
	| { type: 'wp-desktop-notification'; title: string; body: string }
	| { type: 'wp-desktop-ready' }
	| { type: 'wp-desktop-screen-meta'; panels: ( 'screen-options' | 'help' )[] }
	| { type: 'wp-desktop-screen-meta-state'; open: 'screen-options' | 'help' | null };

/**
 * Bridge events sent from parent shell to iframe.
 */
export type BridgeEventToIframe =
	| { type: 'wp-desktop-focus' }
	| { type: 'wp-desktop-color-scheme'; scheme: string }
	| { type: 'wp-desktop-toggle-panel'; panel: 'screen-options' | 'help' };
