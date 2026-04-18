/**
 * Desktop Mode — Window.
 *
 * A single desktop window: title bar, iframe content, drag, resize, state management.
 *
 * @since 6.9.0
 */

import type { WindowConfig, WindowState } from './types';
import { sanitizeClassName, urlMatchKey } from './utils';
import { HOOKS, doAction } from './hooks';
import { showToast } from './toast';

/** Minimum distance from viewport edges when dragging. */
const EDGE_MARGIN = 8;

/**
 * How long an external sub-tab's iframe gets to fire its initial
 * `load` event before we assume the request failed and fall back to
 * opening the URL in a real browser tab. Bumped up from 2 s to 3 s
 * so slow connections + heavy third-party sites (e.g., someone's
 * self-hosted blog on a cold cache) have headroom to respond before
 * we give up on embedding.
 */
const EXTERNAL_IFRAME_READY_TIMEOUT_MS = 3000;

/**
 * Returns the URL with the chromeless query parameter set, so the iframe
 * keeps rendering without the admin shell. Returns null for cross-origin
 * URLs so the caller can refuse the navigation.
 */
function withChromelessParam( url: string ): string | null {
	const parsed = new URL( url, window.location.origin );
	if ( parsed.origin !== window.location.origin ) {
		return null;
	}
	parsed.searchParams.set( 'wp_desktop', '1' );
	return parsed.toString();
}

/**
 * Toggle `wp-desktop-has-fullscreen-window` on `<body>` based on whether any
 * window is currently in fullscreen state.
 *
 * Why a body class: a fullscreen window lives inside the shell, and the
 * shell creates a stacking context (positioned + z-index), so the window's
 * z-index can never rise above sibling root-level chrome like `#wpadminbar`.
 * Instead of moving the window element out of the shell (fragile — event
 * handlers, focus trap, and size-from-parent logic all assume the parent
 * is the desktop area), we hide the admin bar via CSS while any fullscreen
 * window is open. This matches macOS convention (menu bar auto-hides in
 * fullscreen) and keeps the stacking context intact.
 *
 * Called from toggleFullscreen and after close() removes a window — so a
 * user closing a fullscreen window without exiting fullscreen first doesn't
 * leave the body class stranded.
 */
function updateFullscreenBodyClass(): void {
	const hasFullscreen =
		document.querySelectorAll( '.wp-desktop-window--fullscreen' ).length > 0;
	document.body.classList.toggle( 'wp-desktop-has-fullscreen-window', hasFullscreen );
}

/**
 * Build a title-bar control button with an inline SVG icon.
 *
 * Using inline SVG (rather than a dashicon font glyph) keeps icons crisp
 * at any size and lets them inherit `currentColor` so they adapt to the
 * focused / unfocused title-bar state without separate CSS rules.
 */
function createControlButton( variant: string, label: string, svgInner: string ): HTMLButtonElement {
	const btn = document.createElement( 'button' );
	btn.type = 'button';
	btn.className = `wp-desktop-window__btn wp-desktop-window__btn--${ variant }`;
	btn.setAttribute( 'aria-label', label );
	btn.innerHTML = `<svg class="wp-desktop-window__btn-icon" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" focusable="false">${ svgInner }</svg>`;
	return btn;
}

/**
 * Creates the DOM structure for a desktop window.
 */
function createWindowElement( config: WindowConfig ): HTMLElement {
	const el = document.createElement( 'div' );
	el.className = 'wp-desktop-window';
	if ( config.native ) {
		el.classList.add( 'wp-desktop-window--native' );
	}
	el.id = `wp-window-${ config.id }`;
	el.setAttribute( 'role', 'dialog' );
	el.setAttribute( 'aria-labelledby', `wp-window-title-${ config.id }` );
	el.style.left = `${ config.x }px`;
	el.style.top = `${ config.y }px`;
	el.style.width = `${ config.width }px`;
	el.style.height = `${ config.height }px`;

	const titleBar = document.createElement( 'div' );
	titleBar.className = 'wp-desktop-window__titlebar';

	// Leading menu button — sits before the icon + title. Shown for
	// any iframe-backed window; native windows (OS Settings, future
	// plugins) have no admin URL and so skip the menu. Contents vary:
	//
	//   - Every iframe window gets "Open on startup" — a checkable
	//     item that marks this window as the default-window preference.
	//   - Multi-capable windows additionally get "Open another <page>".
	//
	// Future window-management verbs ("Tile left", "Duplicate", etc.)
	// should migrate here so the title bar stops growing controls.
	let menuBtn: HTMLButtonElement | null = null;
	let menuPanel: HTMLElement | null = null;
	if ( ! config.native ) {
		menuBtn = document.createElement( 'button' );
		menuBtn.type = 'button';
		menuBtn.className = 'wp-desktop-window__btn wp-desktop-window__menu-btn';
		menuBtn.setAttribute( 'aria-label', 'Window actions' );
		menuBtn.setAttribute( 'aria-haspopup', 'menu' );
		menuBtn.setAttribute( 'aria-expanded', 'false' );
		menuBtn.innerHTML =
			'<svg class="wp-desktop-window__btn-icon" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
			'<circle cx="3" cy="6" r="1.2" fill="currentColor"/>' +
			'<circle cx="6" cy="6" r="1.2" fill="currentColor"/>' +
			'<circle cx="9" cy="6" r="1.2" fill="currentColor"/>' +
			'</svg>';

		menuPanel = document.createElement( 'div' );
		menuPanel.className = 'wp-desktop-window__menu-panel';
		menuPanel.setAttribute( 'role', 'menu' );
		menuPanel.hidden = true;

		// "Open on startup" — checkable. The checked state is
		// hydrated in bindEvents() once we can read the shared public
		// API; the button just needs to exist here.
		const startup = document.createElement( 'button' );
		startup.type = 'button';
		startup.className =
			'wp-desktop-window__menu-item wp-desktop-window__menu-item--startup';
		startup.setAttribute( 'role', 'menuitemcheckbox' );
		startup.setAttribute( 'aria-checked', 'false' );
		startup.innerHTML =
			'<span class="wp-desktop-window__menu-check" aria-hidden="true"></span>' +
			'<span class="wp-desktop-window__menu-label">Open on startup</span>';
		menuPanel.appendChild( startup );

		if ( config.multi ) {
			const openAnother = document.createElement( 'button' );
			openAnother.type = 'button';
			openAnother.className =
				'wp-desktop-window__menu-item wp-desktop-window__menu-item--open-another';
			openAnother.setAttribute( 'role', 'menuitem' );
			openAnother.innerHTML =
				'<span class="wp-desktop-window__menu-icon dashicons dashicons-plus-alt2" aria-hidden="true"></span>' +
				`<span class="wp-desktop-window__menu-label">Open another ${ config.title }</span>`;
			menuPanel.appendChild( openAnother );
		}
	}

	const iconEl = document.createElement( 'span' );
	iconEl.className = `wp-desktop-window__icon dashicons ${ sanitizeClassName( config.icon ) }`;
	iconEl.setAttribute( 'aria-hidden', 'true' );

	const titleEl = document.createElement( 'span' );
	titleEl.className = 'wp-desktop-window__title';
	titleEl.id = `wp-window-title-${ config.id }`;
	titleEl.textContent = config.title;

	const controls = document.createElement( 'div' );
	controls.className = 'wp-desktop-window__controls';

	const btnMin = createControlButton(
		'minimize',
		'Minimize',
		'<path d="M3 6h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>',
	);
	const btnMax = createControlButton(
		'maximize',
		'Maximize',
		'<rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.25" fill="none"/>',
	);
	const btnFocus = createControlButton(
		'focus',
		'Enter fullscreen',
		'<path d="M4.5 2H2v2.5M10 4.5V2H7.5M4.5 10H2V7.5M10 7.5V10H7.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
	);
	// Detach: open this window's current URL in a new browser tab as
	// plain classic admin (no desktop shell, no chromeless). Escape hatch
	// for users who want to work on one page outside the windowed UI
	// without disabling desktop mode globally. Icon is the conventional
	// "open in new window" box + arrow.
	const btnDetach = createControlButton(
		'detach',
		'Detach to new tab',
		'<path d="M5 2H2.5v7.5H10V7M6.5 2H10v3.5M10 2L5.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
	);
	const btnClose = createControlButton(
		'close',
		'Close',
		'<path d="M3.25 3.25l5.5 5.5M3.25 8.75l5.5-5.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>',
	);

	controls.appendChild( btnMin );
	controls.appendChild( btnMax );
	controls.appendChild( btnFocus );
	// Detach opens the window's URL in a classic admin tab — it has no
	// meaning for native windows, which have no admin URL to hand off.
	if ( ! config.native ) {
		controls.appendChild( btnDetach );
	}
	controls.appendChild( btnClose );

	// Screen meta buttons container (populated when iframe reports available panels).
	const screenMeta = document.createElement( 'div' );
	screenMeta.className = 'wp-desktop-window__screen-meta';

	titleBar.appendChild( iconEl );
	titleBar.appendChild( titleEl );
	titleBar.appendChild( screenMeta );
	// ⋯ menu sits as the last item before the controls divider so it
	// groups with the page-level chrome (screen options, help) rather
	// than the window chrome (minimize, close, …). Only appended when
	// the menu actually has items to offer — otherwise the button
	// would open an empty dropdown.
	if ( menuBtn && menuPanel && menuPanel.children.length > 0 ) {
		titleBar.appendChild( menuBtn );
		titleBar.appendChild( menuPanel );
	}
	titleBar.appendChild( controls );

	const body = document.createElement( 'div' );
	body.className = 'wp-desktop-window__body';

	// Native windows own the body contents via {@link WindowConfig.render}
	// — called from the Window constructor after mount. Skip the iframe
	// plumbing entirely.
	if ( ! config.native ) {
		const iframe = document.createElement( 'iframe' );
		iframe.className = 'wp-desktop-window__iframe';
		iframe.setAttribute( 'name', `wp-desktop-frame-${ config.id }` );

		const chromelessSrc = withChromelessParam( config.url );
		iframe.src = chromelessSrc ?? 'about:blank';

		body.appendChild( iframe );
	} else {
		body.classList.add( 'wp-desktop-window__body--native' );
	}

	// Resize handle.
	const resizeHandle = document.createElement( 'div' );
	resizeHandle.className = 'wp-desktop-window__resize-handle';

	el.appendChild( titleBar );

	// Tab strip — initialized whenever the window has a submenu OR
	// supports external-link sub-tabs (which iframe windows grow at
	// runtime via `addExternalTab`). For windows with no submenu, we
	// still create the strip but hide it via CSS `:empty` when empty.
	// Each submenu tab is marked `data-kind="submenu"` so the
	// runtime tab-switching code can tell submenu tabs apart from
	// closeable external tabs.
	if ( ! config.native ) {
		const tabs = document.createElement( 'nav' );
		tabs.className = 'wp-desktop-window__tabs';
		tabs.setAttribute( 'role', 'tablist' );
		tabs.setAttribute( 'aria-label', `${ config.title } sub-pages` );

		if ( config.submenu && config.submenu.length > 0 ) {
			const initialKey = urlMatchKey( config.url );
			for ( const sub of config.submenu ) {
				const tab = document.createElement( 'button' );
				tab.className = 'wp-desktop-window__tab';
				tab.dataset.kind = 'submenu';
				tab.setAttribute( 'type', 'button' );
				tab.setAttribute( 'role', 'tab' );
				tab.dataset.url = sub.url;
				tab.textContent = sub.title;
				if ( urlMatchKey( sub.url ) === initialKey ) {
					tab.classList.add( 'wp-desktop-window__tab--active' );
					tab.setAttribute( 'aria-selected', 'true' );
				} else {
					tab.setAttribute( 'aria-selected', 'false' );
				}
				tabs.appendChild( tab );
			}
		}
		el.appendChild( tabs );
	}

	el.appendChild( body );
	el.appendChild( resizeHandle );

	return el;
}

