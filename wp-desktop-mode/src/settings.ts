/**
 * Desktop Mode — OS Settings.
 *
 * Shell-level preferences that live outside WordPress: wallpaper, accent
 * color, dock size. Persisted to localStorage so they survive reloads
 * without a round-trip to the server; applied via the wallpaper layer +
 * CSS custom properties on the desktop shell so every downstream rule
 * (title bars, dock chips, focus rings, window chrome) inherits the new
 * values without per-rule plumbing.
 *
 * As of 0.6.0, wallpapers are registry-driven: built-in presets live in
 * `src/wallpapers/built-in.ts`, third-party plugins register via the
 * public `wp.desktop.registerWallpaper()` / `wp-desktop.wallpapers`
 * filter, and this file is responsible only for
 *
 *   - managing user preference state (current wallpaper id, accent,
 *     dock size, custom-gradient colors/angle, custom-image reference)
 *   - delegating wallpaper application to the WallpaperLayer
 *   - rendering the OS Settings panel UI, iterating the registry to
 *     produce swatches and hosting each selected wallpaper's optional
 *     in-panel editor (`renderEditor`).
 *
 * @since 0.5.0
 */

import type { WallpaperLayer } from './wallpapers/layer';
import type { WallpaperDef, WallpaperTeardown } from './wallpapers/types';
import * as registry from './wallpapers/registry';
import { __, sprintf } from './i18n';
// Side-effect import — registers every <wpd-*> tag with the
// customElements registry so the sections below can just create
// the tags in JS and trust they'll upgrade on connection.
import './ui/components';

/** localStorage key under which preferences are serialized. */
const STORAGE_KEY = 'wp-desktop-os-settings';

/** Minimum resolution considered "HD" for the wallpaper picker filter. */
const HD_MIN_WIDTH = 1920;
const HD_MIN_HEIGHT = 1080;

/** How many media items we ask the REST endpoint for per page. */
const MEDIA_PER_PAGE = 40;

/** Debounce window for the library search input. */
const SEARCH_DEBOUNCE_MS = 300;

/** Built-in wallpaper id for the custom-gradient editor. */
const CUSTOM_GRADIENT_ID = 'custom-gradient';

/** Built-in wallpaper id for uploaded/library-picked images. */
const CUSTOM_IMAGE_ID = 'custom-image';

/** Default fallback id when a registered wallpaper isn't available. */
const DEFAULT_WALLPAPER_ID = 'dark';

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

/**
 * Translate an accent label by id. Keeping the `__()` calls inside a
 * switch — rather than on the const array directly — means the
 * extract-pot pass sees string literals, and the const stays static
 * (no Babel top-level-await oddness). Any accent id we haven't
 * translated explicitly falls back to the English label.
 */
function translateAccentLabel( id: AccentId, fallback: string ): string {
	switch ( id ) {
		case 'wp-blue':
			return __( 'WordPress Blue' );
		case 'indigo':
			return __( 'Indigo' );
		case 'teal':
			return __( 'Teal' );
		case 'emerald':
			return __( 'Emerald' );
		case 'amber':
			return __( 'Amber' );
		case 'rose':
			return __( 'Rose' );
		default:
			return fallback;
	}
}

/** Same pattern for dock size labels. */
function translateDockSizeLabel( id: DockSizeId, fallback: string ): string {
	switch ( id ) {
		case 'compact':
			return __( 'Compact' );
		case 'default':
			return __( 'Default' );
		case 'large':
			return __( 'Large' );
		default:
			return fallback;
	}
}

/** Two endpoints on the gradient, plus an angle in degrees (0–360). */
interface CustomGradient {
	from: string;
	to: string;
	angle: number;
}

/** Uploaded-image wallpaper — both id (for cleanup / re-select) and URL. */
interface CustomImage {
	id: number;
	url: string;
}

/** Shape of the persisted settings. Defaults merged on load. */
interface OsSettingsState {
	wallpaper: string;
	accent: AccentId;
	dockSize: DockSizeId;
	customGradient: CustomGradient;
	customImage: CustomImage | null;
	/**
	 * Whether the Media Library picker filters out images smaller than
	 * {@link HD_MIN_WIDTH}×{@link HD_MIN_HEIGHT}. Default on — most
	 * smaller images are icons/avatars that look terrible stretched to
	 * cover the desktop.
	 */
	libraryHdOnly: boolean;
}

