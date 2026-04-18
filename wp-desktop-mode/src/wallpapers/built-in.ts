/**
 * Desktop Mode — Built-in wallpaper presets.
 *
 * The five static gradient / solid presets that ship with the plugin,
 * registered via the same public API third-party plugins would use.
 * This is the dogfooding contract: if the registry is expressive
 * enough to power our own wallpapers, it's expressive enough for
 * plugins.
 *
 * Note that custom-gradient and custom-image aren't here — they
 * carry their own in-panel editors plus persisted user state that
 * lives in OS Settings. Custom-gradient will migrate to this file
 * (as a def with `renderEditor`) once the settings refactor lands;
 * custom-image stays in `settings.ts` for v1 while its multi-tab
 * upload + library UI gets generalized for the `renderEditor` API
 * in a follow-up.
 *
 * @since 0.6.0
 */

import { register } from './registry';

/** Preset ids kept in a stable order — matches the order in OS Settings. */
export const BUILT_IN_PRESET_IDS = [
	'dark',
	'aurora',
	'sunset',
	'forest',
	'mono',
] as const;

export type BuiltInPresetId = ( typeof BUILT_IN_PRESET_IDS )[ number ];

interface Preset {
	id: BuiltInPresetId;
	label: string;
	value: string;
}

const PRESETS: Preset[] = [
	{
		id: 'dark',
		label: 'Graphite',
		value: 'linear-gradient(135deg, #1d2327 0%, #2c3338 50%, #1d2327 100%)',
	},
	{
		id: 'aurora',
		label: 'Aurora',
		value: 'linear-gradient(135deg, #1a2980 0%, #26d0ce 100%)',
	},
	{
		id: 'sunset',
		label: 'Sunset',
		value: 'linear-gradient(135deg, #ff512f 0%, #dd2476 100%)',
	},
	{
		id: 'forest',
		label: 'Forest',
		value: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
	},
	{
		id: 'mono',
		label: 'Mono',
		value: '#1d2327',
	},
];

/**
 * Register all built-in presets with the wallpaper registry.
 *
 * Called once from the shell boot — ordering matters only in that
 * built-ins register before `wp-desktop.init` fires, so plugins
 * hooking into the `wp-desktop.wallpapers` filter see the full
 * seed list.
 */
export function registerBuiltInWallpapers(): void {
	for ( const p of PRESETS ) {
		register( {
			id: p.id,
			label: p.label,
			type: 'css',
			value: p.value,
			preview: p.value,
		} );
	}
}
