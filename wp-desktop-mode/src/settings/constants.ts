/**
 * Constants for the OS Settings module.
 *
 * Kept plain (no i18n) so they can be imported from anywhere —
 * including files that shouldn't pull `@wordpress/i18n` into their
 * dependency graph.
 */

import type { OsSettingsState } from './types';

/** localStorage key under which preferences are serialized. */
export const STORAGE_KEY = 'wp-desktop-os-settings';

/** Minimum resolution considered "HD" for the wallpaper picker filter. */
export const HD_MIN_WIDTH = 1920;
export const HD_MIN_HEIGHT = 1080;

/** How many media items we ask the REST endpoint for per page. */
export const MEDIA_PER_PAGE = 40;

/** Debounce window for the library search input. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Built-in wallpaper id for the custom-gradient editor. */
export const CUSTOM_GRADIENT_ID = 'custom-gradient';

/** Built-in wallpaper id for uploaded/library-picked images. */
export const CUSTOM_IMAGE_ID = 'custom-image';

/** Default fallback id when a registered wallpaper isn't available. */
export const DEFAULT_WALLPAPER_ID = 'dark';

/** Accent swatches. Applied to `--wp-admin-theme-color`. */
export const ACCENTS = [
	{ id: 'wp-blue', label: 'WordPress Blue', value: '#2271b1' },
	{ id: 'indigo', label: 'Indigo', value: '#3858e9' },
	{ id: 'teal', label: 'Teal', value: '#04a4cc' },
	{ id: 'emerald', label: 'Emerald', value: '#059669' },
	{ id: 'amber', label: 'Amber', value: '#d97706' },
	{ id: 'rose', label: 'Rose', value: '#e11d48' },
] as const;

/** Dock-size options. Each ships a width in px + icon scale. */
export const DOCK_SIZES = [
	{ id: 'compact', label: 'Compact', width: 48, icon: 18 },
	{ id: 'default', label: 'Default', width: 56, icon: 20 },
	{ id: 'large', label: 'Large', width: 72, icon: 26 },
] as const;

export const DEFAULTS: OsSettingsState = {
	wallpaper: DEFAULT_WALLPAPER_ID,
	accent: 'wp-blue',
	dockSize: 'default',
	customGradient: {
		from: '#2271b1',
		to: '#7c3aed',
		angle: 135,
	},
	customImage: null,
	libraryHdOnly: true,
};
