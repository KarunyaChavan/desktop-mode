/**
 * Desktop Mode — WordPress-style hooks bridge.
 *
 * The shell exposes extension points as `@wordpress/hooks` filters and
 * actions under the `wp-desktop.*` namespace. This file is a thin,
 * typed wrapper around `window.wp.hooks` — we depend on the standard
 * WordPress `wp-hooks` script handle via {@see includes/assets.php}
 * rather than bundling our own primitive, so third-party plugin
 * authors use the exact API they already know from Gutenberg.
 *
 * The module throws a readable error if `wp.hooks` is missing: in the
 * WordPress admin the script handle is registered core-side and listed
 * as a dependency of `wp-desktop`, so the failure mode is limited to
 * broken manual enqueues or unusual embeds.
 *
 * @since 0.6.0
 */

/**
 * Minimal structural type for the `@wordpress/hooks` API surface we
 * actually use. The real module ships a much larger API (priorities,
 * runtime removal, private namespaces) that plugins can still reach
 * via `window.wp.hooks` directly — the exports here are just the
 * idiomatic subset.
 */
export interface WpHooks {
	addFilter: (
		hookName: string,
		namespace: string,
		callback: ( ...args: unknown[] ) => unknown,
		priority?: number
	) => void;
	addAction: (
		hookName: string,
		namespace: string,
		callback: ( ...args: unknown[] ) => void,
		priority?: number
	) => void;
	removeFilter: ( hookName: string, namespace: string ) => number;
	removeAction: ( hookName: string, namespace: string ) => number;
	applyFilters: ( hookName: string, value: unknown, ...args: unknown[] ) => unknown;
	doAction: ( hookName: string, ...args: unknown[] ) => void;
	didAction: ( hookName: string ) => number;
	didFilter: ( hookName: string ) => number;
	hasAction: ( hookName: string, namespace?: string ) => boolean | number;
	hasFilter: ( hookName: string, namespace?: string ) => boolean | number;
}

/**
 * Merged `window.wp` namespace. Each module that contributes to
 * `window.wp.*` extends this interface via declaration merging —
 * hooks.ts adds `hooks`, desktop.ts adds `desktop`, and so on.
 * TypeScript merges all such declarations into a single type.
 */
declare global {
	interface WpGlobal {
		hooks?: WpHooks;
	}
	interface Window {
		wp?: WpGlobal;
	}
}

/**
 * Resolve the global `wp.hooks` object or throw with an actionable
 * message. Kept as a function (not a top-level constant) so the error
 * only fires when something actually tries to hook — imports of this
 * module don't side-effect.
 */
function getWpHooks(): WpHooks {
	const hooks = window.wp?.hooks;
	if ( ! hooks ) {
		throw new Error(
			'[wp-desktop-mode] `window.wp.hooks` is not available. The ' +
				'plugin declares `wp-hooks` as a script dependency; if ' +
				'you are seeing this error, verify the enqueue order.',
		);
	}
	return hooks;
}

/**
 * Typed wrappers. Each preserves the full WP signature (name,
 * namespace, callback, optional priority) but narrows the generic
 * types for our common cases.
 */
export function addFilter<TValue, TArgs extends unknown[] = unknown[]>(
	hookName: string,
	namespace: string,
	callback: ( value: TValue, ...args: TArgs ) => TValue,
	priority?: number,
): void {
	getWpHooks().addFilter(
		hookName,
		namespace,
		callback as ( ...args: unknown[] ) => unknown,
		priority,
	);
}

export function addAction<TArgs extends unknown[] = unknown[]>(
	hookName: string,
	namespace: string,
	callback: ( ...args: TArgs ) => void,
	priority?: number,
): void {
	getWpHooks().addAction(
		hookName,
		namespace,
		callback as ( ...args: unknown[] ) => void,
		priority,
	);
}

export function applyFilters<TValue, TArgs extends unknown[] = unknown[]>(
	hookName: string,
	value: TValue,
	...args: TArgs
): TValue {
	return getWpHooks().applyFilters( hookName, value, ...args ) as TValue;
}

export function doAction<TArgs extends unknown[] = unknown[]>(
	hookName: string,
	...args: TArgs
): void {
	getWpHooks().doAction( hookName, ...args );
}

export function didAction( hookName: string ): number {
	return getWpHooks().didAction( hookName );
}

/** Direct access to the underlying API — exposed on `wp.desktop.hooks`. */
export function rawHooks(): WpHooks {
	return getWpHooks();
}

/**
 * Hook-name catalog. Centralized so a typo in one consumer becomes a
 * TS error everywhere instead of a silent miss at runtime. Use these
 * constants from TS; plugin authors use the string values directly.
 *
 * @public
 */