/**
 * Desktop Window class.
 *
 * Manages a single window: its DOM element, iframe, drag/resize behavior, and state.
 */
export class Window {
	public readonly id: string;
	public readonly config: WindowConfig;
	public readonly element: HTMLElement;
	/**
	 * Iframe for iframe-backed windows. Null for native windows, which
	 * render into the body directly via {@link WindowConfig.render}.
	 */
	public readonly iframe: HTMLIFrameElement | null;
	public state: WindowState = 'normal';

	private titleBar: HTMLElement;
	private titleEl: HTMLElement;
	private isDragging = false;
	private isResizing = false;
	private isDestroyed = false;
	private boundOnMessage: ( e: MessageEvent ) => void;
	private dragOffsetX = 0;
	private dragOffsetY = 0;
	private resizeStartX = 0;
	private resizeStartY = 0;
	private resizeStartW = 0;
	private resizeStartH = 0;

	/** Stored geometry before maximize/snap, for restore. */
	private savedGeometry: { x: number; y: number; width: number; height: number } | null = null;

	/**
	 * Snapshot taken before entering fullscreen so we can restore
	 * the caller's previous state (normal or maximized) on exit.
	 */
	private savedFullscreenState: {
		state: WindowState;
		x: number;
		y: number;
		width: number;
		height: number;
	} | null = null;

	/**
	 * External-link sub-tabs keyed by a generated tab id. Each carries
	 * its own iframe, its label, and a cleanup hook for the readiness
	 * probe. Exists only for iframe windows — native windows skip the
	 * whole code path.
	 */
	private externalTabs: Map<
		string,
		{
			tabEl: HTMLElement;
			iframe: HTMLIFrameElement;
			url: string;
			label: string;
			cancelProbe: () => void;
		}
	> = new Map();

	/** Monotonic id generator for external tabs. */
	private externalTabSeq = 0;

	/** Which tab is currently foregrounded: 'primary' or a tab id. */
	private activeTabId: 'primary' | string = 'primary';

	/** Callbacks for external events. */
	public onFocusRequest: ( ( win: Window ) => void ) | null = null;
	public onClose: ( ( win: Window ) => void ) | null = null;
	public onMinimize: ( ( win: Window ) => void ) | null = null;
	/**
	 * Invoked when the title-bar menu's "Open another" item is clicked.
	 * The window manager wires this to `openNew()`.
	 */
	public onOpenAnother: ( ( win: Window ) => void ) | null = null;

	/**
	 * Invoked when the title-bar menu's "Open on startup" item is
	 * toggled. The shell wires this to the public
	 * `wp.desktop.setDefaultWindow()` call, which writes the user's
	 * preference and fires the `default-window-changed` event.
	 */
	public onToggleStartup: ( ( win: Window ) => void ) | null = null;

	/** Bound handler used to close the actions menu on outside clicks. */
	private boundOnDocumentPointerDown: ( ( e: PointerEvent ) => void ) | null = null;

