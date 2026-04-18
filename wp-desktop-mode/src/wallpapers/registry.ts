/**
 * Desktop Mode — Wallpaper registry.
 *
 * Owns the in-memory list of available wallpapers and applies the
 * `wp-desktop.wallpapers` filter each time callers read it. That
 * means plugins can both register entries via
 * `wp.desktop.registerWallpaper()` (which internally adds a filter)
 * and reach the raw filter API for more exotic operations — reorder,
 * remove, conditionally swap.
 *
 * The registry is intentionally cache-free: every `all()` / `get()`
 * call re-applies the filter. That's fine — the filter chain is
 * shallow (a handful of built-ins plus any plugin additions) and we
 * call `all()` at most on each OS Settings render, not on every
 * window paint.
 *
 * @since 0.6.0
 */

import { applyFilters, HOOKS } from '../hooks';
import type { WallpaperDef } from './types';

/** Internal: the seed list every filter sees. Mutated by `register`. */
const seed: WallpaperDef[] = [];

/**
 * Append a wallpaper to the seed list.
 *
 * Used by the built-in presets (`built-in.ts`) and by the convenience
 * `wp.desktop.registerWallpaper()` wrapper. Third parties can also
 * call this directly, but the recommended entry point is the hook
 * API so plugin identity can be tracked.
 */
export function register( def: WallpaperDef ): void {
	if ( ! isValidDef( def ) ) {
		if ( typeof console !== 'undefined' ) {
			console.warn(
				'[wp-desktop-mode] Ignored invalid wallpaper registration:',
				def,
			);
		}
		return;
	}
	// Replace an existing entry with the same id rather than doubling
	// up. Late registrations win — matches WP's `register_*` semantics
	// where the most recent call owns the final state.
	const idx = seed.findIndex( ( w ) => w.id === def.id );
	if ( idx >= 0 ) {
		seed[ idx ] = def;
	} else {
		seed.push( def );
	}
}

/** Remove a wallpaper by id. Rare, but keeps symmetry with `register`. */
export function unregister( id: string ): void {
	const idx = seed.findIndex( ( w ) => w.id === id );
	if ( idx >= 0 ) {
		seed.splice( idx, 1 );
	}
}

/**
 * Produce the current wallpaper list with the `wp-desktop.wallpapers`
 * filter applied. Plugins that hooked into the filter after load
 * participate automatically; the seed array is copied so filter
 * callbacks can safely mutate their input without corrupting state.
 */
export function all(): WallpaperDef[] {
	const copy = seed.slice();
	const filtered = applyFilters<WallpaperDef[]>( HOOKS.WALLPAPERS, copy );
	// Defensive: a misbehaving filter could return undefined / a
	// non-array. Fall back to the unfiltered seed rather than break
	// the entire OS Settings panel.
	if ( ! Array.isArray( filtered ) ) {
		if ( typeof console !== 'undefined' ) {
			console.warn(
				'[wp-desktop-mode] `wp-desktop.wallpapers` filter ' +
					'returned a non-array; falling back to seed list.',
			);
		}
		return copy;
	}
	// Drop any entries a filter callback mangled into an invalid
	// shape — keeps downstream renders robust against bad plugins.
	return filtered.filter( isValidDef );
}

/** Look up a wallpaper by id, post-filter. */
export function get( id: string ): WallpaperDef | undefined {
	return all().find( ( w ) => w.id === id );
}

/**
 * Minimum-viable validation. Enforces presence of the fields the
 * shell actually relies on. Deeper validation (CSS value parsing,
 * mount function typing) would over-reach — plugin authors are in
 * charge of their own correctness past this boundary.
 */
function isValidDef( def: unknown ): def is WallpaperDef {
	if ( ! def || typeof def !== 'object' ) {
		return false;
	}
	const d = def as Partial<WallpaperDef>;
	if ( typeof d.id !== 'string' || d.id === '' ) {
		return false;
	}
	if ( typeof d.label !== 'string' || d.label === '' ) {
		return false;
	}
	if ( typeof d.preview !== 'string' || d.preview === '' ) {
		return false;
	}
	if ( d.type === 'css' ) {
		return (
			typeof ( d as { value?: unknown } ).value === 'string' ||
			typeof ( d as { resolveValue?: unknown } ).resolveValue === 'function'
		);
	}
	if ( d.type === 'canvas' ) {
		return typeof ( d as { mount?: unknown } ).mount === 'function';
	}
	return false;
}