export const HOOKS = {
	/** Action, fires once after shell boot; plugins register here. */
	INIT: 'wp-desktop.init',

	/** Filter, receives the wallpaper registry array. */
	WALLPAPERS: 'wp-desktop.wallpapers',
	/** Action before a canvas wallpaper mounts. */
	WALLPAPER_MOUNTING: 'wp-desktop.wallpaper.mounting',
	/** Action after a canvas wallpaper mounts successfully. */
	WALLPAPER_MOUNTED: 'wp-desktop.wallpaper.mounted',
	/** Action before a canvas wallpaper tears down. */
	WALLPAPER_UNMOUNTING: 'wp-desktop.wallpaper.unmounting',
	/** Action when a canvas wallpaper's mount throws / rejects. */
	WALLPAPER_MOUNT_FAILED: 'wp-desktop.wallpaper.mount-failed',
	/** Action mirroring document.visibilitychange for active canvas wallpapers. */
	WALLPAPER_VISIBILITY: 'wp-desktop.wallpaper.visibility',

	// ------------------------------------------------------------------
	// Window lifecycle actions. All payloads share a `windowId: string`
	// field; additional fields are documented per-hook in the JS
	// reference. These mirror the existing `wp-desktop-window-*`
	// CustomEvents but ship under the hook bus so plugins can use one
	// idiomatic API for everything the shell emits.
	// ------------------------------------------------------------------
	/** Action, fires when a window is added to the stack. */
	WINDOW_OPENED: 'wp-desktop.window.opened',
	/** Action, fires when a window is removed from the stack. */
	WINDOW_CLOSED: 'wp-desktop.window.closed',
	/** Action, fires when focus changes to a different window. */
	WINDOW_FOCUSED: 'wp-desktop.window.focused',
	/** Action, fires when a window is minimized. */
	WINDOW_MINIMIZED: 'wp-desktop.window.minimized',
	/** Action, fires when a window is restored from minimized. */
	WINDOW_RESTORED: 'wp-desktop.window.restored',
	/** Action, fires when a window is maximized (fills desktop area). */
	WINDOW_MAXIMIZED: 'wp-desktop.window.maximized',
	/** Action, fires when a window exits maximized state. */
	WINDOW_UNMAXIMIZED: 'wp-desktop.window.unmaximized',
	/** Action, fires when a window enters fullscreen / focus mode. */
	WINDOW_FULLSCREEN_ENTERED: 'wp-desktop.window.fullscreen-entered',
	/** Action, fires when a window exits fullscreen / focus mode. */
	WINDOW_FULLSCREEN_EXITED: 'wp-desktop.window.fullscreen-exited',
	/** Action, fires at drag-end with the final `{ x, y }` position. */
	WINDOW_MOVED: 'wp-desktop.window.moved',
	/** Action, fires at resize-end with the final `{ width, height }`. */
	WINDOW_RESIZED: 'wp-desktop.window.resized',
	/** Action, fires when title-bar drag begins. */
	WINDOW_DRAG_START: 'wp-desktop.window.drag-start',
	/** Action, fires when title-bar drag ends. Payload mirrors WINDOW_MOVED. */
	WINDOW_DRAG_END: 'wp-desktop.window.drag-end',
	/** Action, fires when the resize handle is first pressed. */
	WINDOW_RESIZE_START: 'wp-desktop.window.resize-start',
	/** Action, fires when resize completes. Payload mirrors WINDOW_RESIZED. */
	WINDOW_RESIZE_END: 'wp-desktop.window.resize-end',
	/** Action, fires when the user "detaches" a window to a classic tab. */
	WINDOW_DETACHED: 'wp-desktop.window.detached',
	/** Action, fires when iframe title updates change the window title. */
	WINDOW_TITLE_CHANGED: 'wp-desktop.window.title-changed',

	// ------------------------------------------------------------------
	// Shell-level lifecycle actions.
	// ------------------------------------------------------------------
	/**
	 * Action, fires (debounced) after the browser viewport stops
	 * resizing. Payload `{ width, height }` describes the shell's
	 * bounding rect — plugins that render canvas-driven UIs hook here
	 * to adjust their render surface.
	 */
	SHELL_RESIZED: 'wp-desktop.shell.resized',
	/**
	 * Action mirroring `document.visibilitychange` for the shell as a
	 * whole. Payload `{ state: 'visible' | 'hidden' }`. Different from
	 * the wallpaper-specific visibility action in that it fires
	 * regardless of which wallpaper (if any) is active.
	 */
	SHELL_VISIBILITY: 'wp-desktop.shell.visibility',
} as const;

/**
 * Convenience: run `cb` after `wp-desktop.init` has fired, either
 * immediately (if it already did) or on the next firing. Mirrors the
 * ergonomics of `jQuery(document).ready()` but for our own init
 * signal — a late-enqueued plugin script doesn't miss the boat.
 */
export function whenReady( cb: () => void ): void {
	if ( didAction( HOOKS.INIT ) > 0 ) {
		// Schedule on the microtask queue so callers observe consistent
		// async behavior regardless of ordering.
		Promise.resolve().then( cb );
		return;
	}
	addAction( HOOKS.INIT, 'wp-desktop-mode/when-ready', cb );
}
