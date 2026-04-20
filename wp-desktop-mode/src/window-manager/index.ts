/**
 * Desktop Mode — Window Manager.
 *
 * Manages the lifecycle, z-order, and focus of all desktop windows,
 * plus the virtual-desktop registry ("Spaces"). Most heavy logic lives
 * in sibling modules under `src/window-manager/`:
 *
 *   - `desktops.ts`  — create / switch / close virtual desktops,
 *                      visibility sync, seed from persistence.
 *   - `arrange.ts`   — cascade + tile commands from the Arrange menu.
 *   - `snap.ts`      — snap-to-grid preference + live cell-size calc.
 *   - `overview.ts`  — the zoom-out grid + top-bar + click / key /
 *                      hover handlers.
 *   - `geometry.ts`  — pure math helpers (grid picker, layout calc,
 *                      validators).
 *
 * Fields prefixed with `_` are package-internal: helpers in this
 * folder may touch them, but nothing outside `src/window-manager/`
 * should. Kept `public` at the TypeScript level only because `private`
 * prevents sibling modules from seeing them.
 *
 * @since 6.9.0
 */

import { HOOKS, doAction } from '../hooks';
import type { Desktop, Session, SessionWindow, WindowConfig } from '../types';
import { Window } from '../window';

import {
	applyDesktopVisibility,
	createDesktop,
	closeDesktop,
	getActiveDesktop,
	getActiveDesktopId,
	getDesktops,
	seedDesktops,
	switchDesktop,
} from './desktops';
import { cascade, tile } from './arrange';
import {
	getSnapConfig,
	loadSnapEnabled,
	setSnapEnabled,
} from './snap';
import { enterOverview, exitOverview } from './overview';

/** Base z-index for desktop windows. */
const BASE_Z_INDEX = 100;

/** Cascade offset for new windows (pixels). */
const CASCADE_OFFSET = 30;

/**
 * Window Manager class.
 *
 * Controls the window stack: opening, closing, focusing, z-ordering.
 */
export class WindowManager {
	/**
	 * All open windows, in z-order (last = topmost).
	 * @internal
	 */
	public _stack: Window[] = [];

	/**
	 * The desktop area element where windows are rendered.
	 * @internal
	 */
	public _desktop: HTMLElement;

	/** Counter for cascade positioning. */
	private cascadeIndex = 0;

	/**
	 * Virtual desktops ("Spaces"). Always at least one entry — the
	 * shell can't function with no desktops. Order in the array maps
	 * to left-to-right order in the overview top bar; new desktops
	 * are appended.
	 * @internal
	 */
	public _desktops: Desktop[] = [
		// translators: default desktop name — "Desktop 1"
		{ id: 'desktop-1', label: 'Desktop 1' },
	];

	/**
	 * Id of the currently active desktop.
	 * @internal
	 */
	public _activeDesktopId = 'desktop-1';

	/**
	 * Monotonic counter for new desktop ids (`desktop-2`, `-3`, …).
	 * @internal
	 */
	public _desktopSeq = 1;

	/**
	 * Injected by the shell on init — called when a user clicks
	 * "Open on startup" in a window's ⋯ menu. The manager stays
	 * decoupled from the public `wp.desktop.setDefaultWindow()` API
	 * by taking the handler as a callback.
	 */
	public onToggleStartupRequested: ( ( win: Window ) => void ) | null = null;

	/**
	 * Observes the desktop area for size changes so maximized windows
	 * can stay snapped to the available area.
	 */
	private desktopResizeObserver: ResizeObserver | null = null;

	/**
	 * Whether drag/resize movements snap to the desktop-area grid.
	 * @internal
	 */
	public _snapEnabled = loadSnapEnabled();

	// ---- Overview state (read + written by overview.ts, desktops.ts) ----

	/** True while overview mode is active. @internal */
	public _overviewActive = false;

	/**
	 * Snapshot of each window's transform before overview mode so
	 * `exitOverview` can restore pixel-identical state.
	 * @internal
	 */
	public _overviewSnapshot: Map<
		string,
		{ transform: string; transition: string }
	> = new Map();

	/**
	 * Per-window label elements mounted during overview.
	 * @internal
	 */
	public _overviewLabels: Map<string, HTMLElement> = new Map();

