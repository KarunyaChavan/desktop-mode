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
