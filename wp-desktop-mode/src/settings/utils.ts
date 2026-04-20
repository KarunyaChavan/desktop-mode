/**
 * Pure utility helpers for the OS Settings module.
 *
 * Kept dependency-free — no DOM side effects (except `stripHtml` which
 * needs a throwaway element) and no imports from other settings modules.
 */

import type { MediaItem } from './types';

/** Narrow an unknown value to a Promise. */
export function isPromise<T>( value: unknown ): value is Promise<T> {
	return (
		!! value &&
		typeof value === 'object' &&
		typeof ( value as { then?: unknown } ).then === 'function'
	);
}

/** True for strings shaped like `#abc` / `#aabbcc` / `#aabbccff`. */
export function isHexColor( value: unknown ): boolean {
	return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test( value );
}

/**
 * Produce a safe filename for the Content-Disposition header on upload.
 * Replaces any char outside `[A-Za-z0-9._-]` with a single dash; trims
 * leading/trailing dashes; falls back to `wallpaper` if everything got
 * stripped.
 */
export function sanitizeFilename( name: string ): string {
	const cleaned = name.replace( /[^a-zA-Z0-9._-]+/g, '-' ).replace( /^-+|-+$/g, '' );
	return cleaned || 'wallpaper';
}

/**
 * Sanity-check a REST media item before showing it in the picker.
 * Drops entries that are missing a URL, an id, or have zero-sized
 * media_details (usually broken uploads).
 */
export function isUsableImage( item: MediaItem ): boolean {
	if ( ! item || typeof item.id !== 'number' || ! item.source_url ) {
		return false;
	}
	const d = item.media_details;
	return (
		!! d &&
		typeof d.width === 'number' &&
		typeof d.height === 'number' &&
		d.width > 0 &&
		d.height > 0
	);
}

/**
 * Strip HTML tags from a string via a throwaway `<div>`. Used to produce
 * a plain-text alt/title from REST `title.rendered` values that may
 * contain entities or inline tags.
 */
export function stripHtml( markup: string ): string {
	if ( ! markup ) {
		return '';
	}
	const el = document.createElement( 'div' );
	el.innerHTML = markup;
	return el.textContent?.trim() || '';
}