	constructor( config: WindowConfig ) {
		this.id = config.id;
		this.config = config;
		this.element = createWindowElement( config );
		this.iframe = config.native
			? null
			: ( this.element.querySelector( '.wp-desktop-window__iframe' ) as HTMLIFrameElement );
		this.titleBar = this.element.querySelector( '.wp-desktop-window__titlebar' ) as HTMLElement;
		this.titleEl = this.element.querySelector( '.wp-desktop-window__title' ) as HTMLElement;
		this.boundOnMessage = this.onMessage.bind( this );

		this.bindEvents();

		// Native windows: let the module fill the body. We call render()
		// before the opening animation so the first frame shows the
		// rendered UI rather than an empty flash.
		if ( config.native && config.render ) {
			const body = this.element.querySelector(
				'.wp-desktop-window__body',
			) as HTMLElement | null;
			if ( body ) {
				config.render( body );
			}
		}

		// Session-restored minimized windows must paint already-minimized on
		// the first frame — otherwise the user sees the opening fade-in
		// followed by the minimize transition (a visible flicker on every
		// page refresh). Apply the minimized class before the element is in
		// the DOM so no transition runs, skip the opening animation, hide
		// the iframe immediately, and bypass the emitChange save the regular
		// minimize() path would fire for state the server already has.
		if ( config.initialState === 'minimized' ) {
			this.state = 'minimized';
			this.element.classList.add( 'wp-desktop-window--minimized' );
			if ( this.iframe ) {
				this.iframe.style.visibility = 'hidden';
			}
			return;
		}

		// Fresh open (or restored to a visible state). Play the opening
		// animation, then remove the class.
		this.element.classList.add( 'wp-desktop-window--opening' );
		this.element.addEventListener( 'animationend', () => {
			this.element.classList.remove( 'wp-desktop-window--opening' );
		}, { once: true } );

		// Maximized/fullscreen restores go through the class-driven path
		// after the geometry renders, so the state transition animates.
		// 'normal' is the default — applying it would echo a redundant save.
		if ( config.initialState && config.initialState !== 'normal' ) {
			requestAnimationFrame( () => this.applyInitialState( config.initialState! ) );
		}
	}

	/**
	 * Apply a state restored from the session. Called once, after construction.
	 */
	private applyInitialState( state: WindowState ): void {
		if ( state === 'minimized' ) {
			this.minimize();
		} else if ( state === 'maximized' ) {
			this.toggleMaximize();
		} else if ( state === 'fullscreen' ) {
			this.toggleFullscreen();
		}
	}

	/**
	 * Dispatch a `wp-desktop-window-changed` event so the session-save
	 * path can schedule a debounced write. Called after any state change
	 * that should end up persisted: drag end, resize end, minimize,
	 * restore, maximize toggle, fullscreen toggle.
	 */
	private emitChange( reason: 'moved' | 'resized' | 'state' ): void {
		document.dispatchEvent(
			new CustomEvent( 'wp-desktop-window-changed', {
				detail: { windowId: this.id, reason, state: this.state },
			} ),
		);
	}

	/**
	 * Returns the current resolved URL of the iframe — preferring the
	 * content window's location (reflects in-window navigation) and
	 * falling back to the iframe's src attribute for cases where the
	 * content document isn't yet reachable (cross-origin edge, early
	 * load).
	 */
	public getCurrentUrl(): string {
		if ( ! this.iframe ) {
			return this.config.url;
		}
		try {
			const href = this.iframe.contentWindow?.location.href;
			if ( href && href !== 'about:blank' ) {
				return href;
			}
		} catch {
			/* Cross-origin read rejected — fall through. */
		}
		return this.iframe.src;
	}

	/**
	 * Bind all DOM event handlers.
	 */
	private bindEvents(): void {
		// Focus on click anywhere in the window.
		this.element.addEventListener( 'pointerdown', () => {
			this.onFocusRequest?.( this );
		} );

		// Title bar drag.
		this.titleBar.addEventListener( 'pointerdown', this.onDragStart.bind( this ) );

		// Resize handle.
		const resizeHandle = this.element.querySelector( '.wp-desktop-window__resize-handle' ) as HTMLElement;
		resizeHandle.addEventListener( 'pointerdown', this.onResizeStart.bind( this ) );

		// Window control buttons.
		const btnMin = this.element.querySelector( '.wp-desktop-window__btn--minimize' ) as HTMLElement;
		const btnMax = this.element.querySelector( '.wp-desktop-window__btn--maximize' ) as HTMLElement;
		const btnFocus = this.element.querySelector( '.wp-desktop-window__btn--focus' ) as HTMLElement;
		// Native windows skip the detach button entirely.
		const btnDetach = this.element.querySelector(
			'.wp-desktop-window__btn--detach',
		) as HTMLElement | null;
		const btnClose = this.element.querySelector( '.wp-desktop-window__btn--close' ) as HTMLElement;

		// Title-bar actions menu (multi-capable windows only — button
		// absent for singletons).
		const menuBtn = this.element.querySelector(
			'.wp-desktop-window__menu-btn',
		) as HTMLButtonElement | null;
		const menuPanel = this.element.querySelector(
			'.wp-desktop-window__menu-panel',
		) as HTMLElement | null;
		if ( menuBtn && menuPanel ) {
			menuBtn.addEventListener( 'click', ( e: Event ) => {
				e.stopPropagation();
				this.toggleActionsMenu();
			} );
			const openAnother = menuPanel.querySelector(
				'.wp-desktop-window__menu-item--open-another',
			);
			if ( openAnother ) {
				openAnother.addEventListener( 'click', ( e: Event ) => {
					e.stopPropagation();
					this.closeActionsMenu();
					this.onOpenAnother?.( this );
				} );
			}
			// "Open on startup" — checkable menu item. Hydrate its
			// checked state from the shared public API, and wire the
			// click handler to toggle via `setDefaultWindow`. The
			// callback is injected by the window manager so we don't
			// couple the Window class to wp.desktop directly.
			const startup = menuPanel.querySelector<HTMLButtonElement>(
				'.wp-desktop-window__menu-item--startup',
			);
			if ( startup ) {
				this.refreshStartupCheckState( startup );
				startup.addEventListener( 'click', ( e: Event ) => {
					// Keep the menu open — a checkbox item is a toggle,
					// not a one-shot action. Users commonly want to
					// verify the new state without reopening the menu,
					// and the REST round-trip is fast enough that the
					// optimistic flip below + the server-confirmation
					// refresh feels instant.
					e.stopPropagation();
					this.flipStartupCheckOptimistically( startup );
					this.onToggleStartup?.( this );
				} );
				// Refresh the check state whenever the public
				// default-window preference changes — this is the
				// authoritative signal (fired after the REST save
				// succeeds). If the REST failed, this event doesn't
				// fire and the optimistic flip stays until the next
				// menu open, where the canonical state from config
				// takes over.
				document.addEventListener(
					'wp-desktop-default-window-changed',
					() => {
						this.refreshStartupCheckState( startup );
					},
				);
			}
			// Escape closes the menu, returning focus to the trigger so
			// keyboard users don't lose their place.
			menuPanel.addEventListener( 'keydown', ( e: Event ) => {
				const kev = e as KeyboardEvent;
				if ( kev.key === 'Escape' ) {
					e.stopPropagation();
					this.closeActionsMenu();
					menuBtn.focus();
				}
			} );
		}

		btnMin.addEventListener( 'click', ( e: Event ) => {
			e.stopPropagation();
			this.minimize();
		} );
		btnMax.addEventListener( 'click', ( e: Event ) => {
			e.stopPropagation();
			this.toggleMaximize();
		} );
		btnFocus.addEventListener( 'click', ( e: Event ) => {
			e.stopPropagation();
			this.toggleFullscreen();
		} );
		btnDetach?.addEventListener( 'click', ( e: Event ) => {
			e.stopPropagation();
			this.detach();
		} );
		btnClose.addEventListener( 'click', ( e: Event ) => {
			e.stopPropagation();
			this.close();
		} );

		// Double-click title bar to toggle maximize.
		this.titleBar.addEventListener( 'dblclick', () => {
			this.toggleMaximize();
		} );

		// Iframe-only wiring: tab strip, load listener, and postMessage
		// bridge all presuppose an iframe. Native windows have none of
		// those affordances, so skip this whole block.
		if ( this.iframe ) {
			const iframe = this.iframe;

			// Tab strip — delegates to per-tab handlers. Three kinds of
			// clicks live here:
			//
			//   - Submenu tab        → navigate primary iframe to the
			//                          tab's URL, activate primary.
			//   - Main tab (injected  → switch back to primary iframe.
			//      when external tabs
			//      exist without a
			//      submenu)
			//   - External tab       → switch visibility to that tab's
			//                          iframe. Clicks on the ×/↗ chips
			//                          are caught here too and routed
			//                          to close() / detach() below.
			const tabs = this.element.querySelector( '.wp-desktop-window__tabs' );
			if ( tabs ) {
				tabs.addEventListener( 'click', ( e: Event ) => {
					const target = e.target as HTMLElement;
					// Closeable-tab chips. `data-tab-action` distinguishes
					// them from the tab body so the "switch tab" branch
					// below doesn't fire for chip clicks.
					const chip = target.closest<HTMLElement>( '[data-tab-action]' );
					if ( chip ) {
						e.stopPropagation();
						const action = chip.dataset.tabAction;
						const tabId = chip.dataset.tabId;
						if ( ! tabId ) {
							return;
						}
						if ( action === 'close' ) {
							this.closeExternalTab( tabId );
						} else if ( action === 'detach' ) {
							this.detachExternalTab( tabId );
						}
						return;
					}

					const tab = target.closest<HTMLElement>( '.wp-desktop-window__tab' );
					if ( ! tab ) {
						return;
					}
					e.stopPropagation();

					const kind = tab.dataset.kind;
					const tabId = tab.dataset.tabId;
					if ( kind === 'external' && tabId ) {
						this.switchToTab( tabId );
						return;
					}
					if ( kind === 'main' ) {
						this.switchToTab( 'primary' );
						return;
					}
					// Submenu tab — navigate primary iframe in place
					// and bring it forward. The load listener below
					// syncs the active-tab highlight.
					if ( tab.dataset.url ) {
						const next = withChromelessParam( tab.dataset.url );
						if ( next ) {
							iframe.src = next;
						}
						this.switchToTab( 'primary' );
					}
				} );
			}

			// Sync the active tab whenever the iframe finishes a navigation.
			// Reading iframe.contentWindow.location is safe because we only
			// allow same-origin URLs; cross-origin would have thrown earlier.
			iframe.addEventListener( 'load', () => {
				try {
					const href = iframe.contentWindow?.location.href;
					if ( href ) {
						this.syncActiveTab( href );
					}
				} catch {
					/* Cross-origin or detached frame — ignore. */
				}
			} );

			// Listen for postMessage from iframe.
			window.addEventListener( 'message', this.boundOnMessage );
		}
	}