	/** @internal */
	public _overviewPointerDownHandler: ( ( e: PointerEvent ) => void ) | null = null;
	/** @internal */
	public _overviewPointerUpHandler: ( ( e: PointerEvent ) => void ) | null = null;
	/** @internal */
	public _overviewKeyHandler: ( ( e: KeyboardEvent ) => void ) | null = null;
	/** @internal */
	public _overviewPressTarget: { id: string; element: HTMLElement } | null = null;
	/** @internal */
	public _overviewClickBlocker: ( ( e: MouseEvent ) => void ) | null = null;
	/** @internal */
	public _overviewTopBar: HTMLElement | null = null;
	/** @internal */
	public _overviewMouseHandler: ( ( e: MouseEvent ) => void ) | null = null;
	/** @internal */
	public _lastOverviewHoverId: string | null = null;

	constructor( desktop: HTMLElement ) {
		this._desktop = desktop;
		if ( typeof ResizeObserver !== 'undefined' ) {
			this.desktopResizeObserver = new ResizeObserver( () =>
				this.reflowMaximizedWindows(),
			);
			this.desktopResizeObserver.observe( desktop );
		}
		this.installIframeFocusBridge();
	}

	/**
	 * Clicks inside an iframe don't cross the browsing-context
	 * boundary — pointerdown / focusin in the iframe's document never
	 * reach the parent. BUT the parent `window` does lose focus,
	 * because focus moves to the iframe's content window.
	 *
	 * We use that signal: listen for `window.blur` on the parent,
	 * check `document.activeElement` — if it's an iframe, walk up to
	 * its owning `.wp-desktop-window`, find the matching Window in
	 * our stack, and focus it. Covers clicks on the primary iframe
	 * AND any external-tab sub-iframes mounted as descendants of the
	 * window element.
	 */
	private installIframeFocusBridge(): void {
		window.addEventListener( 'blur', () => {
			// The blur happens BEFORE `document.activeElement` is
			// fully updated in some engines. A 0-ms defer lines us up
			// with the activeElement state after the browser has
			// committed the focus shift.
			window.setTimeout( () => {
				const active = this._desktop.ownerDocument?.activeElement ?? null;
				if ( ! active || active.tagName !== 'IFRAME' ) {
					return;
				}
				const winEl = active.closest<HTMLElement>(
					'.wp-desktop-window',
				);
				if ( ! winEl ) {
					return;
				}
				const id = winEl.id.replace( /^wp-window-/, '' );
				const win = this.getById( id );
				if ( ! win ) {
					return;
				}
				// Skip while overview is active — pointer events are
				// driven by the dedicated overview capture handler
				// there.
				if ( this._overviewActive ) {
					return;
				}
				// Already focused? The focus() call reorders the stack
				// as a no-op but still fires the action hook — skip.
				if ( this.getFocused() === win ) {
					return;
				}
				this.focus( win );
			}, 0 );
		} );
	}

	/**
	 * Re-apply maximize bounds to any window currently in
	 * `state === 'maximized'`. Called from the desktop-area
	 * ResizeObserver so the user can shrink the browser window
	 * without the maximized content refusing to follow.
	 */
	private reflowMaximizedWindows(): void {
		if ( this._overviewActive ) {
			return;
		}
		for ( const w of this._stack ) {
			if ( w.state !== 'maximized' ) {
				continue;
			}
			const parent = w.element.parentElement;
			if ( ! parent ) {
				continue;
			}
			// left/top stay at 0 for maximize; only width/height
			// change with viewport.
			w.element.style.width = `${ parent.clientWidth }px`;
			w.element.style.height = `${ parent.clientHeight }px`;
		}
	}

