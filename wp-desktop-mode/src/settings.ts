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
 * first real customer of the native-window path. Custom-image wallpapers
 * round-trip through the REST media endpoint, so Media Library becomes
 * the storage layer for user-uploaded backgrounds for free.
 *
 * @since 0.5.0
 */

/** localStorage key under which preferences are serialized. */
const STORAGE_KEY = 'wp-desktop-os-settings';

/** Minimum resolution considered "HD" for the wallpaper picker filter. */
const HD_MIN_WIDTH = 1920;
const HD_MIN_HEIGHT = 1080;

/** How many media items we ask the REST endpoint for per page. */
const MEDIA_PER_PAGE = 40;

/** Debounce window for the library search input. */
const SEARCH_DEBOUNCE_MS = 300;

/** Built-in wallpaper presets. Custom gradient + image are extra ids. */
const WALLPAPER_PRESETS = [
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

type PresetWallpaperId = ( typeof WALLPAPER_PRESETS )[ number ][ 'id' ];
type WallpaperId = PresetWallpaperId | 'custom-gradient' | 'custom-image';

const ALL_WALLPAPER_IDS: WallpaperId[] = [
	...WALLPAPER_PRESETS.map( ( w ) => w.id ),
	'custom-gradient',
	'custom-image',
];

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
	wallpaper: WallpaperId;
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
	wallpaper: 'dark',
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
 * Single instance per shell. Owns the persisted state, applies it to
 * the DOM, and renders the configuration panel into a native window's
 * body when requested.
 */
export class OsSettings {
	private state: OsSettingsState;
	private config: OsSettingsConfig;

	constructor( config: OsSettingsConfig ) {
		this.config = config;
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

		shell.style.setProperty( '--wp-desktop-bg', this.resolveWallpaperValue() );

		const accent = ACCENTS.find( ( a ) => a.id === this.state.accent ) ?? ACCENTS[ 0 ];
		const dockSize = DOCK_SIZES.find( ( d ) => d.id === this.state.dockSize ) ?? DOCK_SIZES[ 1 ];

		shell.style.setProperty( '--wp-admin-theme-color', accent.value );
		shell.style.setProperty( '--wp-desktop-dock-width', `${ dockSize.width }px` );
		shell.style.setProperty( '--wp-desktop-dock-icon-size', `${ dockSize.icon }px` );
	}

	/**
	 * Compute the current wallpaper's `background` shorthand value.
	 *
	 * Falls back gracefully: custom-gradient uses the stored angle/colors;
	 * custom-image falls back to the first preset if the uploaded image is
	 * missing (e.g. the attachment was deleted from Media Library since
	 * the preference was saved).
	 */
	private resolveWallpaperValue(): string {
		if ( this.state.wallpaper === 'custom-gradient' ) {
			const { from, to, angle } = this.state.customGradient;
			return `linear-gradient(${ angle }deg, ${ from }, ${ to })`;
		}

		if ( this.state.wallpaper === 'custom-image' && this.state.customImage ) {
			// Layered: the image on top, a graphite fallback behind it so a
			// broken URL / slow load degrades to something dark instead of
			// the browser's default white backdrop.
			const safeUrl = encodeURI( this.state.customImage.url );
			return `url("${ safeUrl }") center/cover no-repeat, #1d2327`;
		}

		const preset =
			WALLPAPER_PRESETS.find( ( w ) => w.id === this.state.wallpaper ) ?? WALLPAPER_PRESETS[ 0 ];
		return preset.value;
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
		intro.textContent =
			'Personalize your desktop. Changes apply instantly and are saved to this browser.';
		body.appendChild( intro );

		body.appendChild( this.buildWallpaperSection( body ) );
		body.appendChild( this.buildAccentSection() );
		body.appendChild( this.buildDockSizeSection() );

		const footer = document.createElement( 'div' );
		footer.className = 'wp-desktop-os-settings__footer';

		const reset = document.createElement( 'button' );
		reset.type = 'button';
		reset.className = 'wp-desktop-os-settings__reset';
		reset.textContent = 'Reset to defaults';
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

	/**
	 * Wallpaper section — preset grid, a "Custom gradient" swatch with an
	 * inline editor that only appears when selected, and an image
	 * uploader tile below.
	 */
	private buildWallpaperSection( body: HTMLElement ): HTMLElement {
		const section = this.buildSection(
			'Wallpaper',
			'The backdrop behind your windows. Pick a preset, mix your own gradient, or drop in an image.'
		);
		const grid = document.createElement( 'div' );
		grid.className = 'wp-desktop-os-settings__grid wp-desktop-os-settings__grid--wallpapers';

		// Inline gradient editor is created up front so we can reveal /
		// hide it without re-rendering the whole section when the
		// selection changes. The CSS animates the outer wrapper via a
		// grid-template-rows transition (0fr → 1fr), driven by the
		// `data-expanded` attribute we flip from the swatch handler.
		const gradientEditor = this.buildCustomGradientEditor( () => {
			this.selectWallpaper( 'custom-gradient', body );
		} );
		const toggleGradientEditor = () => {
			gradientEditor.dataset.expanded =
				this.state.wallpaper === 'custom-gradient' ? 'true' : 'false';
		};

		// Presets.
		for ( const wp of WALLPAPER_PRESETS ) {
			grid.appendChild(
				this.buildWallpaperSwatch( wp.id, wp.label, wp.value, () => {
					this.selectWallpaper( wp.id, body );
					toggleGradientEditor();
				} )
			);
		}

		// Custom gradient swatch (shows the live preview of whatever
		// colors the user has chosen so it always previews its own
		// state, not a placeholder).
		grid.appendChild(
			this.buildWallpaperSwatch(
				'custom-gradient',
				'Custom gradient',
				this.customGradientCss(),
				() => {
					this.selectWallpaper( 'custom-gradient', body );
					toggleGradientEditor();
				}
			)
		);

		section.appendChild( grid );

		// Gradient editor — collapsed (via `data-expanded`) unless the
		// custom-gradient swatch is selected. Setting the attribute
		// before the node enters the live DOM keeps the initial paint
		// from triggering the expand animation on panel open.
		gradientEditor.dataset.expanded =
			this.state.wallpaper === 'custom-gradient' ? 'true' : 'false';
		section.appendChild( gradientEditor );

		// Custom-image section — tabbed between "Upload new" and
		// "Media Library" so the user can either drop a fresh file or
		// reach back into images they've already uploaded. Becomes a
		// selectable swatch once any custom image is in state.
		section.appendChild( this.buildCustomImageSection( body ) );

		return section;
	}

	/**
	 * Build one clickable wallpaper preview tile. Factored out because we
	 * use the same shape for presets and for the custom-gradient swatch.
	 */
	private buildWallpaperSwatch(
		id: WallpaperId,
		label: string,
		backgroundValue: string,
		onClick: () => void
	): HTMLElement {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'wp-desktop-os-settings__swatch wp-desktop-os-settings__swatch--wallpaper';
		btn.setAttribute( 'aria-label', label );
		btn.setAttribute( 'aria-pressed', this.state.wallpaper === id ? 'true' : 'false' );
		btn.dataset.wallpaperId = id;
		btn.style.background = backgroundValue;

		const labelEl = document.createElement( 'span' );
		labelEl.className = 'wp-desktop-os-settings__swatch-label';
		labelEl.textContent = label;
		btn.appendChild( labelEl );

		btn.addEventListener( 'click', onClick );
		return btn;
	}

	/**
	 * Mark a wallpaper id as selected and refresh the grid's pressed
	 * state. Separate from the swatch handlers so the image uploader
	 * (which lives outside the grid) can call it too.
	 */
	private selectWallpaper( id: WallpaperId, body: HTMLElement ): void {
		this.state.wallpaper = id;
		this.save();
		this.apply();
		this.refreshWallpaperPressedState( body );
	}

	/**
	 * Update `aria-pressed` on every wallpaper swatch + image tile so the
	 * UI reflects `state.wallpaper`. Cheaper than re-rendering the whole
	 * section and keeps focus on whichever button the user clicked.
	 */
	private refreshWallpaperPressedState( body: HTMLElement ): void {
		body.querySelectorAll<HTMLElement>( '[data-wallpaper-id]' ).forEach( ( el ) => {
			el.setAttribute(
				'aria-pressed',
				el.dataset.wallpaperId === this.state.wallpaper ? 'true' : 'false'
			);
		} );
	}

	/**
	 * Inline editor for the custom gradient — two color inputs and an
	 * angle slider. Changing any field updates state live (the
	 * `input` event, not `change`) so the desktop repaints as the user
	 * drags the angle slider or scrubs through the color picker.
	 */
	private buildCustomGradientEditor( onApply: () => void ): HTMLElement {
		// Outer: the collapsible frame — CSS animates grid-template-rows
		// + margin + opacity based on `data-expanded`. Inner: the actual
		// editor chrome (padding, border, background) so overflow
		// clipping during the reveal doesn't eat the border-radius.
		const wrap = document.createElement( 'div' );
		wrap.className = 'wp-desktop-os-settings__gradient-editor';
		wrap.dataset.expanded = 'false';

		const inner = document.createElement( 'div' );
		inner.className = 'wp-desktop-os-settings__gradient-editor-inner';

		const row = document.createElement( 'div' );
		row.className = 'wp-desktop-os-settings__gradient-row';

		const buildColorField = (
			label: string,
			initialValue: string,
			onInput: ( value: string ) => void
		): HTMLElement => {
			const field = document.createElement( 'label' );
			field.className = 'wp-desktop-os-settings__gradient-field';

			const text = document.createElement( 'span' );
			text.className = 'wp-desktop-os-settings__gradient-label';
			text.textContent = label;
			field.appendChild( text );

			const input = document.createElement( 'input' );
			input.type = 'color';
			input.className = 'wp-desktop-os-settings__color-input';
			input.value = initialValue;
			input.addEventListener( 'input', () => onInput( input.value ) );
			field.appendChild( input );

			return field;
		};

		row.appendChild(
			buildColorField( 'From', this.state.customGradient.from, ( value ) => {
				this.state.customGradient.from = value;
				this.save();
				onApply();
				this.syncGradientPreviewSwatch( wrap );
			} )
		);
		row.appendChild(
			buildColorField( 'To', this.state.customGradient.to, ( value ) => {
				this.state.customGradient.to = value;
				this.save();
				onApply();
				this.syncGradientPreviewSwatch( wrap );
			} )
		);

		inner.appendChild( row );

		// Angle slider with live numeric readout.
		const angleField = document.createElement( 'label' );
		angleField.className = 'wp-desktop-os-settings__gradient-angle';

		const angleLabel = document.createElement( 'span' );
		angleLabel.className = 'wp-desktop-os-settings__gradient-label';
		angleLabel.textContent = 'Angle';
		angleField.appendChild( angleLabel );

		const angleInput = document.createElement( 'input' );
		angleInput.type = 'range';
		angleInput.min = '0';
		angleInput.max = '360';
		angleInput.step = '1';
		angleInput.value = String( this.state.customGradient.angle );
		angleField.appendChild( angleInput );

		const angleValue = document.createElement( 'span' );
		angleValue.className = 'wp-desktop-os-settings__gradient-angle-value';
		angleValue.textContent = `${ this.state.customGradient.angle }°`;
		angleField.appendChild( angleValue );

		angleInput.addEventListener( 'input', () => {
			const n = parseInt( angleInput.value, 10 );
			if ( ! Number.isFinite( n ) ) {
				return;
			}
			this.state.customGradient.angle = n;
			angleValue.textContent = `${ n }°`;
			this.save();
			onApply();
			this.syncGradientPreviewSwatch( wrap );
		} );

		inner.appendChild( angleField );
		wrap.appendChild( inner );

		return wrap;
	}

	/**
	 * Keep the "Custom gradient" swatch's preview background in sync with
	 * the live-edited gradient. Called from each color/angle input so the
	 * user sees the same swatch they'll be selecting from.
	 *
	 * Walks up from the editor element to find its enclosing section so
	 * the lookup stays local to this panel — important because the same
	 * class names could appear elsewhere if a plugin ever embeds us.
	 */
	private syncGradientPreviewSwatch( editorEl: HTMLElement ): void {
		const section = editorEl.closest( '.wp-desktop-os-settings__section' );
		const preview = section?.querySelector<HTMLElement>(
			'[data-wallpaper-id="custom-gradient"]'
		);
		if ( preview ) {
			preview.style.background = this.customGradientCss();
		}
	}

	private customGradientCss(): string {
		const { from, to, angle } = this.state.customGradient;
		return `linear-gradient(${ angle }deg, ${ from }, ${ to })`;
	}

	/**
	 * Build the custom-image section: a tabbed widget that lets the user
	 * either upload a new image or pick one from the Media Library.
	 *
	 * The "Upload new" tab is only offered when the user holds the
	 * `upload_files` capability; "Media Library" is always available
	 * because browsing media only requires the standard `read` cap plus
	 * whatever Core enforces on individual attachments.
	 */
	private buildCustomImageSection( body: HTMLElement ): HTMLElement {
		const wrap = document.createElement( 'div' );
		wrap.className = 'wp-desktop-os-settings__uploader';

		const heading = document.createElement( 'h4' );
		heading.className = 'wp-desktop-os-settings__uploader-heading';
		heading.textContent = 'Or use your own image';
		wrap.appendChild( heading );

		// Tabs — rendered only when both panes exist. If the user can't
		// upload we drop straight into the library pane without a tab
		// strip so the single-option UI doesn't read like a dead tab.
		const tabList = document.createElement( 'div' );
		tabList.className = 'wp-desktop-os-settings__tabs';
		tabList.setAttribute( 'role', 'tablist' );

		const pane = document.createElement( 'div' );
		pane.className = 'wp-desktop-os-settings__tab-pane';

		type TabKey = 'upload' | 'library';
		const tabs: { key: TabKey; label: string; render: () => void }[] = [];

		if ( this.config.canUpload ) {
			tabs.push( {
				key: 'upload',
				label: 'Upload new',
				render: () => this.renderUploadPane( pane, body ),
			} );
		}
		tabs.push( {
			key: 'library',
			label: 'Media Library',
			render: () => this.renderLibraryPane( pane, body ),
		} );

		const tabButtons = new Map<TabKey, HTMLButtonElement>();
		let activeTab: TabKey = tabs[ 0 ].key;

		const activateTab = ( key: TabKey ): void => {
			activeTab = key;
			for ( const [ k, btn ] of tabButtons ) {
				const isActive = k === key;
				btn.classList.toggle( 'wp-desktop-os-settings__tab--active', isActive );
				btn.setAttribute( 'aria-selected', isActive ? 'true' : 'false' );
				btn.tabIndex = isActive ? 0 : -1;
			}
			const def = tabs.find( ( t ) => t.key === key );
			def?.render();
		};

		for ( const tab of tabs ) {
			const btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'wp-desktop-os-settings__tab';
			btn.setAttribute( 'role', 'tab' );
			btn.textContent = tab.label;
			btn.addEventListener( 'click', () => activateTab( tab.key ) );
			tabButtons.set( tab.key, btn );
			tabList.appendChild( btn );
		}

		if ( tabs.length > 1 ) {
			wrap.appendChild( tabList );
		}
		wrap.appendChild( pane );

		activateTab( activeTab );
		return wrap;
	}

	/**
	 * Render the "Upload new" pane into the given container. Replaces
	 * any prior contents so tab switching stays cheap.
	 */
	private renderUploadPane( pane: HTMLElement, body: HTMLElement ): void {
		pane.innerHTML = '';

		const tile = document.createElement( 'div' );
		tile.className = 'wp-desktop-os-settings__upload-tile';
		tile.dataset.wallpaperId = 'custom-image';
		tile.setAttribute(
			'aria-pressed',
			this.state.wallpaper === 'custom-image' ? 'true' : 'false'
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

	/**
	 * Render the "Media Library" pane into the given container.
	 *
	 * Owns its own in-pane state (search query, HD toggle live value,
	 * current page, loaded items) via closure. Every tab re-activation
	 * starts fresh — simpler than persisting pagination across tab
	 * swaps and the payload is small.
	 */
	private renderLibraryPane( pane: HTMLElement, body: HTMLElement ): void {
		pane.innerHTML = '';

		const library = document.createElement( 'div' );
		library.className = 'wp-desktop-os-settings__library';

		// Toolbar: search + HD toggle.
		const toolbar = document.createElement( 'div' );
		toolbar.className = 'wp-desktop-os-settings__library-toolbar';

		const search = document.createElement( 'input' );
		search.type = 'search';
		search.placeholder = 'Search your media';
		search.className = 'wp-desktop-os-settings__library-search';
		search.setAttribute( 'aria-label', 'Search media' );
		toolbar.appendChild( search );

		const hdWrap = document.createElement( 'label' );
		hdWrap.className = 'wp-desktop-os-settings__library-hd';
		const hdInput = document.createElement( 'input' );
		hdInput.type = 'checkbox';
		hdInput.checked = this.state.libraryHdOnly;
		hdWrap.appendChild( hdInput );
		const hdLabel = document.createElement( 'span' );
		hdLabel.textContent = `Only HD (≥${ HD_MIN_WIDTH }×${ HD_MIN_HEIGHT })`;
		hdWrap.appendChild( hdLabel );
		toolbar.appendChild( hdWrap );

		library.appendChild( toolbar );

		const grid = document.createElement( 'div' );
		grid.className = 'wp-desktop-os-settings__library-grid';
		library.appendChild( grid );

		const footer = document.createElement( 'div' );
		footer.className = 'wp-desktop-os-settings__library-footer';
		const meta = document.createElement( 'span' );
		meta.className = 'wp-desktop-os-settings__library-meta';
		footer.appendChild( meta );
		const loadMore = document.createElement( 'button' );
		loadMore.type = 'button';
		loadMore.className = 'wp-desktop-os-settings__library-load-more';
		loadMore.textContent = 'Load more';
		footer.appendChild( loadMore );
		library.appendChild( footer );

		pane.appendChild( library );

		// In-pane paging / filter state.
		let query = '';
		let page = 0;
		let totalPages = 0;
		let loaded: MediaItem[] = [];
		let hiddenByHd = 0;
		let loading = false;

		const updateMeta = (): void => {
			const visible = this.visibleLibraryItems( loaded ).length;
			const parts = [ `Showing ${ visible }` ];
			if ( this.state.libraryHdOnly && hiddenByHd > 0 ) {
				parts.push( `${ hiddenByHd } hidden by HD filter` );
			}
			meta.textContent = parts.join( ' · ' );
			loadMore.hidden = page >= totalPages;
			loadMore.disabled = loading;
		};

		const renderGrid = (): void => {
			grid.innerHTML = '';
			const visible = this.visibleLibraryItems( loaded );
			hiddenByHd = loaded.length - visible.length;

			if ( visible.length === 0 && ! loading ) {
				const empty = document.createElement( 'p' );
				empty.className = 'wp-desktop-os-settings__library-empty';
				empty.textContent = this.state.libraryHdOnly
					? 'No HD images found. Try unchecking the filter, or upload a larger image.'
					: 'No images in your Media Library yet.';
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

			// Skeleton placeholders while the first page lands — helps
			// the pane feel responsive on slow connections.
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
				errMsg.textContent =
					err instanceof Error
						? `Couldn’t load your media: ${ err.message }`
						: 'Couldn’t load your media.';
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

		// Debounced search — reset pagination and refetch.
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

		// HD toggle — the server applies the same filter when our opt-in
		// params are sent, so flipping this refetches from page 1 to
		// pick up images the previous request narrowed out. The local
		// re-filter in `visibleLibraryItems` still runs to catch stray
		// mis-stamped rows during backfill.
		hdInput.addEventListener( 'change', () => {
			this.state.libraryHdOnly = hdInput.checked;
			this.save();
			resetAndReload();
		} );

		loadMore.addEventListener( 'click', () => {
			void loadNextPage();
		} );

		// Initial fetch.
		void loadNextPage();
	}

	/**
	 * Apply the HD filter if it's enabled. Factored out so the toggle
	 * can re-filter without re-fetching.
	 */
	private visibleLibraryItems( items: MediaItem[] ): MediaItem[] {
		if ( ! this.state.libraryHdOnly ) {
			return items;
		}
		return items.filter(
			( it ) =>
				it.media_details.width >= HD_MIN_WIDTH &&
				it.media_details.height >= HD_MIN_HEIGHT
		);
	}

	/**
	 * Build one thumbnail tile for a REST media item. Clicking selects
	 * the image as the custom wallpaper.
	 */
	private buildLibraryTile( item: MediaItem, body: HTMLElement ): HTMLElement {
		const tile = document.createElement( 'button' );
		tile.type = 'button';
		tile.className = 'wp-desktop-os-settings__library-tile';
		tile.dataset.mediaId = String( item.id );

		const isSelected =
			this.state.wallpaper === 'custom-image' &&
			this.state.customImage?.id === item.id;
		tile.setAttribute( 'aria-pressed', isSelected ? 'true' : 'false' );
		if ( isSelected ) {
			tile.classList.add( 'wp-desktop-os-settings__library-tile--selected' );
		}

		// Prefer the medium size for the grid — big enough to read, small
		// enough to keep the pane snappy. Fall back to thumbnail, then
		// to the full image if nothing else exists.
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
			this.state.wallpaper = 'custom-image';
			this.save();
			this.apply();
			this.refreshWallpaperPressedState( body );
			// Refresh the library grid's selected highlighting without a
			// full re-fetch.
			const grid = tile.parentElement;
			if ( grid ) {
				grid.querySelectorAll<HTMLElement>( '[data-media-id]' ).forEach( ( el ) => {
					const selected = el.dataset.mediaId === String( item.id );
					el.setAttribute( 'aria-pressed', selected ? 'true' : 'false' );
					el.classList.toggle(
						'wp-desktop-os-settings__library-tile--selected',
						selected
					);
				} );
			}
		} );

		return tile;
	}

	/**
	 * Fetch one page of image attachments from the REST API. Filters
	 * `_fields` down to the data we actually render, sorts newest-first,
	 * and reads `X-WP-TotalPages` to drive the Load more button.
	 *
	 * Dimension filtering is intentionally client-side: Core's REST
	 * doesn't let us filter by `media_details.width` without a custom
	 * query var, and we'd rather not force each install to register
	 * one.
	 */
	private async fetchMediaPage(
		page: number,
		search: string
	): Promise<{ items: MediaItem[]; totalPages: number }> {
		const url = new URL( this.config.mediaUrl );
		url.searchParams.set( 'media_type', 'image' );
		url.searchParams.set( 'per_page', String( MEDIA_PER_PAGE ) );
		url.searchParams.set( 'page', String( page ) );
		url.searchParams.set( 'orderby', 'date' );
		url.searchParams.set( 'order', 'desc' );
		url.searchParams.set(
			'_fields',
			'id,source_url,alt_text,title,media_details'
		);
		if ( search ) {
			url.searchParams.set( 'search', search );
		}
		// Server-side dimension filter — the plugin registers these on
		// the media collection so we can ask the DB to do the heavy
		// lifting instead of paginating through thousands of icons. The
		// client-side filter in `visibleLibraryItems` still runs as a
		// safety net in case an older attachment's stamped meta is
		// stale.
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

	/**
	 * Paint the image uploader tile based on `state.customImage`. Also
	 * wires the click / drag listeners — factored into its own method so
	 * swapping empty ↔ filled states is a single call.
	 */
	private renderUploadTile(
		tile: HTMLElement,
		fileInput: HTMLInputElement,
		body: HTMLElement
	): void {
		tile.innerHTML = '';
		tile.classList.remove( 'wp-desktop-os-settings__upload-tile--filled' );
		tile.classList.remove( 'wp-desktop-os-settings__upload-tile--dragover' );
		tile.classList.remove( 'wp-desktop-os-settings__upload-tile--busy' );
		tile.removeAttribute( 'aria-label' );

		if ( this.state.customImage ) {
			tile.classList.add( 'wp-desktop-os-settings__upload-tile--filled' );
			tile.setAttribute( 'aria-label', 'Custom image wallpaper' );
			tile.style.backgroundImage = `url("${ encodeURI( this.state.customImage.url ) }")`;

			const remove = document.createElement( 'button' );
			remove.type = 'button';
			remove.className = 'wp-desktop-os-settings__upload-remove';
			remove.setAttribute( 'aria-label', 'Remove custom image' );
			remove.textContent = 'Remove';
			remove.addEventListener( 'click', ( e ) => {
				e.stopPropagation();
				this.state.customImage = null;
				// If the image was the active wallpaper, fall back to the
				// first preset so the user isn't left with an unreadable
				// transparent desktop the moment they hit remove.
				if ( this.state.wallpaper === 'custom-image' ) {
					this.state.wallpaper = WALLPAPER_PRESETS[ 0 ].id;
				}
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
			inner.innerHTML = `
				<span class="wp-desktop-os-settings__upload-plus" aria-hidden="true">+</span>
				<span class="wp-desktop-os-settings__upload-prompt">Drop an image here, or click to upload</span>
				<span class="wp-desktop-os-settings__upload-hint">JPEG, PNG, or WebP · goes straight to your Media Library</span>
			`;
			tile.appendChild( inner );
			tile.setAttribute( 'aria-label', 'Upload a wallpaper image' );
		}

		// Click routes to the file picker. Clicks on the "Remove" button
		// bubble through stopPropagation above so this doesn't also open
		// a picker when the user just wants to remove.
		tile.onclick = () => {
			if ( tile.classList.contains( 'wp-desktop-os-settings__upload-tile--busy' ) ) {
				return;
			}
			// If an image is already set, clicking the tile selects it
			// as the active wallpaper rather than re-prompting for a
			// new upload (users who want to replace it can hit Remove
			// first, or just drop a new file on top).
			if ( this.state.customImage ) {
				this.selectWallpaper( 'custom-image', body );
				return;
			}
			fileInput.click();
		};

		// Dragover / drop — needed on both empty and filled tiles so the
		// user can replace an existing image by dropping a new one.
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

	/**
	 * Validate + upload one dropped/chosen file. Errors surface as
	 * transient text inside the tile so the user never has to open
	 * DevTools to learn why their upload didn't stick.
	 */
	private async handleImageFile(
		file: File,
		tile: HTMLElement,
		body: HTMLElement
	): Promise<void> {
		if ( ! file.type.startsWith( 'image/' ) ) {
			this.showUploadError( tile, 'That file isn’t an image.' );
			return;
		}

		tile.classList.add( 'wp-desktop-os-settings__upload-tile--busy' );
		const prevInner = tile.innerHTML;
		tile.innerHTML =
			'<span class="wp-desktop-os-settings__upload-status">Uploading…</span>';

		try {
			const media = await this.uploadImage( file );
			this.state.customImage = { id: media.id, url: media.url };
			this.state.wallpaper = 'custom-image';
			this.save();
			this.apply();
			// Re-find the file input — the busy state wiped our inner
			// DOM. Easier than juggling state is to fully re-render the
			// uploader section on success.
			const fileInput = tile.parentElement?.querySelector<HTMLInputElement>(
				'.wp-desktop-os-settings__file-input'
			);
			if ( fileInput ) {
				this.renderUploadTile( tile, fileInput, body );
			}
			this.refreshWallpaperPressedState( body );
		} catch ( err ) {
			tile.innerHTML = prevInner;
			tile.classList.remove( 'wp-desktop-os-settings__upload-tile--busy' );
			const message = err instanceof Error ? err.message : 'Upload failed.';
			this.showUploadError( tile, message );
		}
	}

	/**
	 * Floats a temporary error message inside the tile. Auto-clears
	 * after a few seconds so it doesn't linger past the user's attention.
	 */
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

	/**
	 * POST a single image to the WP REST media endpoint.
	 *
	 * Using the raw-binary (Content-Disposition header) variant rather
	 * than multipart so we don't need a FormData boundary or depend on
	 * the server parsing multipart uploads — the REST media endpoint
	 * accepts both, and raw-binary is simpler to reason about.
	 *
	 * Returns the attachment's id and source URL; throws on HTTP error
	 * with the server's `message` field preserved so the tile can show
	 * the real reason (size, mime, cap) instead of a generic "Failed".
	 */
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

	private buildAccentSection(): HTMLElement {
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
			btn.setAttribute(
				'aria-pressed',
				this.state.accent === accent.id ? 'true' : 'false'
			);
			btn.dataset.id = accent.id;
			btn.style.background = accent.value;
			btn.title = accent.label;

			btn.addEventListener( 'click', () => {
				this.state.accent = accent.id;
				this.save();
				this.apply();
				this.refreshSelected( grid, accent.id );
			} );
			grid.appendChild( btn );
		}

		section.appendChild( grid );
		return section;
	}

	private buildDockSizeSection(): HTMLElement {
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
			btn.setAttribute(
				'aria-checked',
				this.state.dockSize === size.id ? 'true' : 'false'
			);
			btn.dataset.id = size.id;
			btn.textContent = size.label;

			btn.addEventListener( 'click', () => {
				this.state.dockSize = size.id;
				this.save();
				this.apply();
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
				return structuredDefaults();
			}
			const parsed = JSON.parse( raw ) as Partial<OsSettingsState>;
			return {
				wallpaper:
					typeof parsed.wallpaper === 'string' &&
					ALL_WALLPAPER_IDS.includes( parsed.wallpaper as WallpaperId )
						? ( parsed.wallpaper as WallpaperId )
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

/** Deep-ish clone so runtime mutation can't leak into DEFAULTS. */
function structuredDefaults(): OsSettingsState {
	return {
		...DEFAULTS,
		customGradient: { ...DEFAULTS.customGradient },
		customImage: null,
	};
}

/**
 * Coerce a stored `customGradient` payload into a valid shape — any field
 * missing or malformed is replaced with the corresponding default.
 * Keeps `apply()` free of null checks.
 */
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

/**
 * Strip anything a server might trip on while still preserving enough of
 * the original filename to keep Media Library grids readable. Allows
 * ASCII letters/numbers/dot/dash/underscore — everything else becomes
 * a hyphen. Empty result falls back to "wallpaper".
 */
function sanitizeFilename( name: string ): string {
	const cleaned = name.replace( /[^a-zA-Z0-9._-]+/g, '-' ).replace( /^-+|-+$/g, '' );
	return cleaned || 'wallpaper';
}

/**
 * Defensive filter — the REST endpoint occasionally returns records with
 * missing / zero dimensions (e.g. SVGs or uploads where the attachment
 * metadata never regenerated). Those break HD filtering and render as
 * broken tiles; better to drop them.
 */
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

/**
 * Quick-and-correct text extraction for REST `title.rendered` values,
 * which arrive with Core's HTML-entity encoding ("&amp;", "&#8217;").
 * We let the browser's parser decode them, then read textContent.
 */
function stripHtml( html: string ): string {
	if ( ! html ) {
		return '';
	}
	const el = document.createElement( 'div' );
	el.innerHTML = html;
	return el.textContent?.trim() || '';
}