	/**
	 * Update the active tab to whichever submenu URL matches the iframe's
	 * current location. Called after every iframe navigation.
	 *
	 * Only submenu tabs participate in URL-based matching. External
	 * sub-tabs and the injected "main" tab manage their own active
	 * state through `switchToTab`, since their notion of "active"
	 * isn't a URL comparison — it's which iframe is foregrounded.
	 */
	private syncActiveTab( currentUrl: string ): void {
		const submenuTabs = this.element.querySelectorAll<HTMLElement>(
			'.wp-desktop-window__tab[data-kind="submenu"]',
		);
		if ( ! submenuTabs.length ) {
			return;
		}
		// If an external tab is currently foregrounded, submenu tabs
		// are all inactive — the primary iframe's URL isn't what the
		// user is looking at.
		if ( this.activeTabId !== 'primary' ) {
			for ( const tab of submenuTabs ) {
				tab.classList.remove( 'wp-desktop-window__tab--active' );
				tab.setAttribute( 'aria-selected', 'false' );
			}
			return;
		}
		const activeKey = urlMatchKey( currentUrl );
		for ( const tab of submenuTabs ) {
			const tabUrl = tab.dataset.url;
			const isActive = !! tabUrl && urlMatchKey( tabUrl ) === activeKey;
			tab.classList.toggle( 'wp-desktop-window__tab--active', isActive );
			tab.setAttribute( 'aria-selected', isActive ? 'true' : 'false' );
		}
	}

	/**
	 * Add a closeable+detachable sub-tab hosting an external URL.
	 *
	 * Flow:
	 *   1. Lazily create a "Main" tab if this is the first external
	 *      tab on a window that has no submenu (otherwise the user
	 *      would have no way to get back to the admin page).
	 *   2. Create an iframe for the external URL, hidden by default.
	 *   3. Append a tab to the strip with label + detach + close chips.
	 *   4. Switch to the new tab.
	 *   5. Start a 2s readiness probe — if the iframe's `load` event
	 *      doesn't fire in that window (network failure, hard block),
	 *      auto-dismiss the tab and open the URL in a real browser
	 *      tab with an explanatory toast. For subtler blocks
	 *      (X-Frame-Options showing the browser's error page *inside*
	 *      the iframe, which does fire `load`), the user sees the
	 *      error and can hit the detach button themselves.
	 */
	public addExternalTab( url: string, label: string ): void {
		if ( ! this.iframe ) {
			// Native windows don't host iframes — no tab strip exists.
			return;
		}
		const tabStrip = this.element.querySelector<HTMLElement>(
			'.wp-desktop-window__tabs',
		);
		const body = this.element.querySelector<HTMLElement>(
			'.wp-desktop-window__body',
		);
		if ( ! tabStrip || ! body ) {
			return;
		}

		this.ensureMainTab( tabStrip );

		const tabId = `ext-${ ++this.externalTabSeq }`;

		// Build the tab element with label + detach + close chips.
		const tabEl = document.createElement( 'button' );
		tabEl.className = 'wp-desktop-window__tab wp-desktop-window__tab--external';
		tabEl.dataset.kind = 'external';
		tabEl.dataset.tabId = tabId;
		tabEl.setAttribute( 'type', 'button' );
		tabEl.setAttribute( 'role', 'tab' );
		tabEl.setAttribute( 'aria-selected', 'false' );
		tabEl.title = url;

		const labelEl = document.createElement( 'span' );
		labelEl.className = 'wp-desktop-window__tab-label';
		labelEl.textContent = label;
		tabEl.appendChild( labelEl );

		const detachBtn = document.createElement( 'span' );
		detachBtn.className = 'wp-desktop-window__tab-chip wp-desktop-window__tab-chip--detach';
		detachBtn.dataset.tabAction = 'detach';
		detachBtn.dataset.tabId = tabId;
		detachBtn.setAttribute( 'role', 'button' );
		detachBtn.setAttribute( 'aria-label', 'Open in a new browser tab' );
		detachBtn.title = 'Open in a new browser tab';
		detachBtn.innerHTML =
			'<svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
			'<path d="M5 2H2.5v7.5H10V7M6.5 2H10v3.5M10 2L5.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
			'</svg>';
		tabEl.appendChild( detachBtn );

		const closeBtn = document.createElement( 'span' );
		closeBtn.className = 'wp-desktop-window__tab-chip wp-desktop-window__tab-chip--close';
		closeBtn.dataset.tabAction = 'close';
		closeBtn.dataset.tabId = tabId;
		closeBtn.setAttribute( 'role', 'button' );
		closeBtn.setAttribute( 'aria-label', 'Close tab' );
		closeBtn.title = 'Close tab';
		closeBtn.innerHTML =
			'<svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
			'<path d="M3.25 3.25l5.5 5.5M3.25 8.75l5.5-5.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
			'</svg>';
		tabEl.appendChild( closeBtn );

		tabStrip.appendChild( tabEl );

		// Build the iframe. Hidden until we switch to it. `sandbox`
		// intentionally omitted — external sites often need scripts,
		// forms, and same-origin cookies to function. The iframe is
		// cross-origin anyway so the site can't reach our shell DOM.
		const iframe = document.createElement( 'iframe' );
		iframe.className = 'wp-desktop-window__iframe wp-desktop-window__iframe--external';
		iframe.dataset.tabId = tabId;
		iframe.style.display = 'none';
		iframe.src = url;
		body.appendChild( iframe );

		// Readiness probe. If `load` never fires within
		// `EXTERNAL_IFRAME_READY_TIMEOUT_MS`, we assume the request
		// failed at the network layer (DNS, offline, connection
		// refused) and fall back to a real browser tab. When `load`
		// does fire — even for X-Frame-Options-blocked requests that
		// render the browser's error page inside the iframe — we keep
		// the tab; the user can see the failure and hit the detach
		// button themselves.
		let loaded = false;
		const onLoad = (): void => {
			loaded = true;
		};
		iframe.addEventListener( 'load', onLoad, { once: true } );
		const probeTimer = window.setTimeout( () => {
			if ( loaded ) {
				return;
			}
			iframe.removeEventListener( 'load', onLoad );
			this.fallbackToBrowserTab( tabId );
		}, EXTERNAL_IFRAME_READY_TIMEOUT_MS ) as unknown as number;

		const cancelProbe = (): void => {
			iframe.removeEventListener( 'load', onLoad );
			window.clearTimeout( probeTimer );
		};

		this.externalTabs.set( tabId, {
			tabEl,
			iframe,
			url,
			label,
			cancelProbe,
		} );

		this.switchToTab( tabId );
		tabEl.scrollIntoView( { behavior: 'smooth', inline: 'end', block: 'nearest' } );
		// Trigger the session saver so this tab survives a reload.
		// The saver subscribes to `wp-desktop-window-changed`, which
		// emitChange already dispatches for the debounce layer; we
		// reuse the 'state' reason — the tab list is part of window
		// state as far as persistence is concerned.
		this.emitChange( 'state' );
	}

