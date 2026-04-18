/**
 * Desktop Mode — OS Settings.
 *
 * Shell-level preferences that live outside WordPress: wallpaper, accent
 * color, dock size. Persisted to localStorage so they survive reloads
 * without a round-trip to the server; applied as CSS custom properties on
 * the desktop shell so every downstream rule (title bars, dock chips,
 * focus rings, window chrome) inherits the new values without any
 * per-rule plumbing.
 *
 * Opens in a native desktop window — no iframe, direct DOM — as the
 * first real customer of the native-window path.
 *
 * @since 0.5.0
 */

/** localStorage key under which preferences are serialized. */
const STORAGE_KEY = 'wp-desktop-os-settings';

/** Available wallpaper presets. Applied to `--wp-desktop-bg`. */
const WALLPAPERS = [
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
] as const;

type WallpaperId = ( typeof WALLPAPERS )[ number ][ 'id' ];

/** Accent swatches. Applied to `--wp-admin-theme-color`. */
const ACCENTS = [
	{ id: 'wp-blue', label: 'WordPress Blue', value: '#2271b1' },
	{ id: 'indigo', label: 'Indigo', value: '#3858e9' },
	{ id: 'teal', label: 'Teal', value: '#04a4cc' },
	{ id: 'emerald', label: 'Emerald', value: '#059669' },
	{ id: 'amber', label: 'Amber', value: '#d97706' },
	{ id: 'rose', label: 'Rose', value: '#e11d48' },
] as const;

type AccentId = ( typeof ACCENTS )[ number ][ 'id' ];

/** Dock-size options. Each ships a width in px + icon scale. */
const DOCK_SIZES = [
	{ id: 'compact', label: 'Compact', width: 48, icon: 18 },
	{ id: 'default', label: 'Default', width: 56, icon: 20 },
	{ id: 'large', label: 'Large', width: 72, icon: 26 },
] as const;

type DockSizeId = ( typeof DOCK_SIZES )[ number ][ 'id' ];

/** Shape of the persisted settings. Defaults merged on load. */
interface OsSettingsState {
	wallpaper: WallpaperId;
	accent: AccentId;
	dockSize: DockSizeId;
}

const DEFAULTS: OsSettingsState = {
	wallpaper: 'dark',
	accent: 'wp-blue',
	dockSize: 'default',
};

/**
 * OS Settings controller.
 *
 * Single instance per shell. Owns the persisted state, applies it to
 * the DOM, and renders the configuration panel into a native window's
 * body when requested.
 */
export class OsSettings {
	private state: OsSettingsState;

	constructor() {
		this.state = this.load();
	}

	/**
	 * Apply the current state to the shell. Safe to call repeatedly —
	 * subsequent calls just reset the same CSS variables.
	 */
	public apply(): void {
		const shell = document.getElementById( 'wp-desktop-shell' );
		if ( ! shell ) {
			return;
		}

		const wallpaper = WALLPAPERS.find( ( w ) => w.id === this.state.wallpaper ) ?? WALLPAPERS[ 0 ];
		const accent = ACCENTS.find( ( a ) => a.id === this.state.accent ) ?? ACCENTS[ 0 ];
		const dockSize = DOCK_SIZES.find( ( d ) => d.id === this.state.dockSize ) ?? DOCK_SIZES[ 1 ];

		shell.style.setProperty( '--wp-desktop-bg', wallpaper.value );
		shell.style.setProperty( '--wp-admin-theme-color', accent.value );
		shell.style.setProperty( '--wp-desktop-dock-width', `${ dockSize.width }px` );
		shell.style.setProperty( '--wp-desktop-dock-icon-size', `${ dockSize.icon }px` );
	}

	/**
	 * Render the settings panel into the given native-window body.
	 *
	 * Builds three pickers (wallpaper, accent, dock size) and wires
	 * each to save/apply on change. The panel is a one-shot build per
	 * window open — closing and re-opening renders a fresh tree.
	 */
	public renderPanel( body: HTMLElement ): void {
		body.classList.add( 'wp-desktop-os-settings' );
		body.innerHTML = '';

		const intro = document.createElement( 'p' );
		intro.className = 'wp-desktop-os-settings__intro';
		intro.textContent = 'Personalize your desktop. Changes apply instantly and are saved to this browser.';
		body.appendChild( intro );

		body.appendChild(
			this.buildWallpaperSection( () => this.apply() )
		);
		body.appendChild(
			this.buildAccentSection( () => this.apply() )
		);
		body.appendChild(
			this.buildDockSizeSection( () => this.apply() )
		);

		const footer = document.createElement( 'div' );
		footer.className = 'wp-desktop-os-settings__footer';

		const reset = document.createElement( 'button' );
		reset.type = 'button';
		reset.className = 'wp-desktop-os-settings__reset';
		reset.textContent = 'Reset to defaults';
		reset.addEventListener( 'click', () => {
			this.state = { ...DEFAULTS };
			this.save();
			this.apply();
			this.renderPanel( body );
		} );
		footer.appendChild( reset );
		body.appendChild( footer );
	}