	/**
	 * Open a new window — or focus an existing one — for the given
	 * page.
	 *
	 * Matches any existing window sharing the same `baseId`
	 * (defaulting to the config's `id`). For singleton pages
	 * (Settings, Dashboard, …) `baseId === id`, so this behaves
	 * exactly like strict id matching. For multi pages, clicking the
	 * dock icon while a window is already open focuses the
	 * most-recent instance rather than creating a twin.
	 *
	 * To force a brand-new instance alongside an existing one, use
	 * {@link openNew}.
	 */
	public open( config: Partial<WindowConfig> & { id: string; url: string; title: string } ): Window {
		const baseId = config.baseId || config.id;
		// Per-desktop ("Spaces") semantics: a window sharing this baseId
		// counts as "the same window" only when it lives on the ACTIVE
		// desktop. On another desktop it's invisible to this click —
		// the user is asking for a copy here, so we fall through to
		// `createWindow` with a fresh suffixed id that won't collide
		// with the far-desktop instance.
		const existing = this.getByBaseIdOnActiveDesktop( baseId );
		if ( existing ) {
			this.focus( existing );
			if ( existing.state === 'minimized' ) {
				existing.restore();
			}
			return existing;
		}

		// No instance on the current desktop. If any instance is open
		// on another desktop, the bare `baseId` is taken — pick the
		// next free suffix so DOM ids stay unique. Otherwise use the
		// caller-supplied id as-is (plain `plugins-php`, `edit-php`,
		// etc.).
		const id = this.getByBaseId( baseId )
			? this.nextInstanceId( baseId )
			: config.id;
		return this.createWindow( { ...config, id, baseId } );
	}

	/**
	 * Open a brand-new window even if one is already open for this
	 * page. Only makes sense for pages flagged `multi`.
	 */
	public openNew( config: Partial<WindowConfig> & { id: string; url: string; title: string } ): Window {
		const baseId = config.baseId || config.id;
		const nextId = this.nextInstanceId( baseId );
		return this.createWindow( { ...config, id: nextId, baseId } );
	}

	/**
	 * Build and mount a window element. Common tail shared by
	 * `open()` and `openNew()`.
	 */
	private createWindow(
		config: Partial<WindowConfig> & { id: string; url: string; title: string; baseId?: string },
	): Window {
		const desktopRect = this._desktop.getBoundingClientRect();
		const defaultWidth = Math.min( Math.round( desktopRect.width * 0.8 ), 1200 );
		const defaultHeight = Math.min( Math.round( desktopRect.height * 0.8 ), 800 );
		const cascadeX = 40 + ( this.cascadeIndex % 8 ) * CASCADE_OFFSET;
		const cascadeY = 40 + ( this.cascadeIndex % 8 ) * CASCADE_OFFSET;

		const fullConfig: WindowConfig = {
			icon: config.icon || 'dashicons-admin-generic',
			x: config.x ?? cascadeX,
			y: config.y ?? cascadeY,
			width: config.width ?? defaultWidth,
			height: config.height ?? defaultHeight,
			minWidth: config.minWidth ?? 320,
			minHeight: config.minHeight ?? 200,
			...config,
			baseId: config.baseId || config.id,
			// New windows always join the active desktop. A caller can
			// pre-seed `desktopId` (e.g. session restore) by passing it
			// in `config`, which the spread above preserves.
			desktopId: config.desktopId || this._activeDesktopId,
		};

		this.cascadeIndex++;

		const win = new Window( fullConfig );

		win.onFocusRequest = ( w: Window ) => this.focus( w );
		win.onClose = ( w: Window ) => this.remove( w );
		win.onMinimize = () => {
			const visible = this._stack.filter( ( w ) => w.state !== 'minimized' );
			if ( visible.length > 0 ) {
				this.focus( visible[ visible.length - 1 ] );
			}
		};
		win.onOpenAnother = ( w: Window ) => {
			this.openNew( {
				id: w.config.baseId || w.id,
				baseId: w.config.baseId || w.id,
				url: w.config.url,
				title: w.config.title,
				icon: w.config.icon,
				submenu: w.config.submenu,
				multi: true,
			} );
		};
		// "Open on startup" toggles the user's default-window
		// preference to point at this window's current URL — or
		// disables it entirely when the window is already the default.
		// The actual REST write is owned by the shell's public API
		// (`wp.desktop.setDefaultWindow`), injected via
		// `this.onToggleStartupRequested`.
		win.onToggleStartup = ( w: Window ) => {
			this.onToggleStartupRequested?.( w );
		};
		win.snapConfigProvider = () => this.getSnapConfig();

		this._stack.push( win );
		this._desktop.appendChild( win.element );
		applyDesktopVisibility( this, win );
		this.focus( win );

		const openedDetail = {
			windowId: win.id,
			page: config.url,
			title: config.title,
			url: config.url,
		};
		document.dispatchEvent(
			new CustomEvent( 'wp-desktop-window-opened', { detail: openedDetail } ),
		);
		// Fan out to the hook bus so plugins using wp.hooks.addAction()
		// stay in their idiomatic API rather than juggling
		// CustomEvents.
		doAction( HOOKS.WINDOW_OPENED, openedDetail );

		return win;
	}