	/**
	 * Injects a "Main" tab at the start of the strip once external
	 * tabs exist. For windows that already have a submenu, no main
	 * tab is injected — submenu tabs already act as the return path
	 * to primary content. Idempotent.
	 */
	private ensureMainTab( tabStrip: HTMLElement ): void {
		if ( tabStrip.querySelector( '[data-kind="main"]' ) ) {
			return;
		}
		if ( tabStrip.querySelector( '[data-kind="submenu"]' ) ) {
			// Submenu tabs already serve as the primary-anchor.
			return;
		}
		const main = document.createElement( 'button' );
		main.className = 'wp-desktop-window__tab wp-desktop-window__tab--main wp-desktop-window__tab--active';
		main.dataset.kind = 'main';
		main.setAttribute( 'type', 'button' );
		main.setAttribute( 'role', 'tab' );
		main.setAttribute( 'aria-selected', 'true' );
		main.textContent = this.config.title || 'Main';
		tabStrip.prepend( main );
	}

	/**
	 * Foreground a tab — either the primary iframe (tabId='primary')
	 * or one of the external sub-tabs. Updates visibility across all
	 * iframes and active state across all tabs.
	 */
	private switchToTab( tabId: 'primary' | string ): void {
		if ( this.activeTabId === tabId ) {
			return;
		}
		this.activeTabId = tabId;

		// Primary iframe visibility.
		if ( this.iframe ) {
			this.iframe.style.display = tabId === 'primary' ? '' : 'none';
		}

		// External iframes.
		for ( const [ id, entry ] of this.externalTabs ) {
			entry.iframe.style.display = tabId === id ? '' : 'none';
		}

		// Tab active-state.
		const tabEls = this.element.querySelectorAll<HTMLElement>(
			'.wp-desktop-window__tab',
		);
		tabEls.forEach( ( t ) => {
			let isActive: boolean;
			if ( t.dataset.kind === 'main' ) {
				isActive = tabId === 'primary';
			} else if ( t.dataset.kind === 'external' ) {
				isActive = t.dataset.tabId === tabId;
			} else {
				// Submenu tab — only "active" when primary is
				// foregrounded AND the tab's URL matches the iframe's
				// current URL. `syncActiveTab` handles the URL match
				// after navigation; here we just make sure switching
				// AWAY to an external tab deactivates all submenu tabs.
				isActive =
					tabId === 'primary' &&
					t.classList.contains(
						'wp-desktop-window__tab--active',
					);
			}
			t.classList.toggle( 'wp-desktop-window__tab--active', isActive );
			t.setAttribute( 'aria-selected', isActive ? 'true' : 'false' );
		} );
	}

	/** Remove an external sub-tab + its iframe. */
	private closeExternalTab( tabId: string ): void {
		const entry = this.externalTabs.get( tabId );
		if ( ! entry ) {
			return;
		}
		entry.cancelProbe();
		entry.tabEl.remove();
		entry.iframe.remove();
		this.externalTabs.delete( tabId );
		if ( this.activeTabId === tabId ) {
			this.switchToTab( 'primary' );
		}
		// If the last external tab closed AND we injected a main tab,
		// remove it — returning the window to its pre-external state.
		if ( this.externalTabs.size === 0 ) {
			const main = this.element.querySelector(
				'.wp-desktop-window__tab--main',
			);
			main?.remove();
		}
		// Poke the session saver so the closed tab doesn't resurrect
		// on reload.
		this.emitChange( 'state' );
	}

	/**
	 * Open an external sub-tab's current URL in a real browser tab and
	 * close the sub-tab. The iframe's `contentWindow.location` may have
	 * navigated beyond the original URL; we prefer that live URL so a
	 * user who drilled 3 pages deep into an external site gets taken
	 * to the right spot.
	 */
	private detachExternalTab( tabId: string ): void {
		const entry = this.externalTabs.get( tabId );
		if ( ! entry ) {
			return;
		}
		let url = entry.url;
		try {
			const href = entry.iframe.contentWindow?.location.href;
			if ( href && href !== 'about:blank' ) {
				url = href;
			}
		} catch {
			/* Cross-origin — we can't read it; stick with the original URL. */
		}
		window.open( url, '_blank', 'noopener' );
		this.closeExternalTab( tabId );
	}

	/**
	 * Fallback for sub-tabs that fail to load within the probe window.
	 * Dismisses the sub-tab, opens the URL as a real browser tab, and
	 * flashes a toast explaining why the shell gave up on embedding.
	 */
	private fallbackToBrowserTab( tabId: string ): void {
		const entry = this.externalTabs.get( tabId );
		if ( ! entry ) {
			return;
		}
		const { url, label } = entry;
		this.closeExternalTab( tabId );
		showToast( {
			message: `Opened "${ label }" in a new browser tab — this site doesn't allow embedding.`,
			action: {
				label: 'Open',
				onClick: () => {
					window.open( url, '_blank', 'noopener' );
				},
			},
		} );
		window.open( url, '_blank', 'noopener' );
	}