const DEFAULTS: OsSettingsState = {
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

/**
 * Subset of the REST media item we actually use. `_fields` on the
 * request narrows the payload to match so we're not shipping 60kb of
 * Gutenberg-specific metadata for a picker.
 */
interface MediaItem {
	id: number;
	source_url: string;
	alt_text: string;
	title: { rendered: string };
	media_details: {
		width: number;
		height: number;
		sizes?: Record<
			string,
			{ source_url: string; width: number; height: number } | undefined
		>;
	};
}

/** Config needed to talk to the REST media endpoint. */
export interface OsSettingsConfig {
	mediaUrl: string;
	restNonce: string;
	canUpload: boolean;
}

/**
 * OS Settings controller.
 *
 * Single instance per shell. Owns the persisted state, delegates
 * wallpaper painting to the {@link WallpaperLayer}, and renders the
 * configuration panel into a native window's body on demand.
 */
export class OsSettings {
	private state: OsSettingsState;
	private config: OsSettingsConfig;
	private layer: WallpaperLayer;

	/**
	 * Teardown for whichever wallpaper's `renderEditor` is currently
	 * mounted in the OS Settings panel. Null when no editor is active.
	 */
	private activeEditorTeardown: WallpaperTeardown | null = null;

	constructor( config: OsSettingsConfig, layer: WallpaperLayer ) {
		this.config = config;
		this.layer = layer;
		this.state = this.load();

		// Built-in dynamic wallpapers — registered here rather than in
		// `built-in.ts` because their `resolveValue` and `renderEditor`
		// close over state that lives on this instance.
		this.registerCustomGradient();
		this.registerCustomImageIfPresent();
	}

	/**
	 * Apply the current state: wallpaper via the layer, accent + dock
	 * size as CSS custom properties on the shell.
	 *
	 * Safe to call repeatedly — calls into `layer.apply` dedupe via
	 * generation counter; CSS property writes are idempotent.
	 */
	public apply(): void {
		const shell = document.getElementById( 'wp-desktop-shell' );
		if ( ! shell ) {
			return;
		}

		// Wallpaper — look up in the registry. Fall back to the default
		// id if the saved wallpaper was registered by a plugin that's
		// no longer loaded, or if the id was never valid.
		const def = registry.get( this.state.wallpaper ) ||
			registry.get( DEFAULT_WALLPAPER_ID ) ||
			registry.all()[ 0 ];
		if ( def ) {
			this.layer.apply( def );
		}

		const accent = ACCENTS.find( ( a ) => a.id === this.state.accent ) ?? ACCENTS[ 0 ];
		const dockSize = DOCK_SIZES.find( ( d ) => d.id === this.state.dockSize ) ?? DOCK_SIZES[ 1 ];

		// Set on <html> rather than the shell so the cascade reaches
		// siblings of #wp-desktop-shell — specifically the WordPress
		// admin bar, which needs --wp-desktop-dock-width to size its
		// leftmost (W-logo) slot in visual alignment with the dock
		// below it. Shell-scoped variables cascade to shell children
		// only; :root-scoped variables cascade everywhere.
		const root = document.documentElement;
		root.style.setProperty( '--wp-admin-theme-color', accent.value );
		root.style.setProperty( '--wp-desktop-dock-width', `${ dockSize.width }px` );
		root.style.setProperty( '--wp-desktop-dock-icon-size', `${ dockSize.icon }px` );
	}

	/**
	 * Render the settings panel into the given native-window body.
	 *
	 * Builds three sections (wallpaper, accent, dock size) and wires
	 * each to save/apply on change. The panel is a one-shot build per
	 * window open — closing and re-opening renders a fresh tree.
	 */
	public renderPanel( body: HTMLElement ): void {
		// Tear down any editor mounted by a previous render — closing
		// the OS Settings window doesn't necessarily fire our teardown
		// path, so we do it defensively here.
		this.teardownEditor();

		body.classList.add( 'wp-desktop-os-settings' );
		body.innerHTML = '';

		const intro = document.createElement( 'p' );
		intro.className = 'wp-desktop-os-settings__intro';
		intro.textContent = __(
			'Personalize your desktop. Changes apply instantly and are saved to this browser.',
		);
		body.appendChild( intro );

		body.appendChild( this.buildWallpaperSection( body ) );
		body.appendChild( this.buildAccentSection() );
		body.appendChild( this.buildDockSizeSection() );

		const footer = document.createElement( 'div' );
		footer.className = 'wp-desktop-os-settings__footer';

		const reset = document.createElement( 'wpd-button' );
		reset.setAttribute( 'variant', 'ghost' );
		reset.textContent = __( 'Reset to defaults' );
		reset.addEventListener( 'click', () => {
			// Preserve the uploaded image so the user doesn't lose their
			// upload just by resetting theme preferences — the image still
			// lives in Media Library, and it's an easy re-pick.
			const preservedImage = this.state.customImage;
			this.state = { ...DEFAULTS, customImage: preservedImage };
			this.save();
			this.apply();
			this.renderPanel( body );
		} );
		footer.appendChild( reset );
		body.appendChild( footer );
	}

	// ------------------------------------------------------------------
	// Built-in dynamic registrations
	// ------------------------------------------------------------------

	/**
	 * Register the custom-gradient wallpaper. Its CSS value is computed
	 * on every apply from user state (so live edits through the editor
	 * repaint without re-registering), and its renderEditor hosts the
	 * color + angle controls.
	 */
	private registerCustomGradient(): void {
		registry.register( {
			id: CUSTOM_GRADIENT_ID,
			label: __( 'Custom gradient' ),
			type: 'css',
			preview: this.customGradientCss(),
			resolveValue: () => this.customGradientCss(),
			renderEditor: ( container ) => this.renderCustomGradientEditor( container ),
		} );
	}

	/**
	 * Register or update the custom-image wallpaper based on current
	 * state. Called on boot and after every upload/library pick/remove
	 * action so the registry entry tracks `state.customImage`.
	 */
	private registerCustomImageIfPresent(): void {
		if ( ! this.state.customImage ) {
			registry.unregister( CUSTOM_IMAGE_ID );
			return;
		}
		const safeUrl = encodeURI( this.state.customImage.url );
		const value = `url("${ safeUrl }") center/cover no-repeat, #1d2327`;
		registry.register( {
			id: CUSTOM_IMAGE_ID,
			label: __( 'Custom image' ),
			type: 'css',
			value,
			preview: value,
		} );
	}

	// ------------------------------------------------------------------
	// Wallpaper section — registry-driven grid + editor slot + image UI
	// ------------------------------------------------------------------

	private buildWallpaperSection( body: HTMLElement ): HTMLElement {
		const section = document.createElement( 'wpd-section' );
		section.setAttribute( 'heading', __( 'Wallpaper' ) );
		section.setAttribute(
			'description',
			__(
				'The backdrop behind your windows. Pick a preset, mix your own gradient, or drop in an image.',
			),
		);

		// Swatch grid — every registered wallpaper EXCEPT custom-image,
		// which has its own dedicated upload/library UI below.
		const grid = document.createElement( 'div' );
		grid.className = 'wp-desktop-os-settings__grid wp-desktop-os-settings__grid--wallpapers';

		// Editor slot: a stable DOM position where the currently-
		// selected wallpaper's `renderEditor` output lives. Uses the
		// same `data-expanded` collapsing pattern the old gradient
		// editor used (CSS animates grid-template-rows 0fr ↔ 1fr).
		const editorSlot = document.createElement( 'div' );
		editorSlot.className = 'wp-desktop-os-settings__editor-slot';
		editorSlot.dataset.expanded = 'false';
		const editorInner = document.createElement( 'div' );
		editorInner.className = 'wp-desktop-os-settings__editor-slot-inner';
		editorSlot.appendChild( editorInner );

		const onSelect = ( def: WallpaperDef ): void => {
			this.selectWallpaper( def.id, body );
			this.syncEditorSlot( editorSlot, editorInner, def );
		};

		for ( const def of registry.all() ) {
			if ( def.id === CUSTOM_IMAGE_ID ) {
				// The upload/library UI below is the authoritative
				// surface for custom-image; don't double up a swatch.
				continue;
			}
			grid.appendChild( this.buildWallpaperSwatch( def, () => onSelect( def ) ) );
		}

		section.appendChild( grid );

		// Initial editor state — mount the editor for the active
		// wallpaper before the section enters the live DOM so the
		// expansion doesn't animate on panel open.
		const active = registry.get( this.state.wallpaper );
		if ( active ) {
			this.syncEditorSlot( editorSlot, editorInner, active );
		}
		section.appendChild( editorSlot );

		// Custom-image tabbed section — stays special-cased for v1
		// (multi-pane upload + library UI isn't a natural fit for the
		// single-container `renderEditor` contract yet).
		section.appendChild( this.buildCustomImageSection( body ) );

		return section;
	}

	private buildWallpaperSwatch(
		def: WallpaperDef,
		onClick: () => void,
	): HTMLElement {
		const swatch = document.createElement( 'wpd-swatch' );
		swatch.setAttribute( 'value', def.id );
		swatch.setAttribute( 'label', def.label );
		swatch.setAttribute( 'preview', def.preview );
		swatch.setAttribute( 'variant', 'wallpaper' );
		// `data-wallpaper-id` kept so `syncGradientPreviewSwatch()`
		// can locate the custom-gradient tile when the editor's
		// colors change.
		swatch.dataset.wallpaperId = def.id;
		if ( this.state.wallpaper === def.id ) {
			swatch.setAttribute( 'selected', '' );
		}

		// Overlay label with the frosted-chip background — slotted so
		// it renders on top of the preview. The outer `.swatch-label`
		// CSS rule still targets this span since slot children stay
		// in light DOM.
		const labelEl = document.createElement( 'span' );
		labelEl.className = 'wp-desktop-os-settings__swatch-label';
		labelEl.textContent = def.label;
		swatch.appendChild( labelEl );

		swatch.addEventListener( 'wpd-pick', onClick );
		return swatch;
	}

	/**
	 * Select a wallpaper by id. Updates state, persists, applies to the
	 * shell, and refreshes the grid's aria-pressed attributes.
	 */
	private selectWallpaper( id: string, body: HTMLElement ): void {
		this.state.wallpaper = id;
		this.save();
		this.apply();
		this.refreshWallpaperPressedState( body );
	}

	private refreshWallpaperPressedState( body: HTMLElement ): void {
		body.querySelectorAll<HTMLElement>( '[data-wallpaper-id]' ).forEach( ( el ) => {
			const selected = el.dataset.wallpaperId === this.state.wallpaper;
			// `<wpd-swatch>` drives its inner aria-pressed from the
			// `selected` host attribute; upload-tile (still hand-
			// rolled for the drag/drop surface) uses aria-pressed
			// directly, so we set both — whichever the element
			// cares about applies.
			if ( selected ) {
				el.setAttribute( 'selected', '' );
			} else {
				el.removeAttribute( 'selected' );
			}
			el.setAttribute( 'aria-pressed', selected ? 'true' : 'false' );
		} );
	}

	/**
	 * Mount the given wallpaper's editor into the editor slot, tearing
	 * down any prior editor first. If the wallpaper has no editor, the
	 * slot collapses.
	 */
	private syncEditorSlot(
		slot: HTMLElement,
		inner: HTMLElement,
		def: WallpaperDef,
	): void {
		this.teardownEditor();
		inner.innerHTML = '';

		if ( ! def.renderEditor ) {
			slot.dataset.expanded = 'false';
			return;
		}

		const ctx = {
			id: def.id,
			pluginUrl: '',
			prefersReducedMotion:
				typeof window.matchMedia === 'function' &&
				window.matchMedia( '( prefers-reduced-motion: reduce )' ).matches,
			visible: ! document.hidden,
		};

		try {
			const result = def.renderEditor( inner, ctx );
			if ( isPromise( result ) ) {
				result.then( ( teardown ) => {
					this.activeEditorTeardown = teardown;
				} );
			} else {
				this.activeEditorTeardown = result;
			}
		} catch ( err ) {
			if ( typeof console !== 'undefined' ) {
				console.error(
					`[wp-desktop-mode] Wallpaper "${ def.id }" renderEditor threw:`,
					err,
				);
			}
		}

		slot.dataset.expanded = 'true';
	}

	private teardownEditor(): void {
		if ( this.activeEditorTeardown ) {
			try {
				this.activeEditorTeardown();
			} catch ( err ) {
				if ( typeof console !== 'undefined' ) {
					console.error(
						'[wp-desktop-mode] Wallpaper editor teardown threw:',
						err,
					);
				}
			}
			this.activeEditorTeardown = null;
		}
	}

	// ------------------------------------------------------------------
	// Custom gradient editor — implements `renderEditor` for the
	// built-in custom-gradient wallpaper. Color + angle inputs write
	// to state; every change updates the swatch preview and re-applies.
	// ------------------------------------------------------------------

	private renderCustomGradientEditor( container: HTMLElement ): WallpaperTeardown {
		container.classList.add( 'wp-desktop-os-settings__gradient-editor-inner' );
		container.innerHTML = '';

		const onGradientChange = (): void => {
			this.save();
			this.apply();
			this.syncGradientPreviewSwatch( container );
		};

		const row = document.createElement( 'div' );
		row.className = 'wp-desktop-os-settings__gradient-row';

		const fromField = document.createElement( 'wpd-color-field' );
		fromField.setAttribute( 'variant', 'block' );
		fromField.setAttribute( 'label', __( 'From' ) );
		fromField.setAttribute( 'value', this.state.customGradient.from );
		fromField.addEventListener( 'wpd-color-change', ( e ) => {
			this.state.customGradient.from = ( e as CustomEvent ).detail.value;
			onGradientChange();
		} );
		row.appendChild( fromField );

		const toField = document.createElement( 'wpd-color-field' );
		toField.setAttribute( 'variant', 'block' );
		toField.setAttribute( 'label', __( 'To' ) );
		toField.setAttribute( 'value', this.state.customGradient.to );
		toField.addEventListener( 'wpd-color-change', ( e ) => {
			this.state.customGradient.to = ( e as CustomEvent ).detail.value;
			onGradientChange();
		} );
		row.appendChild( toField );

		container.appendChild( row );

		const angleField = document.createElement( 'wpd-range-field' );
		angleField.setAttribute( 'label', __( 'Angle' ) );
		angleField.setAttribute( 'min', '0' );
		angleField.setAttribute( 'max', '360' );
		angleField.setAttribute( 'step', '1' );
		angleField.setAttribute( 'suffix', '°' );
		angleField.setAttribute(
			'value',
			String( this.state.customGradient.angle ),
		);
		angleField.addEventListener( 'wpd-range-change', ( e ) => {
			this.state.customGradient.angle = ( e as CustomEvent ).detail.value;
			onGradientChange();
		} );
		container.appendChild( angleField );

		// Empty teardown — the editor holds no long-lived resources
		// (timers, observers) and the container is cleared by the slot.
		return () => { /* noop */ };
	}

	private syncGradientPreviewSwatch( editorEl: HTMLElement ): void {
		// The gradient editor is mounted inside the wallpaper
		// `<wpd-section>`'s slot, alongside the swatch grid. Walking
		// up to the wpd-section and querying for the custom-gradient
		// swatch finds it regardless of DOM shuffles from a future
		// refactor of the wallpaper section's internals.
		const section = editorEl.closest( 'wpd-section' );
		const preview = section?.querySelector<HTMLElement>(
			`[data-wallpaper-id="${ CUSTOM_GRADIENT_ID }"]`,
		);
		if ( preview ) {
			preview.style.background = this.customGradientCss();
		}
	}

	private customGradientCss(): string {
		const { from, to, angle } = this.state.customGradient;
		return `linear-gradient(${ angle }deg, ${ from }, ${ to })`;
	}

	// ------------------------------------------------------------------
	// Custom-image section — upload + library tabs (unchanged from v0.5)
	// ------------------------------------------------------------------

	private buildCustomImageSection( body: HTMLElement ): HTMLElement {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wp-desktop-os-settings__uploader';

		const heading = document.createElement( 'h4' );
		heading.className = 'wp-desktop-os-settings__uploader-heading';
		heading.textContent = __( 'Or use your own image' );
		wrap.appendChild( heading );

		type TabKey = 'upload' | 'library';
		const tabDefs: { key: TabKey; label: string; render: () => void }[] = [];
		const pane = document.createElement( 'div' );
		pane.className = 'wp-desktop-os-settings__tab-pane';

		if ( this.config.canUpload ) {
			tabDefs.push( {
				key: 'upload',
				label: __( 'Upload new' ),
				render: () => this.renderUploadPane( pane, body ),
			} );
		}
		tabDefs.push( {
			key: 'library',
			label: __( 'Media Library' ),
			render: () => this.renderLibraryPane( pane, body ),
		} );

		const initialKey = tabDefs[ 0 ].key;
		const tabsEl = document.createElement( 'wpd-tabs' );
		tabsEl.setAttribute( 'value', initialKey );
		tabsEl.setAttribute( 'label', __( 'Image source' ) );

		for ( const def of tabDefs ) {
			const tab = document.createElement( 'wpd-tab' );
			tab.setAttribute( 'value', def.key );
			tab.textContent = def.label;
			tabsEl.appendChild( tab );
		}

		// Consumer owns pane rendering; wpd-tabs emits the switch
		// event, we route it to the matching renderer.
		tabsEl.addEventListener( 'wpd-tab-change', ( e ) => {
			const key = ( e as CustomEvent ).detail.value as TabKey;
			tabDefs.find( ( t ) => t.key === key )?.render();
		} );

		if ( tabDefs.length > 1 ) {
			wrap.appendChild( tabsEl );
		}
		wrap.appendChild( pane );

		// Paint the initial pane synchronously so the panel doesn't
		// flash empty before the first microtask flush.
		tabDefs.find( ( t ) => t.key === initialKey )?.render();
		return wrap;
	}

	private renderUploadPane( pane: HTMLElement, body: HTMLElement ): void {
		pane.innerHTML = '';

		const tile = document.createElement( 'div' );
		tile.className = 'wp-desktop-os-settings__upload-tile';
		tile.dataset.wallpaperId = CUSTOM_IMAGE_ID;
		tile.setAttribute(
			'aria-pressed',
			this.state.wallpaper === CUSTOM_IMAGE_ID ? 'true' : 'false',
		);

		const fileInput = document.createElement( 'input' );
		fileInput.type = 'file';
		fileInput.accept = 'image/*';
		fileInput.className = 'wp-desktop-os-settings__file-input';
		fileInput.addEventListener( 'change', () => {
			const file = fileInput.files?.[ 0 ];
			if ( file ) {
				void this.handleImageFile( file, tile, body );
			}
			fileInput.value = '';
		} );
		pane.appendChild( fileInput );

		this.renderUploadTile( tile, fileInput, body );
		pane.appendChild( tile );
	}

	private renderLibraryPane( pane: HTMLElement, body: HTMLElement ): void {
		pane.innerHTML = '';

		const library = document.createElement( 'div' );
		library.className = 'wp-desktop-os-settings__library';

		const toolbar = document.createElement( 'div' );
		toolbar.className = 'wp-desktop-os-settings__library-toolbar';

		const search = document.createElement( 'input' );
		search.type = 'search';
		search.placeholder = __( 'Search your media' );
		search.className = 'wp-desktop-os-settings__library-search';
		search.setAttribute( 'aria-label', __( 'Search media' ) );
		toolbar.appendChild( search );

		const hdToggle = document.createElement( 'wpd-checkbox-label' );
		hdToggle.setAttribute(
			'label',
			sprintf(
				// translators: %1$d is the HD minimum width in px, %2$d is the minimum height.
				__( 'Only HD (≥%1$d×%2$d)' ),
				HD_MIN_WIDTH,
				HD_MIN_HEIGHT,
			),
		);
		if ( this.state.libraryHdOnly ) {
			hdToggle.setAttribute( 'checked', '' );
		}
		toolbar.appendChild( hdToggle );

		library.appendChild( toolbar );

		const grid = document.createElement( 'div' );
		grid.className = 'wp-desktop-os-settings__library-grid';
		library.appendChild( grid );

		const footer = document.createElement( 'div' );
		footer.className = 'wp-desktop-os-settings__library-footer';
		const meta = document.createElement( 'span' );
		meta.className = 'wp-desktop-os-settings__library-meta';
		footer.appendChild( meta );
		const loadMore = document.createElement( 'wpd-button' );
		loadMore.setAttribute( 'variant', 'ghost' );
		loadMore.textContent = __( 'Load more' );
		footer.appendChild( loadMore );
		library.appendChild( footer );

		pane.appendChild( library );

		let query = '';
		let page = 0;
		let totalPages = 0;
		let loaded: MediaItem[] = [];
		let hiddenByHd = 0;
		let loading = false;

		const updateMeta = (): void => {
			const visible = this.visibleLibraryItems( loaded ).length;
			const parts = [
				// translators: %d is the number of media items currently visible.
				sprintf( __( 'Showing %d' ), visible ),
			];
			if ( this.state.libraryHdOnly && hiddenByHd > 0 ) {
				parts.push(
					// translators: %d is the number of images filtered out by the HD toggle.
					sprintf( __( '%d hidden by HD filter' ), hiddenByHd ),
				);
			}
			meta.textContent = parts.join( ' · ' );
			// hidden applies to any HTMLElement; `disabled` is a
			// wpd-button prop that maps to the inner <button>'s
			// disabled attribute via the component's render.
			loadMore.hidden = page >= totalPages;
			if ( loading ) {
				loadMore.setAttribute( 'disabled', '' );
			} else {
				loadMore.removeAttribute( 'disabled' );
			}
		};

		const renderGrid = (): void => {
			grid.innerHTML = '';
			const visible = this.visibleLibraryItems( loaded );
			hiddenByHd = loaded.length - visible.length;

			if ( visible.length === 0 && ! loading ) {
				const empty = document.createElement( 'p' );
				empty.className = 'wp-desktop-os-settings__library-empty';
				if ( this.state.libraryHdOnly ) {
					empty.textContent = __(
						'No HD images found. Try unchecking the filter, or upload a larger image.',
					);
				} else {
					empty.textContent = __( 'No images in your Media Library yet.' );
				}
				grid.appendChild( empty );
			} else {
				for ( const item of visible ) {
					grid.appendChild( this.buildLibraryTile( item, body ) );
				}
			}
			updateMeta();
		};

		const loadNextPage = async (): Promise<void> => {
			if ( loading || ( totalPages > 0 && page >= totalPages ) ) {
				return;
			}
			loading = true;
			updateMeta();

			if ( page === 0 ) {
				grid.innerHTML = '';
				for ( let i = 0; i < 8; i++ ) {
					const sk = document.createElement( 'div' );
					sk.className = 'wp-desktop-os-settings__library-tile wp-desktop-os-settings__library-tile--skeleton';
					grid.appendChild( sk );
				}
			}

			try {
				const result = await this.fetchMediaPage( page + 1, query );
				page = page + 1;
				totalPages = result.totalPages;
				loaded = loaded.concat( result.items );
				renderGrid();
			} catch ( err ) {
				grid.innerHTML = '';
				const errMsg = document.createElement( 'p' );
				errMsg.className = 'wp-desktop-os-settings__library-error';
				if ( err instanceof Error ) {
					errMsg.textContent = sprintf(
						// translators: %s is the browser-supplied error message.
						__( 'Couldn’t load your media: %s' ),
						err.message,
					);
				} else {
					errMsg.textContent = __( 'Couldn’t load your media.' );
				}
				grid.appendChild( errMsg );
			} finally {
				loading = false;
				updateMeta();
			}
		};

		const resetAndReload = (): void => {
			page = 0;
			totalPages = 0;
			loaded = [];
			hiddenByHd = 0;
			void loadNextPage();
		};

		let searchTimer: number | null = null;
		search.addEventListener( 'input', () => {
			if ( searchTimer !== null ) {
				window.clearTimeout( searchTimer );
			}
			searchTimer = window.setTimeout( () => {
				searchTimer = null;
				query = search.value.trim();
				resetAndReload();
			}, SEARCH_DEBOUNCE_MS ) as unknown as number;
		} );

		hdToggle.addEventListener( 'wpd-checkbox-change', ( e ) => {
			this.state.libraryHdOnly = ( e as CustomEvent ).detail.checked;
			this.save();
			resetAndReload();
		} );

		loadMore.addEventListener( 'click', () => {
			void loadNextPage();
		} );

		void loadNextPage();
	}

	private visibleLibraryItems( items: MediaItem[] ): MediaItem[] {
		if ( ! this.state.libraryHdOnly ) {
			return items;
		}
		return items.filter(
			( it ) =>
				it.media_details.width >= HD_MIN_WIDTH &&
				it.media_details.height >= HD_MIN_HEIGHT,
		);
	}

	private buildLibraryTile( item: MediaItem, body: HTMLElement ): HTMLElement {
		const tile = document.createElement( 'button' );
		tile.type = 'button';
		tile.className = 'wp-desktop-os-settings__library-tile';
		tile.dataset.mediaId = String( item.id );

		const isSelected =
			this.state.wallpaper === CUSTOM_IMAGE_ID &&
			this.state.customImage?.id === item.id;
		tile.setAttribute( 'aria-pressed', isSelected ? 'true' : 'false' );
		if ( isSelected ) {
			tile.classList.add( 'wp-desktop-os-settings__library-tile--selected' );
		}

		const sizes = item.media_details.sizes || {};
		const thumbUrl =
			sizes.medium?.source_url ||
			sizes.thumbnail?.source_url ||
			sizes.large?.source_url ||
			item.source_url;

		tile.style.backgroundImage = `url("${ encodeURI( thumbUrl ) }")`;

		const dims = document.createElement( 'span' );
		dims.className = 'wp-desktop-os-settings__library-tile-dims';
		dims.textContent = `${ item.media_details.width }×${ item.media_details.height }`;
		tile.appendChild( dims );

		const altOrTitle =
			item.alt_text ||
			stripHtml( item.title?.rendered || '' ) ||
			`Image #${ item.id }`;
		tile.setAttribute( 'aria-label', altOrTitle );
		tile.title = altOrTitle;

		tile.addEventListener( 'click', () => {
			this.state.customImage = { id: item.id, url: item.source_url };
			this.state.wallpaper = CUSTOM_IMAGE_ID;
			this.registerCustomImageIfPresent();
			this.save();
			this.apply();
			this.refreshWallpaperPressedState( body );
			const grid = tile.parentElement;
			if ( grid ) {
				grid.querySelectorAll<HTMLElement>( '[data-media-id]' ).forEach( ( el ) => {
					const selected = el.dataset.mediaId === String( item.id );
					el.setAttribute( 'aria-pressed', selected ? 'true' : 'false' );
					el.classList.toggle(
						'wp-desktop-os-settings__library-tile--selected',
						selected,
					);
				} );
			}
		} );

		return tile;
	}

	private async fetchMediaPage(
		page: number,
		search: string,
	): Promise<{ items: MediaItem[]; totalPages: number }> {
		const url = new URL( this.config.mediaUrl );
		url.searchParams.set( 'media_type', 'image' );
		url.searchParams.set( 'per_page', String( MEDIA_PER_PAGE ) );
		url.searchParams.set( 'page', String( page ) );
		url.searchParams.set( 'orderby', 'date' );
		url.searchParams.set( 'order', 'desc' );
		url.searchParams.set(
			'_fields',
			'id,source_url,alt_text,title,media_details',
		);
		if ( search ) {
			url.searchParams.set( 'search', search );
		}
		if ( this.state.libraryHdOnly ) {
			url.searchParams.set( 'wpdm_min_width', String( HD_MIN_WIDTH ) );
			url.searchParams.set( 'wpdm_min_height', String( HD_MIN_HEIGHT ) );
		}

		const response = await fetch( url.toString(), {
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': this.config.restNonce },
		} );

		if ( ! response.ok ) {
			let message = `HTTP ${ response.status }`;
			try {
				const data = ( await response.json() ) as { message?: string };
				if ( data && typeof data.message === 'string' ) {
					message = data.message;
				}
			} catch {
				/* keep status-code fallback */
			}
			throw new Error( message );
		}

		const totalPagesHeader = response.headers.get( 'X-WP-TotalPages' );
		const totalPages = totalPagesHeader ? parseInt( totalPagesHeader, 10 ) : 1;
		const items = ( await response.json() ) as MediaItem[];
		return { items: items.filter( isUsableImage ), totalPages: totalPages || 1 };
	}

	private renderUploadTile(
		tile: HTMLElement,
		fileInput: HTMLInputElement,
		body: HTMLElement,
	): void {
		tile.innerHTML = '';
		tile.classList.remove( 'wp-desktop-os-settings__upload-tile--filled' );
		tile.classList.remove( 'wp-desktop-os-settings__upload-tile--dragover' );
		tile.classList.remove( 'wp-desktop-os-settings__upload-tile--busy' );
		tile.removeAttribute( 'aria-label' );

		if ( this.state.customImage ) {
			tile.classList.add( 'wp-desktop-os-settings__upload-tile--filled' );
			tile.setAttribute( 'aria-label', __( 'Custom image wallpaper' ) );
			tile.style.backgroundImage = `url("${ encodeURI( this.state.customImage.url ) }")`;

			const remove = document.createElement( 'wpd-button' );
			remove.setAttribute( 'variant', 'danger' );
			remove.classList.add( 'wp-desktop-os-settings__upload-remove' );
			remove.setAttribute( 'aria-label', __( 'Remove custom image' ) );
			remove.textContent = __( 'Remove' );
			remove.addEventListener( 'click', ( e ) => {
				e.stopPropagation();
				this.state.customImage = null;
				// If the image was the active wallpaper, fall back to
				// the default preset so the user isn't left with an
				// unreadable blank desktop the moment they hit remove.
				if ( this.state.wallpaper === CUSTOM_IMAGE_ID ) {
					this.state.wallpaper = DEFAULT_WALLPAPER_ID;
				}
				this.registerCustomImageIfPresent();
				this.save();
				this.apply();
				this.renderUploadTile( tile, fileInput, body );
				this.refreshWallpaperPressedState( body );
			} );
			tile.appendChild( remove );
		} else {
			tile.style.backgroundImage = '';
			const inner = document.createElement( 'div' );
			inner.className = 'wp-desktop-os-settings__upload-inner';
			const plus = document.createElement( 'span' );
			plus.className = 'wp-desktop-os-settings__upload-plus';
			plus.setAttribute( 'aria-hidden', 'true' );
			plus.textContent = '+';
			const prompt = document.createElement( 'span' );
			prompt.className = 'wp-desktop-os-settings__upload-prompt';
			prompt.textContent = __( 'Drop an image here, or click to upload' );
			const hint = document.createElement( 'span' );
			hint.className = 'wp-desktop-os-settings__upload-hint';
			hint.textContent = __(
				'JPEG, PNG, or WebP · goes straight to your Media Library',
			);
			inner.appendChild( plus );
			inner.appendChild( prompt );
			inner.appendChild( hint );
			tile.appendChild( inner );
			tile.setAttribute( 'aria-label', __( 'Upload a wallpaper image' ) );
		}

		tile.onclick = () => {
			if ( tile.classList.contains( 'wp-desktop-os-settings__upload-tile--busy' ) ) {
				return;
			}
			if ( this.state.customImage ) {
				this.selectWallpaper( CUSTOM_IMAGE_ID, body );
				return;
			}
			fileInput.click();
		};

		tile.ondragover = ( e ) => {
			e.preventDefault();
			tile.classList.add( 'wp-desktop-os-settings__upload-tile--dragover' );
		};
		tile.ondragleave = () => {
			tile.classList.remove( 'wp-desktop-os-settings__upload-tile--dragover' );
		};
		tile.ondrop = ( e ) => {
			e.preventDefault();
			tile.classList.remove( 'wp-desktop-os-settings__upload-tile--dragover' );
			const file = e.dataTransfer?.files?.[ 0 ];
			if ( file ) {
				void this.handleImageFile( file, tile, body );
			}
		};
	}

	private async handleImageFile(
		file: File,
		tile: HTMLElement,
		body: HTMLElement,
	): Promise<void> {
		if ( ! file.type.startsWith( 'image/' ) ) {
			this.showUploadError( tile, __( 'That file isn’t an image.' ) );
			return;
		}

		tile.classList.add( 'wp-desktop-os-settings__upload-tile--busy' );
		const prevInner = tile.innerHTML;
		tile.innerHTML = '';
		const status = document.createElement( 'span' );
		status.className = 'wp-desktop-os-settings__upload-status';
		status.textContent = __( 'Uploading…' );
		tile.appendChild( status );

		try {
			const media = await this.uploadImage( file );
			this.state.customImage = { id: media.id, url: media.url };
			this.state.wallpaper = CUSTOM_IMAGE_ID;
			this.registerCustomImageIfPresent();
			this.save();
			this.apply();
			const fileInput = tile.parentElement?.querySelector<HTMLInputElement>(
				'.wp-desktop-os-settings__file-input',
			);
			if ( fileInput ) {
				this.renderUploadTile( tile, fileInput, body );
			}
			this.refreshWallpaperPressedState( body );
		} catch ( err ) {
			tile.innerHTML = prevInner;
			tile.classList.remove( 'wp-desktop-os-settings__upload-tile--busy' );
			const message = err instanceof Error ? err.message : __( 'Upload failed.' );
			this.showUploadError( tile, message );
		}
	}

	private showUploadError( tile: HTMLElement, message: string ): void {
		let err = tile.querySelector<HTMLElement>( '.wp-desktop-os-settings__upload-error' );
		if ( ! err ) {
			err = document.createElement( 'span' );
			err.className = 'wp-desktop-os-settings__upload-error';
			err.setAttribute( 'role', 'status' );
			tile.appendChild( err );
		}
		err.textContent = message;
		window.setTimeout( () => {
			err?.remove();
		}, 4000 );
	}

	private async uploadImage( file: File ): Promise<{ id: number; url: string }> {
		const response = await fetch( this.config.mediaUrl, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'X-WP-Nonce': this.config.restNonce,
				'Content-Type': file.type,
				'Content-Disposition': `attachment; filename="${ sanitizeFilename( file.name ) }"`,
			},
			body: file,
		} );

		if ( ! response.ok ) {
			let message = `Upload failed (HTTP ${ response.status }).`;
			try {
				const data = ( await response.json() ) as { message?: string };
				if ( data && typeof data.message === 'string' ) {
					message = data.message;
				}
			} catch {
				/* Response wasn't JSON — stick with the HTTP status. */
			}
			throw new Error( message );
		}

		const data = ( await response.json() ) as {
			id: number;
			source_url: string;
		};
		return { id: data.id, url: data.source_url };
	}

	// ------------------------------------------------------------------
	// Accent + dock-size sections — composed from wpd-ui atoms
	// (<wpd-section>, <wpd-swatch>, <wpd-swatch-grid>, <wpd-segmented>,
	// <wpd-segment>). Previously hand-rolled DOM; the atoms cover the
	// grid layout, selection state, a11y semantics, and event wiring.
	// ------------------------------------------------------------------

	private buildAccentSection(): HTMLElement {
		const section = document.createElement( 'wpd-section' );
		section.setAttribute( 'heading', __( 'Accent color' ) );
		section.setAttribute(
			'description',
			__( 'Used in focused window title bars, buttons, and focus rings.' ),
		);

		const grid = document.createElement( 'wpd-swatch-grid' );
		grid.setAttribute( 'label', __( 'Accent color' ) );
		// Row mode + small circular chips — accents are "pick one
		// of six colors" not "pick a background image," so uniform
		// full-width cells aren't worth the vertical mass.
		grid.setAttribute( 'mode', 'row' );

		for ( const accent of ACCENTS ) {
			const label = translateAccentLabel( accent.id, accent.label );
			const swatch = document.createElement( 'wpd-swatch' );
			swatch.setAttribute( 'value', accent.id );
			swatch.setAttribute( 'label', label );
			swatch.setAttribute( 'preview', accent.value );
			swatch.setAttribute( 'size', 'small' );
			if ( this.state.accent === accent.id ) {
				swatch.setAttribute( 'selected', '' );
			}
			grid.appendChild( swatch );
		}

		// Delegated pick handler — one listener on the grid covers
		// every swatch. The `wpd-pick` event carries `{ value }`.
		grid.addEventListener( 'wpd-pick', ( e ) => {
			const id = ( ( e as CustomEvent ).detail?.value ?? '' ) as string;
			if ( ! ACCENTS.some( ( a ) => a.id === id ) ) {
				return;
			}
			this.state.accent = id as AccentId;
			this.save();
			this.apply();
			// Reflect the new selection by toggling the `selected`
			// attr on each child swatch — the component turns that
			// into its own aria-pressed internally.
			for ( const child of Array.from( grid.children ) ) {
				if ( child.getAttribute( 'value' ) === id ) {
					child.setAttribute( 'selected', '' );
				} else {
					child.removeAttribute( 'selected' );
				}
			}
		} );

		section.appendChild( grid );
		return section;
	}

	private buildDockSizeSection(): HTMLElement {
		const section = document.createElement( 'wpd-section' );
		section.setAttribute( 'heading', __( 'Dock size' ) );
		section.setAttribute(
			'description',
			__( 'Width of the dock and size of its icons.' ),
		);

		const group = document.createElement( 'wpd-segmented' );
		group.setAttribute( 'value', this.state.dockSize );
		group.setAttribute( 'label', __( 'Dock size' ) );

		for ( const size of DOCK_SIZES ) {
			const seg = document.createElement( 'wpd-segment' );
			seg.setAttribute( 'value', size.id );
			seg.textContent = translateDockSizeLabel( size.id, size.label );
			group.appendChild( seg );
		}

		group.addEventListener( 'wpd-pick', ( e ) => {
			const id = ( ( e as CustomEvent ).detail?.value ?? '' ) as string;
			if ( ! DOCK_SIZES.some( ( d ) => d.id === id ) ) {
				return;
			}
			this.state.dockSize = id as DockSizeId;
			this.save();
			this.apply();
			// The segmented group internally flips aria-checked on
			// its child <wpd-segment> elements when its `value` attr
			// changes — no manual reflect needed here.
		} );

		section.appendChild( group );
		return section;
	}

	// ------------------------------------------------------------------
	// Persistence
	// ------------------------------------------------------------------

	private load(): OsSettingsState {
		try {
			const raw = window.localStorage.getItem( STORAGE_KEY );
			if ( ! raw ) {
				return structuredDefaults();
			}
			const parsed = JSON.parse( raw ) as Partial<OsSettingsState>;
			return {
				// `wallpaper` is now any non-empty string — registry
				// membership is validated at apply time rather than
				// here, so a plugin that gets enqueued late still
				// delivers its persisted selection.
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

	private save(): void {
		try {
			window.localStorage.setItem( STORAGE_KEY, JSON.stringify( this.state ) );
		} catch {
			/* Quota or private-mode failure — settings just won't persist. */
		}
	}
}

function structuredDefaults(): OsSettingsState {
	return {
		...DEFAULTS,
		customGradient: { ...DEFAULTS.customGradient },
		customImage: null,
	};
}

function sanitizeCustomGradient( raw: unknown ): CustomGradient {
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

function sanitizeCustomImage( raw: unknown ): CustomImage | null {
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

function isHexColor( value: unknown ): boolean {
	return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test( value );
}

function sanitizeFilename( name: string ): string {
	const cleaned = name.replace( /[^a-zA-Z0-9._-]+/g, '-' ).replace( /^-+|-+$/g, '' );
	return cleaned || 'wallpaper';
}

function isUsableImage( item: MediaItem ): boolean {
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

function stripHtml( html: string ): string {
	if ( ! html ) {
		return '';
	}
	const el = document.createElement( 'div' );
	el.innerHTML = html;
	return el.textContent?.trim() || '';
}

function isPromise<T>( value: unknown ): value is Promise<T> {
	return (
		!! value &&
		typeof value === 'object' &&
		typeof ( value as { then?: unknown } ).then === 'function'
	);
}