	/**
	 * Find the next unused suffixed id for a given baseId. Prefers
	 * the bare baseId itself if free (user closed the original), then
	 * walks `-2`, `-3`, … until it lands on one not currently in the
	 * stack.
	 */
	private nextInstanceId( baseId: string ): string {
		const taken = new Set( this._stack.map( ( w ) => w.id ) );
		if ( ! taken.has( baseId ) ) {
			return baseId;
		}
		let n = 2;
		while ( taken.has( `${ baseId }-${ n }` ) ) {
			n++;
		}
		return `${ baseId }-${ n }`;
	}

	/** Focus a window: bring it to top of z-stack. */
	public focus( win: Window ): void {
		// Remove from current position and push to top.
		const idx = this._stack.indexOf( win );
		if ( idx > -1 ) {
			this._stack.splice( idx, 1 );
		}
		this._stack.push( win );

		// Update z-indices and focused state.
		this._stack.forEach( ( w, i ) => {
			w.setZIndex( BASE_Z_INDEX + i );
			w.setFocused( i === this._stack.length - 1 );
		} );

		// Dispatch custom event + action.
		const focusedDetail = { windowId: win.id };
		document.dispatchEvent(
			new CustomEvent( 'wp-desktop-window-focused', { detail: focusedDetail } ),
		);
		doAction( HOOKS.WINDOW_FOCUSED, focusedDetail );
	}

	/** Remove a window from the stack and DOM. */
	private remove( win: Window ): void {
		const idx = this._stack.indexOf( win );
		if ( idx > -1 ) {
			this._stack.splice( idx, 1 );
		}

		// Focus the next topmost window.
		if ( this._stack.length > 0 ) {
			this.focus( this._stack[ this._stack.length - 1 ] );
		}

		// Dispatch custom event + action.
		const closedDetail = { windowId: win.id };
		document.dispatchEvent(
			new CustomEvent( 'wp-desktop-window-closed', { detail: closedDetail } ),
		);
		doAction( HOOKS.WINDOW_CLOSED, closedDetail );
	}

	/** Get a window by its ID. */
	public getById( id: string ): Window | undefined {
		return this._stack.find( ( w ) => w.id === id );
	}

	/**
	 * Get the most-recently-focused window for a given baseId.
	 *
	 * Multi-instance windows share a baseId; the stack is ordered
	 * bottom to top by focus, so iterating from the end finds the
	 * best candidate to bring forward when the user re-clicks the
	 * dock icon.
	 */
	public getByBaseId( baseId: string ): Window | undefined {
		for ( let i = this._stack.length - 1; i >= 0; i-- ) {
			const w = this._stack[ i ];
			if ( ( w.config.baseId || w.id ) === baseId ) {
				return w;
			}
		}
		return undefined;
	}

	/**
	 * Like {@link getByBaseId} but only considers windows on the
	 * currently-active virtual desktop. The dock's "open or focus"
	 * path uses this — a Plugins instance that lives on Desktop 2 is
	 * invisible from Desktop 1's dock click, so clicking Plugins on
	 * Desktop 1 should open a fresh instance there instead of trying
	 * to focus the far-off sibling (which would silently do nothing
	 * because the other desktop's windows are display: none here).
	 */
	public getByBaseIdOnActiveDesktop( baseId: string ): Window | undefined {
		for ( let i = this._stack.length - 1; i >= 0; i-- ) {
			const w = this._stack[ i ];
			if ( ( w.config.baseId || w.id ) !== baseId ) {
				continue;
			}
			const winDesktop = w.config.desktopId || this._activeDesktopId;
			if ( winDesktop === this._activeDesktopId ) {
				return w;
			}
		}
		return undefined;
	}