	/**
	 * Handle postMessage events from the iframe.
	 */
	private onMessage( event: MessageEvent ): void {
		// Only accept same-origin messages from our own iframe.
		if ( event.origin !== window.location.origin ) {
			return;
		}
		if ( ! this.iframe || event.source !== this.iframe.contentWindow ) {
			return;
		}

		const data = event.data;
		if ( ! data || typeof data.type !== 'string' ) {
			return;
		}

		if ( data.type === 'wp-desktop-title-change' && typeof data.title === 'string' ) {
			this.setTitle( data.title );
		}

		if ( data.type === 'wp-desktop-screen-meta' && Array.isArray( data.panels ) ) {
			this.addScreenMetaButtons( data.panels as string[] );
		}

		if ( data.type === 'wp-desktop-screen-meta-state' ) {
			this.setActiveScreenMetaPanel(
				typeof data.open === 'string' ? data.open : null,
			);
		}

		if (
			data.type === 'wp-desktop-external-link' &&
			typeof data.url === 'string' &&
			data.url !== ''
		) {
			const label = typeof data.label === 'string' && data.label !== ''
				? data.label
				: data.url;
			this.addExternalTab( data.url, label );
		}
	}

	/**
	 * Add Screen Options / Help buttons to the title bar.
	 *
	 * Called when the iframe reports which screen-meta panels are available.
	 * Repopulates on every call — the iframe re-announces on each navigation,
	 * and different pages expose different panels.
	 */
	private addScreenMetaButtons( panels: string[] ): void {
		const container = this.element.querySelector( '.wp-desktop-window__screen-meta' );
		if ( ! container ) {
			return;
		}
		container.innerHTML = '';

		const panelConfig: Record<string, { icon: string; label: string }> = {
			'screen-options': { icon: 'dashicons-admin-generic', label: 'Screen Options' },
			help: { icon: 'dashicons-editor-help', label: 'Help' },
		};

		for ( const panel of panels ) {
			const cfg = panelConfig[ panel ];
			if ( ! cfg ) {
				continue;
			}

			const btn = document.createElement( 'button' );
			btn.className = 'wp-desktop-window__meta-btn';
			btn.setAttribute( 'type', 'button' );
			btn.setAttribute( 'aria-label', cfg.label );
			btn.setAttribute( 'aria-pressed', 'false' );
			btn.dataset.panel = panel;
			btn.innerHTML = `<span class="dashicons ${ cfg.icon }" aria-hidden="true"></span>`;

			// The iframe owns panel state. We request a toggle and wait
			// for the authoritative state message back before updating
			// the button's --active class.
			btn.addEventListener( 'click', ( e: Event ) => {
				e.stopPropagation();
				this.iframe?.contentWindow?.postMessage(
					{ type: 'wp-desktop-toggle-panel', panel },
					window.location.origin,
				);
			} );

			container.appendChild( btn );
		}
	}

	/**
	 * Reflect the iframe's authoritative screen-meta state on the
	 * title-bar buttons. At most one button is active at a time.
	 */
	private setActiveScreenMetaPanel( panel: string | null ): void {
		const container = this.element.querySelector( '.wp-desktop-window__screen-meta' );
		if ( ! container ) {
			return;
		}
		container.querySelectorAll<HTMLElement>( '.wp-desktop-window__meta-btn' ).forEach( ( btn ) => {
			const isActive = btn.dataset.panel === panel;
			btn.classList.toggle( 'wp-desktop-window__meta-btn--active', isActive );
			btn.setAttribute( 'aria-pressed', isActive ? 'true' : 'false' );
		} );
	}

	/**
	 * Start dragging the window.
	 */
	private onDragStart( e: PointerEvent ): void {
		// Only drag from the title bar background, not from any buttons.
		const target = e.target as HTMLElement;
		if (
			target.closest( '.wp-desktop-window__controls' ) ||
			target.closest( '.wp-desktop-window__screen-meta' ) ||
			target.closest( '.wp-desktop-window__menu-btn' ) ||
			target.closest( '.wp-desktop-window__menu-panel' )
		) {
			return;
		}

		if ( this.state === 'maximized' ) {
			return;
		}

		this.isDragging = true;
		this.dragOffsetX = e.clientX - this.element.offsetLeft;
		this.dragOffsetY = e.clientY - this.element.offsetTop;
		this.titleBar.setPointerCapture( e.pointerId );

		// Add an overlay to prevent iframe from eating pointer events during drag.
		this.element.classList.add( 'wp-desktop-window--dragging' );
		doAction( HOOKS.WINDOW_DRAG_START, { windowId: this.id } );

		const onDragMove = ( ev: PointerEvent ): void => {
			if ( ! this.isDragging ) {
				return;
			}
			let x = ev.clientX - this.dragOffsetX;
			let y = ev.clientY - this.dragOffsetY;

			// Constrain to desktop bounds.
			const desktop = this.element.parentElement;
			if ( desktop ) {
				x = Math.max( EDGE_MARGIN, Math.min( x, desktop.clientWidth - EDGE_MARGIN ) );
				y = Math.max( EDGE_MARGIN, Math.min( y, desktop.clientHeight - EDGE_MARGIN ) );
			}

			this.element.style.left = `${ x }px`;
			this.element.style.top = `${ y }px`;
		};

		const onDragEnd = (): void => {
			if ( ! this.isDragging ) {
				return;
			}
			this.isDragging = false;
			this.element.classList.remove( 'wp-desktop-window--dragging' );
			this.titleBar.removeEventListener( 'pointermove', onDragMove );
			this.titleBar.removeEventListener( 'pointerup', onDragEnd );
			this.titleBar.removeEventListener( 'pointercancel', onDragEnd );
			this.titleBar.removeEventListener( 'lostpointercapture', onDragEnd );
			this.emitChange( 'moved' );
			const payload = {
				windowId: this.id,
				x: this.element.offsetLeft,
				y: this.element.offsetTop,
			};
			doAction( HOOKS.WINDOW_DRAG_END, payload );
			doAction( HOOKS.WINDOW_MOVED, payload );
		};

		this.titleBar.addEventListener( 'pointermove', onDragMove );
		this.titleBar.addEventListener( 'pointerup', onDragEnd );
		this.titleBar.addEventListener( 'pointercancel', onDragEnd );
		this.titleBar.addEventListener( 'lostpointercapture', onDragEnd );
	}

	/**
	 * Start resizing the window.
	 */
	private onResizeStart( e: PointerEvent ): void {
		if ( this.state === 'maximized' ) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		this.isResizing = true;
		this.resizeStartX = e.clientX;
		this.resizeStartY = e.clientY;
		this.resizeStartW = this.element.offsetWidth;
		this.resizeStartH = this.element.offsetHeight;

		( e.target as HTMLElement ).setPointerCapture( e.pointerId );
		this.element.classList.add( 'wp-desktop-window--resizing' );
		doAction( HOOKS.WINDOW_RESIZE_START, { windowId: this.id } );

		const onResizeMove = ( ev: PointerEvent ): void => {
			if ( ! this.isResizing ) {
				return;
			}
			const newW = Math.max( this.config.minWidth, this.resizeStartW + ( ev.clientX - this.resizeStartX ) );
			const newH = Math.max( this.config.minHeight, this.resizeStartH + ( ev.clientY - this.resizeStartY ) );
			this.element.style.width = `${ newW }px`;
			this.element.style.height = `${ newH }px`;
		};

		const onResizeEnd = (): void => {
			if ( ! this.isResizing ) {
				return;
			}
			this.isResizing = false;
			this.element.classList.remove( 'wp-desktop-window--resizing' );
			const handle = this.element.querySelector( '.wp-desktop-window__resize-handle' ) as HTMLElement;
			handle.removeEventListener( 'pointermove', onResizeMove );
			handle.removeEventListener( 'pointerup', onResizeEnd );
			handle.removeEventListener( 'pointercancel', onResizeEnd );
			handle.removeEventListener( 'lostpointercapture', onResizeEnd );
			this.emitChange( 'resized' );
			const payload = {
				windowId: this.id,
				width: this.element.offsetWidth,
				height: this.element.offsetHeight,
			};
			doAction( HOOKS.WINDOW_RESIZE_END, payload );
			doAction( HOOKS.WINDOW_RESIZED, payload );
		};

		const handle = e.target as HTMLElement;
		handle.addEventListener( 'pointermove', onResizeMove );
		handle.addEventListener( 'pointerup', onResizeEnd );
		handle.addEventListener( 'pointercancel', onResizeEnd );
		handle.addEventListener( 'lostpointercapture', onResizeEnd );
	}

