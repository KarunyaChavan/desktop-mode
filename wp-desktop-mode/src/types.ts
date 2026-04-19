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
 * A virtual desktop ("Space" in macOS terminology).
 *
 * Each desktop owns its own set of windows. Only one desktop is
 * "active" at a time; the active desktop's windows are visible, every
 * other desktop's windows stay mounted but display-suppressed so
 * switching is instant and doesn't lose iframe state.
 *
 * @public
 */
export interface Desktop {
	/** Unique identifier — `default-1`, `desktop-2`, … */
	id: string;
	/** Human-readable label, shown beneath the overview top-bar tile. */
	label: string;
}

/**
 * Configuration for a desktop window.
 */
export interface WindowConfig {
	/** Unique window identifier, derived from the admin page slug. */
	id: string;
	/**
	 * Virtual-desktop assignment. When omitted on construction, the
	 * window joins the manager's currently active desktop. Mutated by
	 * the manager's switch / close logic when desktops are reorganised.
	 */
	desktopId?: string;
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
	/**
	 * Virtual-desktop assignment. Optional for back-compat with
	 * sessions saved before multi-desktop support — restore falls back
	 * to the active desktop when missing.
	 */
	desktopId?: string;
	url: string;
	title: string;
	icon: string;
	state: WindowState;
	x: number;
	y: number;
	width: number;
	height: number;
	/**
	 * External-link sub-tabs open on this window at save time. Each
	 * carries the URL and display label so the shell can re-add them
	 * via `Window.addExternalTab` on restore. Empty or absent when no
	 * external tabs are open.
	 */
	externalTabs?: { url: string; label: string }[];
}

/**
 * The user's saved desktop session — open windows, focused id, last-write
 * timestamp. Restored by the shell on load; written back debounced.
 *
 * `desktops` + `activeDesktop` are post-multi-desktop additions and
 * carry sane defaults from the server side, so older clients reading
 * a fresh session never miss them.
 */
export interface Session {
	windows: SessionWindow[];
	desktops: Desktop[];
	activeDesktop: string;
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
	/** REST endpoint for media uploads (wp/v2/media). */
	mediaUrl: string;
	/** REST endpoint for saving the default-window preference. */
	defaultWindowUrl: string;
	/**
	 * Current default-window preference.
	 *
	 * - `enabled: true`  — on portal entry with no saved session,
	 *   open the window at `url`. First-run default is Dashboard.
	 * - `enabled: false` — on portal entry with no saved session, do
	 *   NOT auto-open anything. The user gets a clean empty desktop.
	 *   `url` still carries a sensible fallback (typically Dashboard)
	 *   that the portal forwards through at the HTTP layer; the shell
	 *   uses the flag to decide whether to auto-open it.
	 */
	defaultWindow: { enabled: boolean; url: string };
	/** Whether the user has the `upload_files` capability. */
	canUpload: boolean;
	/**
	 * Plugin base URL without trailing slash. Used by the shell to
	 * locate vendor assets (e.g. `${pluginUrl}/assets/vendor/pixi.min.js`)
	 * and by third-party plugin authors who want to build asset URLs
	 * relative to the wp-desktop-mode install.
	 */
	pluginUrl: string;
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
