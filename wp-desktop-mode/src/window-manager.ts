/**
 * Desktop Mode — Window Manager.
 *
 * Manages the lifecycle, z-order, and focus of all desktop windows.
 *
 * @since 6.9.0
 */

import { Window } from './window';
import { HOOKS, doAction } from './hooks';
import type { Session, SessionWindow, WindowConfig } from './types';

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
	/** All open windows, in z-order (last = topmost). */
	private stack: Window[] = [];

	/** The desktop area element where windows are rendered. */
	private desktop: HTMLElement;

	/** Counter for cascade positioning. */
	private cascadeIndex = 0;

	/**
	 * Injected by the shell on init — called when a user clicks
	 * "Open on startup" in a window's ⋯ menu. The manager stays
	 * decoupled from the public `wp.desktop.setDefaultWindow()` API
	 * by taking the handler as a callback.
	 */
	public onToggleStartupRequested: ( ( win: Window ) => void ) | null = null;

	/**
	 * Observes the desktop area for size changes (browser resize,
	 * admin-bar height shifts, orientation changes) so maximized
	 * windows can stay snapped to the available area. Without this,
	 * a maximized window keeps the inline width/height it was given
	 * at maximize-time and eventually clips its own title-bar
	 * controls once the browser gets smaller than that snapshot.
	 */
	private desktopResizeObserver: ResizeObserver | null = null;

	constructor( desktop: HTMLElement ) {
		this.desktop = desktop;
		if ( typeof ResizeObserver !== 'undefined' ) {
			this.desktopResizeObserver = new ResizeObserver( () =>
				this.reflowMaximizedWindows(),
			);
			this.desktopResizeObserver.observe( desktop );
		}
	}

	/**
	 * Re-apply maximize bounds to any window currently in
	 * `state === 'maximized'`. Called from the desktop-area
	 * ResizeObserver so the user can shrink the browser window
	 * without the maximized content refusing to follow.
	 *
	 * Skipped during overview mode: there, windows carry CSS
	 * transforms for the thumbnail layout, and touching their
	 * inline geometry would desync the live transform math.
	 * Overview exit re-applies maximize correctly via its own path.
	 *
	 * Fullscreen windows aren't touched either — they're
	 * `position: fixed; inset: 0` in CSS, so the viewport naturally
	 * sizes them without JS involvement.
	 */
	private reflowMaximizedWindows(): void {
		if ( this.overviewActive ) {
			return;
		}
		for ( const w of this.stack ) {
			if ( w.state !== 'maximized' ) {
				continue;
			}
			const parent = w.element.parentElement;
			if ( ! parent ) {
				continue;
			}
			// left/top stay at 0 for maximize; only width/height
			// change with viewport. Using the client dimensions
			// of the parent (desktop area) matches what
			// `Window.maximize()` itself uses, so this is the
			// same sizing logic applied to the new bounds.
			w.element.style.width = `${ parent.clientWidth }px`;
			w.element.style.height = `${ parent.clientHeight }px`;
		}
	}

	/**
	 * Open a new window — or focus an existing one — for the given page.
	 *
	 * Matches any existing window sharing the same `baseId` (defaulting to
	 * the config's `id`). For singleton pages (Settings, Dashboard, …)
	 * `baseId === id`, so this behaves exactly like strict id matching.
	 * For multi pages, clicking the dock icon while a window is already
	 * open focuses the most-recent instance rather than creating a twin.
	 *
	 * To force a brand-new instance alongside an existing one, use
	 * {@link openNew}.
	 */
	public open( config: Partial<WindowConfig> & { id: string; url: string; title: string } ): Window {
		const baseId = config.baseId || config.id;
		const existing = this.getByBaseId( baseId );
		if ( existing ) {
			this.focus( existing );
			if ( existing.state === 'minimized' ) {
				existing.restore();
			}
			return existing;
		}

		return this.createWindow( { ...config, baseId } );
	}

	/**
	 * Open a brand-new window even if one is already open for this page.
	 *
	 * Only makes sense for pages flagged `multi` — invoked by the dock's
	 * "+" chip and the window title-bar's "Open another" action. The new
	 * instance gets a suffixed id (`${baseId}-2`, `${baseId}-3`, …) while
	 * keeping the same baseId so the dock still groups it with siblings.
	 *
	 * Finds the lowest unused suffix, so closing an intermediate instance
	 * and opening another won't reuse its id while it's still in-flight.
	 */
	public openNew( config: Partial<WindowConfig> & { id: string; url: string; title: string } ): Window {
		const baseId = config.baseId || config.id;
		const nextId = this.nextInstanceId( baseId );
		return this.createWindow( { ...config, id: nextId, baseId } );
	}

	/**
	 * Build and mount a window element. Common tail shared by open() and
	 * openNew() — everything that happens once the id has been resolved.
	 */
	private createWindow(
		config: Partial<WindowConfig> & { id: string; url: string; title: string; baseId?: string },
	): Window {
		const desktopRect = this.desktop.getBoundingClientRect();
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
		};

		this.cascadeIndex++;

		const win = new Window( fullConfig );

		win.onFocusRequest = ( w: Window ) => this.focus( w );
		win.onClose = ( w: Window ) => this.remove( w );
		win.onMinimize = () => {
			const visible = this.stack.filter( ( w ) => w.state !== 'minimized' );
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
		// disables it entirely when the window is already the
		// default. The actual REST write is owned by the shell's
		// public API (`wp.desktop.setDefaultWindow`), injected via
		// `this.onToggleStartupRequested`.
		win.onToggleStartup = ( w: Window ) => {
			this.onToggleStartupRequested?.( w );
		};

		this.stack.push( win );
		this.desktop.appendChild( win.element );
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
		// stay in their idiomatic API rather than juggling CustomEvents.
		doAction( HOOKS.WINDOW_OPENED, openedDetail );

		return win;
	}

	/**
	 * Find the next unused suffixed id for a given baseId. Prefers the
	 * bare baseId itself if free (user closed the original), then walks
	 * `-2`, `-3`, … until it lands on one not currently in the stack.
	 */
	private nextInstanceId( baseId: string ): string {
		const taken = new Set( this.stack.map( ( w ) => w.id ) );
		if ( ! taken.has( baseId ) ) {
			return baseId;
		}
		let n = 2;
		while ( taken.has( `${ baseId }-${ n }` ) ) {
			n++;
		}
		return `${ baseId }-${ n }`;
	}

	/**
	 * Focus a window: bring it to top of z-stack.
	 */
	public focus( win: Window ): void {
		// Remove from current position and push to top.
		const idx = this.stack.indexOf( win );
		if ( idx > -1 ) {
			this.stack.splice( idx, 1 );
		}
		this.stack.push( win );

		// Update z-indices and focused state.
		this.stack.forEach( ( w, i ) => {
			w.setZIndex( BASE_Z_INDEX + i );
			w.setFocused( i === this.stack.length - 1 );
		} );

		// Dispatch custom event + action.
		const focusedDetail = { windowId: win.id };
		document.dispatchEvent(
			new CustomEvent( 'wp-desktop-window-focused', { detail: focusedDetail } ),
		);
		doAction( HOOKS.WINDOW_FOCUSED, focusedDetail );
	}

	/**
	 * Remove a window from the stack and DOM.
	 */
	private remove( win: Window ): void {
		const idx = this.stack.indexOf( win );
		if ( idx > -1 ) {
			this.stack.splice( idx, 1 );
		}

		// Focus the next topmost window.
		if ( this.stack.length > 0 ) {
			this.focus( this.stack[ this.stack.length - 1 ] );
		}

		// Dispatch custom event + action.
		const closedDetail = { windowId: win.id };
		document.dispatchEvent(
			new CustomEvent( 'wp-desktop-window-closed', { detail: closedDetail } ),
		);
		doAction( HOOKS.WINDOW_CLOSED, closedDetail );
	}

	/**
	 * Get a window by its ID.
	 */
	public getById( id: string ): Window | undefined {
		return this.stack.find( ( w ) => w.id === id );
	}

	/**
	 * Get the most-recently-focused window for a given baseId.
	 *
	 * Multi-instance windows share a baseId; the stack is ordered bottom
	 * to top by focus, so iterating from the end finds the best candidate
	 * to bring forward when the user re-clicks the dock icon.
	 */
	public getByBaseId( baseId: string ): Window | undefined {
		for ( let i = this.stack.length - 1; i >= 0; i-- ) {
			const w = this.stack[ i ];
			if ( ( w.config.baseId || w.id ) === baseId ) {
				return w;
			}
		}
		return undefined;
	}

	/**
	 * Get every open window sharing the given baseId, ordered by
	 * instance slot (bare baseId first, then `-2`, `-3`, …) rather than
	 * z-order — so the dock's instance rail keeps a stable left-to-right
	 * order even as the user focuses between windows.
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
		return this.stack
			.filter( ( w ) => ( w.config.baseId || w.id ) === baseId )
			.sort( ( a, b ) => instanceSlot( a.id ) - instanceSlot( b.id ) );
	}

	/**
	 * Get all open windows.
	 */
	public getAll(): Window[] {
		return [ ...this.stack ];
	}

	/**
	 * Get the currently focused (topmost) window.
	 */
	public getFocused(): Window | undefined {
		return this.stack.length > 0 ? this.stack[ this.stack.length - 1 ] : undefined;
	}

	// ==========================================================
	// Window-arrangement layouts
	// ==========================================================

	/**
	 * Cascade-lay-out every eligible window from the top-left of the
	 * desktop area, each offset so previous windows' title bars stay
	 * visible. Mirrors the classic Windows/macOS "cascade windows"
	 * behavior; resets any fullscreen/maximized/minimized state
	 * first so the cascade actually takes effect.
	 *
	 * Eligibility:
	 *   - Not native (OS Settings etc. are pinned)
	 *   - Will be restored from minimized so all windows are visible
	 *
	 * Sizing: uniform — 70% of the desktop area's minor axes, capped
	 * so a 4K screen doesn't produce absurdly large windows. Offset
	 * wraps back to the start after enough steps fit — a 20-window
	 * cascade on a 1080p screen reuses the top-left after ~8 steps.
	 */
	public cascade(): void {
		const eligible = this.stack.filter( ( w ) => ! w.config.native );
		if ( eligible.length === 0 ) {
			return;
		}

		doAction( HOOKS.ARRANGE_CASCADE_STARTING, {
			windowCount: eligible.length,
		} );

		// Normalize state: no fullscreen/maximized during cascade,
		// no minimized so every window appears in the new layout.
		for ( const w of eligible ) {
			if ( w.state === 'fullscreen' ) {
				w.toggleFullscreen();
			}
			if ( w.state === 'maximized' ) {
				w.toggleMaximize();
			}
			if ( w.state === 'minimized' ) {
				w.restore();
			}
		}

		const rect = this.desktop.getBoundingClientRect();
		const padding = 30;
		const offset = 30;
		const targetWidth = Math.min( Math.round( rect.width * 0.7 ), 1100 );
		const targetHeight = Math.min( Math.round( rect.height * 0.75 ), 750 );

		// How many offsets fit before we'd cascade a window off
		// the bottom / right edge — clamped to at least 1 so we
		// don't divide by zero on micro-viewports.
		const maxStepsX = Math.max(
			1,
			Math.floor( ( rect.width - targetWidth - padding ) / offset ),
		);
		const maxStepsY = Math.max(
			1,
			Math.floor( ( rect.height - targetHeight - padding ) / offset ),
		);
		const maxSteps = Math.min( maxStepsX, maxStepsY );

		eligible.forEach( ( w, i ) => {
			const step = i % Math.max( 1, maxSteps );
			w.element.style.left = `${ padding + step * offset }px`;
			w.element.style.top = `${ padding + step * offset }px`;
			w.element.style.width = `${ targetWidth }px`;
			w.element.style.height = `${ targetHeight }px`;
		} );

		// Bring focused window to the visual top (z-order) so after
		// the cascade the user's prior focus target is still active.
		const focused = this.getFocused();
		if ( focused && ! focused.config.native ) {
			this.focus( focused );
		}

		// Persist the new geometry — session saver listens to this.
		document.dispatchEvent(
			new CustomEvent( 'wp-desktop-window-changed', {
				detail: { reason: 'cascade' },
			} ),
		);

		doAction( HOOKS.ARRANGE_CASCADE_APPLIED, {
			windowCount: eligible.length,
		} );
	}

	// ----------------------------------------------------------
	// Overview — zoom out to see every window, click one to focus
	// ----------------------------------------------------------

	/**
	 * True while overview mode is active. Guards against re-enter
	 * spam (toolbar double-click) and against re-entering while an
	 * exit animation is still running.
	 */
	private overviewActive = false;

	/**
	 * Snapshot of each window's transform before overview mode so
	 * `exitOverview` can restore pixel-identical state. Also holds
	 * pointer-events values we toggle on iframes.
	 */
	private overviewSnapshot: Map<
		string,
		{ transform: string; transition: string }
	> = new Map();

	/**
	 * Per-window label elements mounted during overview and removed
	 * on exit. Labels sit OUTSIDE each window's transform so they
	 * stay readable at any thumbnail scale — a 200-px-wide thumbnail
	 * of Posts still has a full-size "Posts" caption above it.
	 */
	private overviewLabels: Map<string, HTMLElement> = new Map();

	/** Bound handlers registered during overview, released on exit. */
	private overviewPointerDownHandler: ( ( e: PointerEvent ) => void ) | null = null;
	private overviewPointerUpHandler: ( ( e: PointerEvent ) => void ) | null = null;
	private overviewKeyHandler: ( ( e: KeyboardEvent ) => void ) | null = null;

	/**
	 * Element pressed during the most recent pointerdown inside the
	 * overview area, plus a logical id for the action it selects on
	 * commit. `id` is either a window id, the literal `'backdrop'`,
	 * or `null` when no press is in flight.
	 *
	 * The element reference is kept so pointerup can hit-test the
	 * release coordinates against the pressed element's visible
	 * bounds — that's strictly "press and release on the same thing"
	 * (per user spec) but tolerant of a few pixels of finger drift
	 * during a quick tap, which plain `e.target` equality rejects.
	 */
	private overviewPressTarget: { id: string; element: HTMLElement } | null = null;
	/**
	 * Capture-phase click swallower installed for the entire overview
	 * lifetime. Needed because the browser fires a synthesized `click`
	 * at the common ancestor of pointerdown/pointerup whenever those
	 * two targets differ — a press on one thumbnail and a release on
	 * another bubbles a click to the desktop area, whose OWN click
	 * handler minimizes every window ("show desktop" gesture). Our
	 * pointerup handler can't preventDefault that later click. A
	 * sticky capture-phase blocker that only lifts once the exit
	 * animation settles is the simplest watertight fix.
	 */
	private overviewClickBlocker: ( ( e: MouseEvent ) => void ) | null = null;
	/**
	 * Delegated mouseover handler — fires hover/unhover hooks as the
	 * pointer moves between thumbnails. Single listener on the
	 * desktop area, released on exit.
	 */
	private overviewMouseHandler: ( ( e: MouseEvent ) => void ) | null = null;
	/** Window id currently hovered, for unhover-pairing. */
	private lastOverviewHoverId: string | null = null;

	/**
	 * Enter overview mode — animate every eligible window to a
	 * grid thumbnail layout. Clicking a thumbnail exits overview
	 * and fullscreens the clicked window. Pressing Escape or
	 * clicking the backdrop exits without selection.
	 */
	public enterOverview(): void {
		if ( this.overviewActive ) {
			return;
		}
		const eligible = this.stack.filter(
			( w ) => ! w.config.native && w.state !== 'minimized',
		);
		if ( eligible.length === 0 ) {
			return;
		}
		this.overviewActive = true;

		doAction( HOOKS.OVERVIEW_ENTERING, {} );

		// Snapshot current transform + transition so exit can
		// restore exactly — matters when plugins have applied
		// custom transforms of their own.
		this.overviewSnapshot.clear();
		for ( const w of eligible ) {
			this.overviewSnapshot.set( w.id, {
				transform: w.element.style.transform || '',
				transition: w.element.style.transition || '',
			} );
		}

		// Fullscreen-state windows escape the shell's stacking
		// context; bring them back into the normal flow before
		// computing layout so the transform math stays consistent.
		for ( const w of eligible ) {
			if ( w.state === 'fullscreen' ) {
				w.toggleFullscreen();
			}
		}

		// Capture the desktop area's *target* rect BEFORE triggering
		// the dock's collapse animation. The dock is a flex sibling
		// about to shrink from its full width to 0 over ~280 ms —
		// measuring after the class change would catch an in-transit
		// width, making the overview grid lay out for a smaller area
		// than it will actually occupy by the time the animation
		// settles. We pre-measure the dock, compose a synthetic rect
		// representing the *post-collapse* area, and pass THAT to
		// `computeOverviewLayout`. Thumbnails then fly to fixed
		// destinations while the dock glides out in parallel.
		const dockEl = document.getElementById( 'wp-desktop-dock' );
		const dockWidth = dockEl ? dockEl.offsetWidth : 0;
		const currentRect = this.desktop.getBoundingClientRect();
		const targetRect = new DOMRect(
			currentRect.left - dockWidth,
			currentRect.top,
			currentRect.width + dockWidth,
			currentRect.height,
		);

		this.desktop.classList.add( 'wp-desktop-area--overview' );
		const shell = document.getElementById( 'wp-desktop-shell' );
		shell?.classList.add( 'wp-desktop-shell--overview' );

		const layout = computeOverviewLayout( eligible, targetRect );

		this.overviewLabels.clear();
		for ( const item of layout ) {
			const el = item.win.element;
			el.classList.add( 'wp-desktop-window--overview' );
			const dx = item.x - el.offsetLeft;
			const dy = item.y - el.offsetTop;
			// transform-origin: top left (set in CSS) so translate +
			// scale compose without drift.
			el.style.transform = `translate(${ dx }px, ${ dy }px) scale(${ item.scale })`;

			// Label above the thumbnail. Position in desktop-area
			// coordinates so it's unaffected by the window's
			// transform — critical for readability when thumbnails
			// shrink to icon-size. The `data-window-id` attribute
			// enables the adjacent-sibling CSS rule that keeps this
			// label bright when its window is hovered (see
			// windows.css).
			const label = this.createOverviewLabel( item );
			// Insert immediately AFTER the window element so the
			// adjacent-sibling CSS selector ( `:hover + .label` )
			// can target the right label.
			el.insertAdjacentElement( 'afterend', label );
			this.overviewLabels.set( item.win.id, label );
		}

		// Press-in-same-element semantics, commit-on-release. Matches
		// how native buttons / links feel: a press "arms" the element,
		// and the release either fires the action (if it lands inside
		// the armed element's visible bounds) or cancels (if the
		// pointer moved off). We deliberately skip the `click` event
		// here because its target is the common ancestor of the
		// down/up pair, which produced the "press on A, release on B
		// → browser synthesizes click on desktop → exits overview"
		// bug we saw before.
		//
		// Hit-testing at release uses the pressed element's bounding
		// rect rather than `e.target` equality — bounding rect is
		// forgiving of a few pixels of finger drift during a quick
		// tap, which strict target equality rejected (noticeable on
		// small thumbnails).
		const pressTargetForEvent = (
			e: PointerEvent,
		): { id: string; element: HTMLElement } | null => {
			const target = e.target as HTMLElement | null;
			const winEl = target?.closest<HTMLElement>(
				'.wp-desktop-window--overview',
			);
			if ( winEl ) {
				return {
					id: winEl.id.replace( /^wp-window-/, '' ),
					element: winEl,
				};
			}
			if ( target === this.desktop ) {
				return { id: 'backdrop', element: this.desktop };
			}
			return null;
		};

		this.overviewPointerDownHandler = ( e: PointerEvent ) => {
			// Only primary button / single-touch — ignore right-click,
			// middle-click, and pen-eraser so they don't latch a press
			// target that a left-click up would then match against.
			if ( e.button !== 0 ) {
				this.overviewPressTarget = null;
				return;
			}
			this.overviewPressTarget = pressTargetForEvent( e );
			// Swallow the down so iframes / inner UI can't start a
			// drag-select or native focus operation while we're acting
			// as a click surface.
			if ( this.overviewPressTarget ) {
				e.preventDefault();
				e.stopPropagation();
			}
		};

		this.overviewPointerUpHandler = ( e: PointerEvent ) => {
			if ( e.button !== 0 ) {
				return;
			}
			const pressed = this.overviewPressTarget;
			this.overviewPressTarget = null;
			if ( ! pressed ) {
				return;
			}
			const rect = pressed.element.getBoundingClientRect();
			const inside =
				e.clientX >= rect.left &&
				e.clientX <= rect.right &&
				e.clientY >= rect.top &&
				e.clientY <= rect.bottom;
			if ( ! inside ) {
				// Release landed outside the pressed element's visible
				// bounds — treat as a drag-off cancel. Consistent with
				// how a native button behaves when you press and then
				// move the pointer off before releasing.
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			if ( pressed.id === 'backdrop' ) {
				this.exitOverview();
				return;
			}
			const selected = this.getById( pressed.id );
			doAction( HOOKS.OVERVIEW_WINDOW_CLICK, { windowId: pressed.id } );
			this.exitOverview( selected, true );
		};

		this.overviewKeyHandler = ( e: KeyboardEvent ) => {
			if ( e.key === 'Escape' ) {
				this.exitOverview();
			}
		};
		this.desktop.addEventListener(
			'pointerdown',
			this.overviewPointerDownHandler,
			true,
		);
		this.desktop.addEventListener(
			'pointerup',
			this.overviewPointerUpHandler,
			true,
		);
		// Sticky capture-phase click blocker. Stops the browser-
		// synthesized click that follows every pointerdown+pointerup
		// pair from ever reaching the desktop area's "minimize every
		// window" click handler.
		this.overviewClickBlocker = ( e: MouseEvent ) => {
			e.stopPropagation();
			e.preventDefault();
		};
		this.desktop.addEventListener(
			'click',
			this.overviewClickBlocker,
			true,
		);
		document.addEventListener( 'keydown', this.overviewKeyHandler );

		// Hover delegation — mouseover bubbles up to the desktop
		// area, so one handler covers every thumbnail. We track the
		// last-hovered window id so we can fire paired hover/unhover
		// actions even when the pointer moves directly from one
		// thumbnail to the next without crossing empty space.
		this.lastOverviewHoverId = null;
		this.overviewMouseHandler = ( e: MouseEvent ) => {
			const target = e.target as HTMLElement | null;
			const winEl = target?.closest<HTMLElement>(
				'.wp-desktop-window--overview',
			);
			const newId = winEl
				? winEl.id.replace( /^wp-window-/, '' )
				: null;
			if ( newId === this.lastOverviewHoverId ) {
				return;
			}
			if ( this.lastOverviewHoverId ) {
				doAction( HOOKS.OVERVIEW_WINDOW_UNHOVER, {
					windowId: this.lastOverviewHoverId,
				} );
			}
			if ( newId ) {
				doAction( HOOKS.OVERVIEW_WINDOW_HOVER, { windowId: newId } );
			}
			this.lastOverviewHoverId = newId;
		};
		this.desktop.addEventListener( 'mouseover', this.overviewMouseHandler );

		// Signal "entered" after the grid animation settles. Matches
		// the 280 ms transform transition — plugins listening here
		// can safely read final layout positions.
		window.setTimeout( () => {
			if ( this.overviewActive ) {
				doAction( HOOKS.OVERVIEW_ENTERED, {} );
			}
		}, 300 );
	}

	/**
	 * Build the floating caption that sits above an overview
	 * thumbnail. Carries the window's icon + title, plus a secondary
	 * line with the external-tab count when the window has any — so
	 * users can tell at a glance "oh this one has 3 sub-tabs open"
	 * without expanding a thumbnail.
	 *
	 * Label sits OUTSIDE the window's transform (as a sibling in the
	 * desktop area), so scaling the thumbnail has no effect on its
	 * text size.
	 */
	private createOverviewLabel(
		item: OverviewLayoutItem,
	): HTMLElement {
		const label = document.createElement( 'div' );
		label.className = 'wp-desktop-overview-label';
		label.dataset.windowId = item.win.id;

		// Position: horizontally aligned with the thumbnail, sitting
		// just above its top edge. The 34 px offset = label height
		// (28) + a 6 px gap. Width matches the thumbnail so the label
		// ellipsizes rather than overflowing into a neighbor.
		const thumbW = item.win.element.offsetWidth * item.scale;
		label.style.left = `${ item.x }px`;
		label.style.top = `${ item.y - 34 }px`;
		label.style.width = `${ thumbW }px`;

		// Icon — mirrors the dashicon the window's title bar uses.
		// `config.icon` is already a Dashicons class string by
		// construction, but guard against unexpected values.
		const iconClass = item.win.config.icon || 'dashicons-admin-generic';
		const icon = document.createElement( 'span' );
		icon.className = `wp-desktop-overview-label__icon dashicons ${ iconClass }`;
		icon.setAttribute( 'aria-hidden', 'true' );
		label.appendChild( icon );

		const title = document.createElement( 'span' );
		title.className = 'wp-desktop-overview-label__title';
		title.textContent = item.win.config.title;
		label.appendChild( title );

		// Secondary: external-tab count. Only appended when > 0 so
		// we don't waste visual weight on the common "no extras" case.
		const tabCount = item.win.getExternalTabCount();
		if ( tabCount > 0 ) {
			const meta = document.createElement( 'span' );
			meta.className = 'wp-desktop-overview-label__meta';
			meta.textContent =
				tabCount === 1
					? '· 1 open tab'
					: `· ${ tabCount } open tabs`;
			label.appendChild( meta );
		}

		return label;
	}

	/**
	 * Exit overview mode. When `selected` is given and `maximize` is
	 * true, the clicked window animates directly from its grid
	 * thumbnail position to maximized bounds — one smooth pass,
	 * no back-to-original-then-forward-to-maximized round trip.
	 *
	 * The trick: the overview transforms are cleared for every
	 * window (transform → ''), which starts a transition on transform.
	 * For the selected window we ALSO call `maximize()` in the same
	 * frame, which changes `left/top/width/height` to cover the
	 * desktop area. Because the base window CSS transitions both
	 * `transform` AND those four geometry properties, the two
	 * transitions run as one composite 280 ms animation: the window
	 * lerps from scaled-grid-position straight to maximized-bounds.
	 */
	public exitOverview(
		selected?: Window,
		maximize = false,
	): void {
		if ( ! this.overviewActive ) {
			return;
		}
		this.overviewActive = false;

		doAction( HOOKS.OVERVIEW_EXITING, {
			windowId: selected && maximize ? selected.id : undefined,
			reason: selected && maximize ? 'select' : 'cancel',
		} );

		// Remove area + shell classes AT T=0 so the backdrop fades
		// and the dock slides back in IN PARALLEL with the windows
		// animating home. Previously these were deferred to the end
		// of the window animation — producing a visible two-phase
		// unwind (windows first, then dock) that felt sequential.
		// The only class we DON'T remove yet is
		// `wp-desktop-window--overview` on each window: it carries
		// `transform-origin: top left`, needed for the in-flight
		// transform transition. Yanking it here would shift the
		// origin to center mid-animation and wobble the path.
		this.desktop.classList.remove( 'wp-desktop-area--overview' );
		const shell = document.getElementById( 'wp-desktop-shell' );
		shell?.classList.remove( 'wp-desktop-shell--overview' );

		// Unselected windows: transform → '' (snaps back to their
		// pre-overview inline geometry). Selected window (if any):
		// transform is cleared the same way, AND `maximize()` fires,
		// setting inline left/top/width/height to maximize bounds.
		// Both transitions animate together for a single frictionless
		// path from grid to maximized.
		for ( const [ id, snap ] of this.overviewSnapshot ) {
			const w = this.getById( id );
			if ( ! w ) {
				continue;
			}
			w.element.style.transform = snap.transform;
		}

		if ( selected && maximize ) {
			// Focus first so z-index and focused-class are right from
			// the moment the animation starts — no pop-to-top late in
			// the transition.
			this.focus( selected );
			selected.maximize();
		}

		// Start labels fading immediately — they overshoot the area
		// when a selected window maximizes, and we don't want them
		// lingering as the window grows beneath. Opacity transition
		// is CSS-side (see `.wp-desktop-overview-label--out`).
		for ( const label of this.overviewLabels.values() ) {
			label.classList.add( 'wp-desktop-overview-label--out' );
		}

		// After the animation completes, strip the per-window overview
		// class (kept in place through the transition for the
		// transform-origin reason noted above) and the labels.
		const ANIMATION_MS = 280;
		window.setTimeout( () => {
			for ( const w of this.stack ) {
				w.element.classList.remove( 'wp-desktop-window--overview' );
			}
			for ( const label of this.overviewLabels.values() ) {
				label.remove();
			}
			this.overviewLabels.clear();
			this.overviewSnapshot.clear();
			// Click blocker lifts LAST, on the same tick the overview
			// officially ends. By this point the browser-synthesized
			// click that followed the user's final pointerup has long
			// fired and been swallowed — releasing earlier would let
			// that click through to "minimize all".
			if ( this.overviewClickBlocker ) {
				this.desktop.removeEventListener(
					'click',
					this.overviewClickBlocker,
					true,
				);
				this.overviewClickBlocker = null;
			}
			doAction( HOOKS.OVERVIEW_EXITED, {
				windowId: selected && maximize ? selected.id : undefined,
				reason: selected && maximize ? 'select' : 'cancel',
			} );
		}, ANIMATION_MS );

		if ( this.overviewPointerDownHandler ) {
			this.desktop.removeEventListener(
				'pointerdown',
				this.overviewPointerDownHandler,
				true,
			);
			this.overviewPointerDownHandler = null;
		}
		if ( this.overviewPointerUpHandler ) {
			this.desktop.removeEventListener(
				'pointerup',
				this.overviewPointerUpHandler,
				true,
			);
			this.overviewPointerUpHandler = null;
		}
		this.overviewPressTarget = null;
		if ( this.overviewKeyHandler ) {
			document.removeEventListener( 'keydown', this.overviewKeyHandler );
			this.overviewKeyHandler = null;
		}
		if ( this.overviewMouseHandler ) {
			this.desktop.removeEventListener(
				'mouseover',
				this.overviewMouseHandler,
			);
			this.overviewMouseHandler = null;
		}
		// Fire a final unhover if pointer was over a thumbnail when
		// exit kicked in — paired-hover guarantee for plugin authors
		// doing accounting.
		if ( this.lastOverviewHoverId ) {
			doAction( HOOKS.OVERVIEW_WINDOW_UNHOVER, {
				windowId: this.lastOverviewHoverId,
			} );
			this.lastOverviewHoverId = null;
		}
	}

	/**
	 * Serialize the current window stack for session persistence.
	 *
	 * Order in the returned `windows` array mirrors z-order (earliest
	 * opened / lowest-z first, focused last) so restoring preserves the
	 * stacking the user left behind.
	 */
	public snapshot(): Session {
		const focused = this.getFocused();
		// Native windows aren't persistable — their `render` callback is
		// a JS closure, not something we can serialize and rehydrate
		// server-side. Skip them from both the window list and the
		// focused id so a freshly booted shell doesn't try (and fail) to
		// restore a window it can't reconstruct.
		const persistable = this.stack.filter( ( w ) => ! w.config.native );
		const windows: SessionWindow[] = persistable.map( ( w ) => {
			const snap = w.getSnapshot();
			const externalTabs = w.getExternalTabsSnapshot();
			return {
				id: w.id,
				baseId: w.config.baseId || w.id,
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
			focused: focusedId,
			updated: Math.floor( Date.now() / 1000 ),
		};
	}
}

/**
 * Compute the grid layout for Overview mode.
 *
 * Arranges windows in a near-square grid (slightly wider than tall
 * because most screens are landscape). Each window scales to fit its
 * grid cell while preserving aspect ratio, centered in the cell.
 * Padding and inter-cell gaps keep thumbnails from crowding each
 * other and the viewport edges.
 */
interface OverviewLayoutItem {
	win: Window;
	x: number;
	y: number;
	scale: number;
}

function computeOverviewLayout(
	windows: Window[],
	rect: DOMRect,
): OverviewLayoutItem[] {
	const n = windows.length;
	if ( n === 0 ) {
		return [];
	}
	// Column count rounded up from sqrt — produces a square-ish
	// grid, with the last row possibly under-filled. Better visually
	// than a long horizontal strip for ≥ 4 windows.
	const cols = Math.ceil( Math.sqrt( n ) );
	const rows = Math.ceil( n / cols );

	const padding = 40;
	const gap = 24;
	/*
	 * Vertical space reserved at the top of each cell for the
	 * thumbnail's label. Must stay in sync with the `-34` offset
	 * applied in `createOverviewLabel` (28 px label height + 6 px
	 * visual gap between label and thumbnail). Without this reserve,
	 * rows ≥ 2 would have their labels land on top of the
	 * thumbnails of the row above — the label sits 34 px above its
	 * thumbnail, but the row gap is only 24 px, so 10 px of label
	 * would overflow into the previous row's thumbnail area.
	 */
	const labelReserve = 34;

	const cellWidth =
		( rect.width - padding * 2 - gap * ( cols - 1 ) ) / cols;
	const cellHeight =
		( rect.height - padding * 2 - gap * ( rows - 1 ) ) / rows;
	// Actual space available to the thumbnail inside each cell,
	// AFTER the label reserve.
	const thumbCellHeight = Math.max( 40, cellHeight - labelReserve );

	return windows.map( ( win, i ) => {
		const col = i % cols;
		const row = Math.floor( i / cols );
		const cellX = padding + col * ( cellWidth + gap );
		// cellY is the cell's top; the thumbnail anchors below the
		// label reserve, so the label (positioned at `item.y - 34`)
		// lands inside the reserve without overlapping the row above.
		const cellY =
			padding + row * ( cellHeight + gap ) + labelReserve;

		// Preserve the window's aspect ratio, fit into the thumbnail
		// area (not the full cell — the label took the top slice).
		// `scale` can be > 1 on tiny source windows; that's fine —
		// a small window scaled up looks right for an overview.
		const sourceW = win.element.offsetWidth;
		const sourceH = win.element.offsetHeight;
		const scale = Math.min(
			cellWidth / sourceW,
			thumbCellHeight / sourceH,
		);
		const scaledW = sourceW * scale;
		const scaledH = sourceH * scale;

		return {
			win,
			x: cellX + ( cellWidth - scaledW ) / 2,
			y: cellY + ( thumbCellHeight - scaledH ) / 2,
			scale,
		};
	} );
}