	/**
	 * Set the z-index of this window.
	 */
	public setZIndex( z: number ): void {
		this.element.style.zIndex = String( z );
	}

	/**
	 * Mark this window as focused or unfocused.
	 */
	public setFocused( focused: boolean ): void {
		this.element.classList.toggle( 'wp-desktop-window--focused', focused );
	}

	/**
	 * Update the window title.
	 */
	public setTitle( title: string ): void {
		this.titleEl.textContent = title;
		doAction( HOOKS.WINDOW_TITLE_CHANGED, { windowId: this.id, title } );
	}

	/**
	 * Minimize the window.
	 */
	public minimize(): void {
		this.state = 'minimized';
		this.element.classList.add( 'wp-desktop-window--minimized' );

		// After the transition completes, hide the iframe to save resources.
		// Native windows don't have an iframe to hide — opacity: 0 on the
		// window element already stops paint work.
		if ( this.iframe ) {
			const iframe = this.iframe;
			this.element.addEventListener( 'transitionend', ( e: TransitionEvent ) => {
				if ( e.propertyName === 'opacity' && this.state === 'minimized' ) {
					iframe.style.visibility = 'hidden';
				}
			}, { once: true } );
		}

		this.onMinimize?.( this );
		this.emitChange( 'state' );
		doAction( HOOKS.WINDOW_MINIMIZED, { windowId: this.id } );
	}

	/**
	 * Restore the window from minimized state.
	 */
	public restore(): void {
		// Restore iframe visibility before the animation starts.
		if ( this.iframe ) {
			this.iframe.style.visibility = '';
		}

		const wasMinimized = this.state === 'minimized';
		this.element.classList.remove( 'wp-desktop-window--minimized' );
		if ( wasMinimized ) {
			this.state = 'normal';
		}
		this.onFocusRequest?.( this );
		this.emitChange( 'state' );
		if ( wasMinimized ) {
			doAction( HOOKS.WINDOW_RESTORED, { windowId: this.id } );
		}
	}

	/**
	 * Toggle between maximized and normal states.
	 */
	public toggleMaximize(): void {
		const parent = this.element.parentElement;
		if ( ! parent ) {
			return;
		}

		if ( this.state === 'maximized' ) {
			// Restore to saved geometry. The maximized class is removed *after*
			// the next frame so the class-driven border-radius animates in sync.
			this.element.classList.remove( 'wp-desktop-window--maximized' );
			if ( this.savedGeometry ) {
				this.element.style.left = `${ this.savedGeometry.x }px`;
				this.element.style.top = `${ this.savedGeometry.y }px`;
				this.element.style.width = `${ this.savedGeometry.width }px`;
				this.element.style.height = `${ this.savedGeometry.height }px`;
			}
			this.state = 'normal';
			this.emitChange( 'state' );
			doAction( HOOKS.WINDOW_UNMAXIMIZED, { windowId: this.id } );
		} else {
			// Save current geometry, then animate to the desktop area's bounds.
			this.savedGeometry = {
				x: this.element.offsetLeft,
				y: this.element.offsetTop,
				width: this.element.offsetWidth,
				height: this.element.offsetHeight,
			};
			this.element.classList.add( 'wp-desktop-window--maximized' );
			this.element.style.left = '0px';
			this.element.style.top = '0px';
			this.element.style.width = `${ parent.clientWidth }px`;
			this.element.style.height = `${ parent.clientHeight }px`;
			this.state = 'maximized';
			this.emitChange( 'state' );
			doAction( HOOKS.WINDOW_MAXIMIZED, { windowId: this.id } );
		}
	}

	/**
	 * Toggle fullscreen ("focus") mode — the window covers the entire
	 * viewport, hiding the admin bar, dock, and taskbar behind it.
	 *
	 * This is the equivalent of macOS's green zoom-to-fullscreen: an
	 * immersive mode distinct from maximize (which only fills the
	 * desktop area between dock and taskbar).
	 */
	public toggleFullscreen(): void {
		if ( this.state === 'fullscreen' ) {
			// Restore whichever state the window was in before fullscreen.
			this.element.classList.remove( 'wp-desktop-window--fullscreen' );
			if ( this.savedFullscreenState ) {
				const s = this.savedFullscreenState;
				this.element.style.left = `${ s.x }px`;
				this.element.style.top = `${ s.y }px`;
				this.element.style.width = `${ s.width }px`;
				this.element.style.height = `${ s.height }px`;
				this.element.classList.toggle(
					'wp-desktop-window--maximized',
					s.state === 'maximized',
				);
				this.state = s.state;
				this.savedFullscreenState = null;
			} else {
				this.state = 'normal';
			}
		} else {
			this.savedFullscreenState = {
				state: this.state,
				x: this.element.offsetLeft,
				y: this.element.offsetTop,
				width: this.element.offsetWidth,
				height: this.element.offsetHeight,
			};
			this.element.classList.add( 'wp-desktop-window--fullscreen' );
			this.state = 'fullscreen';
		}
		updateFullscreenBodyClass();
		this.updateFocusButtonState();
		this.emitChange( 'state' );
		doAction(
			this.state === 'fullscreen'
				? HOOKS.WINDOW_FULLSCREEN_ENTERED
				: HOOKS.WINDOW_FULLSCREEN_EXITED,
			{ windowId: this.id },
		);
	}

	/**
	 * Reflect fullscreen state on the focus-mode button (active class,
	 * aria-pressed, and label).
	 */
	private updateFocusButtonState(): void {
		const btn = this.element.querySelector<HTMLButtonElement>(
			'.wp-desktop-window__btn--focus',
		);
		if ( ! btn ) {
			return;
		}
		const isFullscreen = this.state === 'fullscreen';
		btn.classList.toggle( 'wp-desktop-window__btn--active', isFullscreen );
		btn.setAttribute( 'aria-pressed', isFullscreen ? 'true' : 'false' );
		btn.setAttribute(
			'aria-label',
			isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen',
		);
	}

	/**
	 * Open the window's current URL in a new browser tab as classic
	 * wp-admin.
	 *
	 * Strips the chromeless `wp_desktop` flag and the transient
	 * `wp_desktop_portal` flag, and tags the URL with
	 * `wp_desktop_classic=1` so the server-side admin_init redirect
	 * (which otherwise forwards plain admin URLs to `/wp-desktop/`)
	 * lets the request through. The tag only has to survive the first
	 * request; once the browser renders the page, the user's in-tab
	 * navigation returns to normal admin flow.
	 *
	 * The desktop window itself stays open — detach is a branch, not
	 * a move. If the user wants to close it afterwards, they can.
	 */
	public detach(): void {
		const current = this.getCurrentUrl();
		let url: URL;
		try {
			url = new URL( current, window.location.origin );
		} catch {
			return;
		}
		if ( url.origin !== window.location.origin ) {
			return;
		}
		url.searchParams.delete( 'wp_desktop' );
		url.searchParams.delete( 'wp_desktop_portal' );
		url.searchParams.set( 'wp_desktop_classic', '1' );

		// `noopener` is required for security (tabs should not be able to
		// reach back into window.opener), and it also lets the browser
		// move the new tab to its own process.
		window.open( url.toString(), '_blank', 'noopener' );
		doAction( HOOKS.WINDOW_DETACHED, { windowId: this.id, url: url.toString() } );
	}