	/**
	 * Get every open window sharing the given baseId, ordered by
	 * instance slot (bare baseId first, then `-2`, `-3`, …) rather
	 * than z-order — so the dock's instance rail keeps a stable
	 * left-to-right order even as the user focuses between windows.
	 */
	public getAllByBaseId( baseId: string ): Window[] {
		const instanceSlot = ( id: string ): number => {
			if ( id === baseId ) {
				return 1;
			}
			const prefix = `${ baseId }-`;
			if ( id.startsWith( prefix ) ) {
				const n = parseInt( id.slice( prefix.length ), 10 );
				return Number.isFinite( n ) ? n : 999;
			}
			return 999;
		};
		return this._stack
			.filter( ( w ) => ( w.config.baseId || w.id ) === baseId )
			.sort( ( a, b ) => instanceSlot( a.id ) - instanceSlot( b.id ) );
	}

	/** Get all open windows. */
	public getAll(): Window[] {
		return [ ...this._stack ];
	}

	/** Get the currently focused (topmost) window. */
	public getFocused(): Window | undefined {
		return this._stack.length > 0 ? this._stack[ this._stack.length - 1 ] : undefined;
	}

	// ---- Virtual desktop delegations ----

	public getDesktops(): Desktop[] {
		return getDesktops( this );
	}
	public getActiveDesktop(): Desktop {
		return getActiveDesktop( this );
	}
	public getActiveDesktopId(): string {
		return getActiveDesktopId( this );
	}
	public createDesktop(): Desktop {
		return createDesktop( this );
	}
	public switchDesktop( id: string ): void {
		switchDesktop( this, id );
	}
	public closeDesktop( id: string ): void {
		closeDesktop( this, id );
	}

	// ---- Arrange + snap delegations ----

	public cascade(): void {
		cascade( this );
	}
	public tile(): void {
		tile( this );
	}
	public isSnapEnabled(): boolean {
		return this._snapEnabled;
	}
	public setSnapEnabled( enabled: boolean ): void {
		setSnapEnabled( this, enabled );
	}
	public getSnapConfig(): { enabled: boolean; cellWidth: number; cellHeight: number } {
		return getSnapConfig( this );
	}

	// ---- Overview delegations ----

	public enterOverview(): void {
		enterOverview( this );
	}
	public exitOverview( selected?: Window, maximize = false ): void {
		exitOverview( this, selected, maximize );
	}

	/**
	 * Serialize the current window stack for session persistence.
	 *
	 * Order in the returned `windows` array mirrors z-order (earliest
	 * opened / lowest-z first, focused last) so restoring preserves
	 * the stacking the user left behind.
	 */
	public snapshot(): Session {
		const focused = this.getFocused();
		// Native windows aren't persistable — their `render` callback
		// is a JS closure, not something we can serialize and
		// rehydrate server-side. Skip them from both the window list
		// and the focused id so a freshly booted shell doesn't try
		// (and fail) to restore a window it can't reconstruct.
		const persistable = this._stack.filter( ( w ) => ! w.config.native );
		const windows: SessionWindow[] = persistable.map( ( w ) => {
			const snap = w.getSnapshot();
			const externalTabs = w.getExternalTabsSnapshot();
			return {
				id: w.id,
				baseId: w.config.baseId || w.id,
				desktopId: w.config.desktopId || this._activeDesktopId,
				url: w.getCurrentUrl(),
				title: w.config.title,
				icon: w.config.icon,
				state: snap.state,
				x: snap.x,
				y: snap.y,
				width: snap.width,
				height: snap.height,
				...( externalTabs.length > 0 ? { externalTabs } : {} ),
			};
		} );
		const focusedId = focused && ! focused.config.native ? focused.id : '';

		return {
			windows,
			desktops: this.getDesktops(),
			activeDesktop: this._activeDesktopId,
			focused: focusedId,
			updated: Math.floor( Date.now() / 1000 ),
		};
	}

	public seedDesktops( desktops: Desktop[], activeDesktopId: string ): void {
		seedDesktops( this, desktops, activeDesktopId );
	}
}
