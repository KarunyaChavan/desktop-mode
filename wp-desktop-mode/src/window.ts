/**
 * Desktop Mode — Window.
 *
 * A single desktop window: title bar, iframe content, drag, resize, state management.
 *
 * @since 6.9.0
 */

import type { WindowConfig, WindowState } from './types';
import { sanitizeClassName } from './utils';

/** Minimum distance from viewport edges when dragging. */
const EDGE_MARGIN = 8;

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
 * Returns a comparable key for two URLs so the active tab can be detected
 * regardless of the chromeless flag or trailing slashes.
 */
function urlMatchKey( url: string ): string {
	try {
		const parsed = new URL( url, window.location.origin );
		parsed.searchParams.delete( 'wp_desktop' );
		return parsed.pathname.replace( /\/+$/, '' ) + '?' + parsed.searchParams.toString();
	} catch {
		return url;
	}
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
	btn.innerHTML = `<svg class="wp-desktop-window__btn-icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">${ svgInner }</svg>`;
	return btn;
}

/**
 * Creates the DOM structure for a desktop window.
 */
function createWindowElement( config: WindowConfig ): HTMLElement {
	const el = document.createElement( 'div' );
	el.className = 'wp-desktop-window';
	el.id = `wp-window-${ config.id }`;
	el.setAttribute( 'role', 'dialog' );
	el.setAttribute( 'aria-labelledby', `wp-window-title-${ config.id }` );
	el.style.left = `${ config.x }px`;
	el.style.top = `${ config.y }px`;
	el.style.width = `${ config.width }px`;
	el.style.height = `${ config.height }px`;

	const titleBar = document.createElement( 'div' );
	titleBar.className = 'wp-desktop-window__titlebar';

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
		'<path d="M3 6h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>'
	);
	const btnMax = createControlButton(
		'maximize',
		'Maximize',
		'<rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.25" fill="none"/>'
	);
	const btnFocus = createControlButton(
		'focus',
		'Enter fullscreen',
		'<path d="M4.5 2H2v2.5M10 4.5V2H7.5M4.5 10H2V7.5M10 7.5V10H7.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
	);
	// Detach: open this window's current URL in a new browser tab as
	// plain classic admin (no desktop shell, no chromeless). Escape hatch
	// for users who want to work on one page outside the windowed UI
	// without disabling desktop mode globally. Icon is the conventional
	// "open in new window" box + arrow.
	const btnDetach = createControlButton(
		'detach',
		'Detach to new tab',
		'<path d="M5 2H2.5v7.5H10V7M6.5 2H10v3.5M10 2L5.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
	);
	const btnClose = createControlButton(
		'close',
		'Close',
		'<path d="M3.25 3.25l5.5 5.5M3.25 8.75l5.5-5.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>'
	);

	controls.appendChild( btnMin );
	controls.appendChild( btnMax );
	controls.appendChild( btnFocus );
	controls.appendChild( btnDetach );
	controls.appendChild( btnClose );

	// Screen meta buttons container (populated when iframe reports available panels).
	const screenMeta = document.createElement( 'div' );
	screenMeta.className = 'wp-desktop-window__screen-meta';

	titleBar.appendChild( iconEl );
	titleBar.appendChild( titleEl );
	titleBar.appendChild( screenMeta );
	titleBar.appendChild( controls );

	const body = document.createElement( 'div' );
	body.className = 'wp-desktop-window__body';

	const iframe = document.createElement( 'iframe' );
	iframe.className = 'wp-desktop-window__iframe';
	iframe.setAttribute( 'name', `wp-desktop-frame-${ config.id }` );

	const chromelessSrc = withChromelessParam( config.url );
	iframe.src = chromelessSrc ?? 'about:blank';

	body.appendChild( iframe );

	// Resize handle.
	const resizeHandle = document.createElement( 'div' );
	resizeHandle.className = 'wp-desktop-window__resize-handle';

	el.appendChild( titleBar );

	// Tab strip — submenu items navigate the iframe within the same window.
	if ( config.submenu && config.submenu.length > 0 ) {
		const tabs = document.createElement( 'nav' );
		tabs.className = 'wp-desktop-window__tabs';
		tabs.setAttribute( 'role', 'tablist' );
		tabs.setAttribute( 'aria-label', `${ config.title } sub-pages` );
		const initialKey = urlMatchKey( config.url );
		for ( const sub of config.submenu ) {
			const tab = document.createElement( 'button' );
			tab.className = 'wp-desktop-window__tab';
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
	public readonly iframe: HTMLIFrameElement;
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

	/** Callbacks for external events. */
	public onFocusRequest: ( ( win: Window ) => void ) | null = null;
	public onClose: ( ( win: Window ) => void ) | null = null;
	public onMinimize: ( ( win: Window ) => void ) | null = null;

	constructor( config: WindowConfig ) {
		this.id = config.id;
		this.config = config;
		this.element = createWindowElement( config );
		this.iframe = this.element.querySelector( '.wp-desktop-window__iframe' ) as HTMLIFrameElement;
		this.titleBar = this.element.querySelector( '.wp-desktop-window__titlebar' ) as HTMLElement;
		this.titleEl = this.element.querySelector( '.wp-desktop-window__title' ) as HTMLElement;
		this.boundOnMessage = this.onMessage.bind( this );

		this.bindEvents();

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
			this.iframe.style.visibility = 'hidden';
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
			} )
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
		const btnDetach = this.element.querySelector( '.wp-desktop-window__btn--detach' ) as HTMLElement;
		const btnClose = this.element.querySelector( '.wp-desktop-window__btn--close' ) as HTMLElement;

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
		btnDetach.addEventListener( 'click', ( e: Event ) => {
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

		// Tab strip — clicks navigate the iframe in place.
		const tabs = this.element.querySelector( '.wp-desktop-window__tabs' );
		if ( tabs ) {
			tabs.addEventListener( 'click', ( e: Event ) => {
				const target = ( e.target as HTMLElement ).closest( '.wp-desktop-window__tab' ) as HTMLElement | null;
				if ( ! target || ! target.dataset.url ) {
					return;
				}
				e.stopPropagation();
				const next = withChromelessParam( target.dataset.url );
				if ( next ) {
					this.iframe.src = next;
				}
			} );
		}

		// Sync the active tab whenever the iframe finishes a navigation.
		// Reading iframe.contentWindow.location is safe because we only
		// allow same-origin URLs; cross-origin would have thrown earlier.
		this.iframe.addEventListener( 'load', () => {
			try {
				const href = this.iframe.contentWindow?.location.href;
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

	/**
	 * Update the active tab to whichever submenu URL matches the iframe's
	 * current location. Called after every iframe navigation.
	 */
	private syncActiveTab( currentUrl: string ): void {
		const tabs = this.element.querySelectorAll<HTMLElement>( '.wp-desktop-window__tab' );
		if ( ! tabs.length ) {
			return;
		}
		const activeKey = urlMatchKey( currentUrl );
		for ( const tab of tabs ) {
			const tabUrl = tab.dataset.url;
			const isActive = !! tabUrl && urlMatchKey( tabUrl ) === activeKey;
			tab.classList.toggle( 'wp-desktop-window__tab--active', isActive );
			tab.setAttribute( 'aria-selected', isActive ? 'true' : 'false' );
		}
	}

	/**
	 * Handle postMessage events from the iframe.
	 */
	private onMessage( event: MessageEvent ): void {
		// Only accept same-origin messages from our own iframe.
		if ( event.origin !== window.location.origin ) {
			return;
		}
		if ( event.source !== this.iframe.contentWindow ) {
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
				typeof data.open === 'string' ? data.open : null
			);
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
			'help': { icon: 'dashicons-editor-help', label: 'Help' },
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
				this.iframe.contentWindow?.postMessage(
					{ type: 'wp-desktop-toggle-panel', panel },
					window.location.origin
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
		if ( target.closest( '.wp-desktop-window__controls' ) || target.closest( '.wp-desktop-window__screen-meta' ) ) {
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
	}

	/**
	 * Minimize the window.
	 */
	public minimize(): void {
		this.state = 'minimized';
		this.element.classList.add( 'wp-desktop-window--minimized' );

		// After the transition completes, hide the iframe to save resources.
		this.element.addEventListener( 'transitionend', ( e: TransitionEvent ) => {
			if ( e.propertyName === 'opacity' && this.state === 'minimized' ) {
				this.iframe.style.visibility = 'hidden';
			}
		}, { once: true } );

		this.onMinimize?.( this );
		this.emitChange( 'state' );
	}

	/**
	 * Restore the window from minimized state.
	 */
	public restore(): void {
		// Restore iframe visibility before the animation starts.
		this.iframe.style.visibility = '';

		this.element.classList.remove( 'wp-desktop-window--minimized' );
		if ( this.state === 'minimized' ) {
			this.state = 'normal';
		}
		this.onFocusRequest?.( this );
		this.emitChange( 'state' );
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
		}
		this.emitChange( 'state' );
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
					s.state === 'maximized'
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
	}

	/**
	 * Reflect fullscreen state on the focus-mode button (active class,
	 * aria-pressed, and label).
	 */
	private updateFocusButtonState(): void {
		const btn = this.element.querySelector<HTMLButtonElement>(
			'.wp-desktop-window__btn--focus'
		);
		if ( ! btn ) {
			return;
		}
		const isFullscreen = this.state === 'fullscreen';
		btn.classList.toggle( 'wp-desktop-window__btn--active', isFullscreen );
		btn.setAttribute( 'aria-pressed', isFullscreen ? 'true' : 'false' );
		btn.setAttribute(
			'aria-label',
			isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
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
}
