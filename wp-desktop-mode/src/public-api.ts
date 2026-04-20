/**
 * Desktop Mode — Public API barrel.
 *
 * The single canonical entry point for third-party plugin authors
 * writing TypeScript against the shell. Everything re-exported from
 * here is considered **Stable** unless its doc comment says otherwise:
 * we promise backwards-compatibility within a major version.
 *
 * Anything NOT re-exported from here is shell-internal; its path may
 * change, its shape may change, and its behavior may tighten without
 * notice. If you find yourself reaching into a non-barrel file to get
 * a type or helper that feels author-facing, open an issue — it
 * should either land here or gain a dedicated escape hatch.
 *
 * Usage:
 *
 *   ```ts
 *   import type {
 *     WidgetDef,
 *     WallpaperDef,
 *     WindowConfig,
 *   } from 'wp-desktop-mode';
 *   import { HOOKS } from 'wp-desktop-mode';
 *
 *   wp.desktop.hooks.addAction( HOOKS.WINDOW_OPENED, 'myplugin/track', ( e ) => {
 *     console.log( 'Window opened:', e.windowId );
 *   } );
 *   ```
 *
 * (The `wp-desktop-mode` package name above is aspirational — today
 * plugins are bundled alongside the shell and import relatively. When
 * we publish this as an npm-distributable d.ts bundle, this file is
 * what the `main` field points at.)
 *
 * @since 0.8.2
 */

// ----- Types: windows, desktops, dock, session, config -----

export type {
	Desktop,
	DesktopConfig,
	DockItemConfig,
	Session,
	SessionWindow,
	WindowConfig,
	WindowSnapshot,
	WindowState,
	BridgeEventFromIframe,
	BridgeEventToIframe,
} from './types';

// ----- Types: wallpapers -----

export type {
	CanvasWallpaperDef,
	CssWallpaperDef,
	WallpaperContext,
	WallpaperDef,
	WallpaperEditor,
	WallpaperMountResult,
	WallpaperTeardown,
	WallpapersFilter,
} from './wallpapers/types';

// ----- Types: widgets -----

export type {
	WidgetContext,
	WidgetDef,
	WidgetGeometry,
	WidgetTeardown,
} from './widgets/types';

// ----- Types: modules (vendor-script registry) -----

export type { ModuleDef } from './modules/registry';

// ----- Hooks: typed constants + wrappers -----

/**
 * The canonical list of shell-dispatched hook names. Use these
 * constants instead of hand-typed strings so a renamed hook fails
 * typecheck instead of silently going dead.
 *
 * ```ts
 * wp.desktop.hooks.addAction(
 *     wp.desktop.HOOKS.ARRANGE_CASCADE_APPLIED,
 *     'myplugin/toast',
 *     ({ windowCount }) => toast(`Arranged ${windowCount} windows`)
 * );
 * ```
 */
export { HOOKS } from './hooks';

export type { WpHooks } from './hooks';

/**
 * Typed helpers around `window.wp.hooks`. Most plugins should use
 * the untyped bridge at `wp.hooks` directly — these are for authors
 * who want strict signatures on their callbacks.
 */
export {
	addAction,
	addFilter,
	applyFilters,
	didAction,
	doAction,
	rawHooks,
	whenReady,
} from './hooks';

// ----- Public class types (for plugins that need to type-cast an
// instance returned by `wp.desktop.windowManager` / `.dock`) -----

export type { Window } from './window';
export type { WindowManager } from './window-manager';
export type { Dock } from './dock';
