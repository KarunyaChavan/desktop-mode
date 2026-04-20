/**
 * Persistence + sanitization for `OsSettingsState`.
 *
 * State lives in localStorage under `STORAGE_KEY`. On read, unknown
 * shapes are coerced to defaults field-by-field — no validation errors
 * are ever surfaced to the user; a corrupt record just restores the
 * defaults on next save.
 */

import { ACCENTS, DEFAULTS, DOCK_SIZES, STORAGE_KEY } from './constants';
import type {
	AccentId,
	CustomGradient,
	CustomImage,
	DockSizeId,
	OsSettingsState,
} from './types';
import { isHexColor } from './utils';

export function loadState(): OsSettingsState {
	try {
		const raw = window.localStorage.getItem( STORAGE_KEY );
		if ( ! raw ) {
			return structuredDefaults();
		}
		const parsed = JSON.parse( raw ) as Partial<OsSettingsState>;
		return {
			// `wallpaper` is now any non-empty string — registry
			// membership is validated at apply time rather than here,
			// so a plugin that gets enqueued late still delivers its
			// persisted selection.
			wallpaper:
				typeof parsed.wallpaper === 'string' && parsed.wallpaper !== ''
					? parsed.wallpaper
					: DEFAULTS.wallpaper,
			accent: ACCENTS.some( ( a ) => a.id === parsed.accent )
				? ( parsed.accent as AccentId )
				: DEFAULTS.accent,
			dockSize: DOCK_SIZES.some( ( d ) => d.id === parsed.dockSize )
				? ( parsed.dockSize as DockSizeId )
				: DEFAULTS.dockSize,
			customGradient: sanitizeCustomGradient( parsed.customGradient ),
			customImage: sanitizeCustomImage( parsed.customImage ),
			libraryHdOnly:
				typeof parsed.libraryHdOnly === 'boolean'
					? parsed.libraryHdOnly
					: DEFAULTS.libraryHdOnly,
		};
	} catch {
		return structuredDefaults();
	}
}

export function saveState( state: OsSettingsState ): void {
	try {
		window.localStorage.setItem( STORAGE_KEY, JSON.stringify( state ) );
	} catch {
		/* Quota or private-mode failure — settings just won't persist. */
	}
}

export function structuredDefaults(): OsSettingsState {
	return {
		...DEFAULTS,
		customGradient: { ...DEFAULTS.customGradient },
		customImage: null,
	};
}

export function sanitizeCustomGradient( raw: unknown ): CustomGradient {
	if ( ! raw || typeof raw !== 'object' ) {
		return { ...DEFAULTS.customGradient };
	}
	const { from, to, angle } = raw as Partial<CustomGradient>;
	return {
		from: isHexColor( from ) ? ( from as string ) : DEFAULTS.customGradient.from,
		to: isHexColor( to ) ? ( to as string ) : DEFAULTS.customGradient.to,
		angle:
			typeof angle === 'number' && Number.isFinite( angle ) && angle >= 0 && angle <= 360
				? angle
				: DEFAULTS.customGradient.angle,
	};
}

export function sanitizeCustomImage( raw: unknown ): CustomImage | null {
	if ( ! raw || typeof raw !== 'object' ) {
		return null;
	}
	const { id, url } = raw as Partial<CustomImage>;
	if ( typeof id !== 'number' || ! Number.isFinite( id ) || id <= 0 ) {
		return null;
	}
	if ( typeof url !== 'string' || ! /^https?:\/\//i.test( url ) ) {
		return null;
	}
	return { id, url };
}