	/**
	 * Toggle the title-bar actions menu.
	 */
	/**
	 * Flip the "Open on startup" check state immediately on click so
	 * the user sees instant feedback — the REST round-trip confirms
	 * shortly after via the `wp-desktop-default-window-changed` event,
	 * which calls `refreshStartupCheckState` with the canonical state.
	 * If the REST fails the optimistic flip stays (wrong) until the
	 * next menu open, where the canonical check takes over.
	 */
	private flipStartupCheckOptimistically( button: HTMLButtonElement ): void {
		const isChecked = button.getAttribute( 'aria-checked' ) === 'true';
		const next = ! isChecked;
		button.setAttribute( 'aria-checked', next ? 'true' : 'false' );
		button.classList.toggle( 'wp-desktop-window__menu-item--checked', next );
	}

	/**
	 * Compare this window's current URL against the user's saved
	 * default-window preference and paint the "Open on startup" menu
	 * item's checked state accordingly. Called when the menu is built
	 * and every time the public preference changes.
	 */
	private refreshStartupCheckState( button: HTMLButtonElement ): void {
		const pref = window.wp?.desktop?.config?.defaultWindow;
		let isDefault = false;
		if ( pref && pref.enabled && typeof pref.url === 'string' ) {
			try {
				const currentKey = urlMatchKey( this.getCurrentUrl() );
				const prefKey = urlMatchKey( pref.url );
				isDefault = currentKey === prefKey;
			} catch {
				isDefault = false;
			}
		}
		button.setAttribute( 'aria-checked', isDefault ? 'true' : 'false' );
		button.classList.toggle(
			'wp-desktop-window__menu-item--checked',
			isDefault,
		);
	}

	private toggleActionsMenu(): void {
		const panel = this.element.querySelector(
			'.wp-desktop-window__menu-panel',
		) as HTMLElement | null;
		if ( ! panel ) {
			return;
		}
		if ( panel.hidden ) {
			this.openActionsMenu();
		} else {
			this.closeActionsMenu();
		}
	}

	/**
	 * Open the title-bar actions menu and wire an outside-click listener
	 * that dismisses it. The listener uses pointerdown (capture phase) so
	 * it fires before any click handler on the clicked target, which keeps
	 * dock/icon clicks outside the menu from opening-then-immediately-
	 * closing anything.
	 */
	private openActionsMenu(): void {
		const panel = this.element.querySelector(
			'.wp-desktop-window__menu-panel',
		) as HTMLElement | null;
		const btn = this.element.querySelector(
			'.wp-desktop-window__menu-btn',
		) as HTMLButtonElement | null;
		if ( ! panel || ! btn ) {
			return;
		}
		panel.hidden = false;
		btn.setAttribute( 'aria-expanded', 'true' );

		// Refresh "Open on startup" check state every time the menu
		// opens. The initial paint runs at window construction, BEFORE
		// `window.wp.desktop` is populated, so the first read would
		// silently fall back to unchecked. Reading on each open catches
		// that plus any external change (e.g. another window toggled
		// itself as default) that hasn't propagated yet.
		const startup = panel.querySelector<HTMLButtonElement>(
			'.wp-desktop-window__menu-item--startup',
		);
		if ( startup ) {
			this.refreshStartupCheckState( startup );
		}

		if ( ! this.boundOnDocumentPointerDown ) {
			this.boundOnDocumentPointerDown = ( e: PointerEvent ) => {
				const target = e.target as Node | null;
				if ( ! target ) {
					return;
				}
				if ( panel.contains( target ) || btn.contains( target ) ) {
					return;
				}
				this.closeActionsMenu();
			};
		}
		// Attach on the next microtask so the same pointerdown that opened
		// the menu (bubbling up from the button) doesn't immediately close it.
		setTimeout( () => {
			if ( this.boundOnDocumentPointerDown ) {
				document.addEventListener(
					'pointerdown',
					this.boundOnDocumentPointerDown,
					true,
				);
			}
		}, 0 );

		// Move focus into the panel for keyboard navigation.
		const firstItem = panel.querySelector<HTMLElement>(
			'[role="menuitem"]',
		);
		firstItem?.focus();
	}

	/**
	 * Close the title-bar actions menu.
	 */
	private closeActionsMenu(): void {
		const panel = this.element.querySelector(
			'.wp-desktop-window__menu-panel',
		) as HTMLElement | null;
		const btn = this.element.querySelector(
			'.wp-desktop-window__menu-btn',
		) as HTMLButtonElement | null;
		if ( panel ) {
			panel.hidden = true;
		}
		if ( btn ) {
			btn.setAttribute( 'aria-expanded', 'false' );
		}
		if ( this.boundOnDocumentPointerDown ) {
			document.removeEventListener(
				'pointerdown',
				this.boundOnDocumentPointerDown,
				true,
			);
		}
	}

	/**
	 * Close and destroy the window.
	 *
	 * Plays a subtle closing animation before removing the element.
	 */
	public close(): void {
		if ( this.isDestroyed ) {
			return;
		}
		this.isDestroyed = true;

		// Fire the callback immediately so the window manager updates its stack.
		this.onClose?.( this );

		this.element.classList.add( 'wp-desktop-window--closing' );

		let removed = false;
		const onDone = (): void => {
			if ( removed ) {
				return;
			}
			removed = true;
			window.removeEventListener( 'message', this.boundOnMessage );
			if ( this.boundOnDocumentPointerDown ) {
				document.removeEventListener(
					'pointerdown',
					this.boundOnDocumentPointerDown,
					true,
				);
			}
			this.element.remove();
			// If this was the last fullscreen window, drop the body class so
			// the admin bar and shell top-offset come back cleanly.
			updateFullscreenBodyClass();
		};

		const onTransitionEnd = ( e: TransitionEvent ): void => {
			if ( e.propertyName === 'opacity' ) {
				this.element.removeEventListener( 'transitionend', onTransitionEnd );
				onDone();
			}
		};
		this.element.addEventListener( 'transitionend', onTransitionEnd );

		// Safety net: if transitionend never fires (e.g. reduced-motion or no transition),
		// remove after a generous timeout so the element doesn't linger.
		setTimeout( onDone, 300 );
	}

	/**
	 * Get a snapshot of the window state for persistence.
	 */
	public getSnapshot(): { id: string; x: number; y: number; width: number; height: number; state: WindowState } {
		return {
			id: this.id,
			x: this.element.offsetLeft,
			y: this.element.offsetTop,
			width: this.element.offsetWidth,
			height: this.element.offsetHeight,
			state: this.state,
		};
	}

	/**
	 * Serializable snapshot of this window's external sub-tabs.
	 * Iteration order follows the `Map`'s insertion order, which
	 * matches the tab strip's left-to-right order — so restoring
	 * preserves the visual layout.
	 */
	public getExternalTabsSnapshot(): { url: string; label: string }[] {
		const out: { url: string; label: string }[] = [];
		for ( const entry of this.externalTabs.values() ) {
			// Prefer the iframe's live URL (navigation within the
			// sub-tab may have moved beyond the original) but fall
			// back to the initial URL when cross-origin locks us out.
			let url = entry.url;
			try {
				const href = entry.iframe.contentWindow?.location.href;
				if ( href && href !== 'about:blank' ) {
					url = href;
				}
			} catch {
				/* Cross-origin — keep the original URL. */
			}
			out.push( { url, label: entry.label } );
		}
		return out;
	}
}