	/**
	 * Build the wallpaper section — a grid of preview swatches. Clicking
	 * a swatch sets the wallpaper, saves, and fires the apply callback so
	 * the desktop updates live.
	 */
	private buildWallpaperSection( onChange: () => void ): HTMLElement {
		const section = this.buildSection(
			'Wallpaper',
			'The backdrop behind your windows.'
		);
		const grid = document.createElement( 'div' );
		grid.className = 'wp-desktop-os-settings__grid wp-desktop-os-settings__grid--wallpapers';

		for ( const wp of WALLPAPERS ) {
			const btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'wp-desktop-os-settings__swatch wp-desktop-os-settings__swatch--wallpaper';
			btn.setAttribute( 'aria-label', wp.label );
			btn.setAttribute( 'aria-pressed', this.state.wallpaper === wp.id ? 'true' : 'false' );
			btn.dataset.id = wp.id;
			btn.style.background = wp.value;

			const label = document.createElement( 'span' );
			label.className = 'wp-desktop-os-settings__swatch-label';
			label.textContent = wp.label;
			btn.appendChild( label );

			btn.addEventListener( 'click', () => {
				this.state.wallpaper = wp.id;
				this.save();
				onChange();
				this.refreshSelected( grid, wp.id );
			} );
			grid.appendChild( btn );
		}

		section.appendChild( grid );
		return section;
	}

	private buildAccentSection( onChange: () => void ): HTMLElement {
		const section = this.buildSection(
			'Accent color',
			'Used in focused window title bars, buttons, and focus rings.'
		);
		const grid = document.createElement( 'div' );
		grid.className = 'wp-desktop-os-settings__grid wp-desktop-os-settings__grid--accents';

		for ( const accent of ACCENTS ) {
			const btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'wp-desktop-os-settings__swatch wp-desktop-os-settings__swatch--accent';
			btn.setAttribute( 'aria-label', accent.label );
			btn.setAttribute( 'aria-pressed', this.state.accent === accent.id ? 'true' : 'false' );
			btn.dataset.id = accent.id;
			btn.style.background = accent.value;
			btn.title = accent.label;

			btn.addEventListener( 'click', () => {
				this.state.accent = accent.id;
				this.save();
				onChange();
				this.refreshSelected( grid, accent.id );
			} );
			grid.appendChild( btn );
		}

		section.appendChild( grid );
		return section;
	}

	private buildDockSizeSection( onChange: () => void ): HTMLElement {
		const section = this.buildSection(
			'Dock size',
			'Width of the dock and size of its icons.'
		);
		const group = document.createElement( 'div' );
		group.className = 'wp-desktop-os-settings__segmented';
		group.setAttribute( 'role', 'radiogroup' );

		for ( const size of DOCK_SIZES ) {
			const btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'wp-desktop-os-settings__segment';
			btn.setAttribute( 'role', 'radio' );
			btn.setAttribute( 'aria-checked', this.state.dockSize === size.id ? 'true' : 'false' );
			btn.dataset.id = size.id;
			btn.textContent = size.label;

			btn.addEventListener( 'click', () => {
				this.state.dockSize = size.id;
				this.save();
				onChange();
				this.refreshSelected( group, size.id, 'aria-checked' );
			} );
			group.appendChild( btn );
		}

		section.appendChild( group );
		return section;
	}

	/**
	 * Helper: builds a `<section>` wrapper with a heading + description.
	 */
	private buildSection( title: string, description: string ): HTMLElement {
		const section = document.createElement( 'section' );
		section.className = 'wp-desktop-os-settings__section';

		const heading = document.createElement( 'h3' );
		heading.className = 'wp-desktop-os-settings__heading';
		heading.textContent = title;
		section.appendChild( heading );

		const desc = document.createElement( 'p' );
		desc.className = 'wp-desktop-os-settings__desc';
		desc.textContent = description;
		section.appendChild( desc );

		return section;
	}

	/**
	 * Flip the pressed state on whichever button in the group matches the
	 * given id. Extracted so each picker can stay terse.
	 */
	private refreshSelected(
		container: HTMLElement,
		id: string,
		attr: 'aria-pressed' | 'aria-checked' = 'aria-pressed'
	): void {
		container.querySelectorAll<HTMLElement>( '[data-id]' ).forEach( ( el ) => {
			el.setAttribute( attr, el.dataset.id === id ? 'true' : 'false' );
		} );
	}

	/**
	 * Read state from localStorage, merged over defaults. Invalid or
	 * unknown values fall back silently — a user editing their storage
	 * by hand shouldn't brick the panel.
	 */
	private load(): OsSettingsState {
		try {
			const raw = window.localStorage.getItem( STORAGE_KEY );
			if ( ! raw ) {
				return { ...DEFAULTS };
			}
			const parsed = JSON.parse( raw ) as Partial<OsSettingsState>;
			return {
				wallpaper:
					WALLPAPERS.some( ( w ) => w.id === parsed.wallpaper )
						? ( parsed.wallpaper as WallpaperId )
						: DEFAULTS.wallpaper,
				accent:
					ACCENTS.some( ( a ) => a.id === parsed.accent )
						? ( parsed.accent as AccentId )
						: DEFAULTS.accent,
				dockSize:
					DOCK_SIZES.some( ( d ) => d.id === parsed.dockSize )
						? ( parsed.dockSize as DockSizeId )
						: DEFAULTS.dockSize,
			};
		} catch {
			return { ...DEFAULTS };
		}
	}

	private save(): void {
		try {
			window.localStorage.setItem( STORAGE_KEY, JSON.stringify( this.state ) );
		} catch {
			/* Quota or private-mode failure — settings just won't persist. */
		}
	}
}
