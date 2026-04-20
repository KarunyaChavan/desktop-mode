/**
 * Desktop Mode — Window Manager.
 *
 * Manages the lifecycle, z-order, and focus of all desktop windows.
 *
 * @since 6.9.0
 */

import { Window } from './window';
import { HOOKS, applyFilters, doAction } from './hooks';
import { __, _n, sprintf } from './i18n';
import type { Desktop, Session, SessionWindow, WindowConfig } from './types';

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
	 * Virtual desktops ("Spaces"). Always at least one entry — the
	 * shell can't function with no desktops. Order in the array maps
	 * to left-to-right order in the overview top bar; new desktops
	 * are appended.
	 */
	private desktops: Desktop[] = [
		// translators: default desktop name — "Desktop 1"
		{ id: 'desktop-1', label: __( 'Desktop 1' ) },
	];

	/** Id of the currently active desktop. */
	private activeDesktopId = 'desktop-1';

	/** Monotonic counter for new desktop ids (`desktop-2`, `-3`, …). */
	private desktopSeq = 1;

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
		this.installIframeFocusBridge();
	}

	/**
	 * Clicks inside an iframe don't cross the browsing-context
	 * boundary — pointerdown / focusin in the iframe's document
	 * never reach the parent. BUT the parent `window` does lose
	 * focus, because focus moves to the iframe's content window.
	 *
	 * We use that signal: listen for `window.blur` on the parent,
	 * check `document.activeElement` — if it's an iframe, walk up
	 * to its owning `.wp-desktop-window`, find the matching Window
	 * in our stack, and focus it. Covers clicks on the primary
	 * iframe AND any external-tab sub-iframes mounted as
	 * descendants of the window element.
	 *
	 * One listener at the window level is cheaper than N per-window
	 * listeners and doesn't require passing anything through Window
	 * instances that aren't already exposed.
	 */
	private installIframeFocusBridge(): void {
		window.addEventListener( 'blur', () => {
			// The blur happens BEFORE `document.activeElement` is
			// fully updated in some engines. A 0-ms defer lines us
			// up with the activeElement state after the browser has
			// committed the focus shift.
			window.setTimeout( () => {
				// The WP lint rule prefers `ownerDocument.activeElement`
				// over the global — our desktop element is a reliable
				// handle back to the owning document.
				const active =
					this.desktop.ownerDocument?.activeElement ?? null;
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
				// Skip while overview is active — pointer events
				// are driven by the dedicated overview capture
				// handler there.
				if ( this.overviewActive ) {
					return;
				}
				// Already focused? The focus() call reorders the
				// stack as a no-op but still fires the action
				// hook — skip that.
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
			// New windows always join the active desktop. A caller can
			// pre-seed `desktopId` (e.g. session restore) by passing it
			// in `config`, which the spread above preserves.
			desktopId: config.desktopId || this.activeDesktopId,
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
		win.snapConfigProvider = () => this.getSnapConfig();

		this.stack.push( win );
		this.desktop.appendChild( win.element );
		this.applyDesktopVisibility( win );
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
	// Virtual desktops ("Spaces")
	//
	// Each desktop owns its own set of windows. Switching desktops
	// hides the previous group and shows the new one without
	// destroying anything — iframe state, scroll position, in-page
	// JS state all survive a switch. Only one desktop is active at
	// any time.
	// ==========================================================

	/** Snapshot of the desktop list (display order). */
	public getDesktops(): Desktop[] {
		return [ ...this.desktops ];
	}

	/**
	 * Currently active desktop. Always defined — there is always at
	 * least one desktop in the registry.
	 */
	public getActiveDesktop(): Desktop {
		const found = this.desktops.find(
			( d ) => d.id === this.activeDesktopId,
		);
		// Fallback to first if state ever drifts (e.g. activeDesktopId
		// pointed to a desktop that was removed without re-pointing).
		return found ?? this.desktops[ 0 ];
	}

	/** Convenience wrapper used by snapshot serialisation. */
	public getActiveDesktopId(): string {
		return this.getActiveDesktop().id;
	}

	/**
	 * Show / hide a single window based on whether its desktop matches
	 * the active one. Centralises the "windows on inactive desktops
	 * are display:none" rule so any future tweak (e.g. opacity-fade
	 * instead of hard hide) lives in one place.
	 *
	 * Native windows ride along with their desktop just like iframe
	 * windows — there's no reason "OS Settings opened on Desktop 2"
	 * should leak into Desktop 1.
	 */
	private applyDesktopVisibility( win: Window ): void {
		const visible = win.config.desktopId === this.activeDesktopId;
		win.element.style.display = visible ? '' : 'none';
	}

	/**
	 * Re-evaluate visibility for every window. Called after the active
	 * desktop changes or after a window is reassigned to a different
	 * desktop (e.g. when its previous desktop was closed and its
	 * windows were migrated to the survivor).
	 */
	private refreshDesktopVisibility(): void {
		for ( const w of this.stack ) {
			this.applyDesktopVisibility( w );
		}
	}

	/**
	 * Append a brand-new desktop and return it. The new desktop's
	 * label is auto-numbered (`Desktop 2`, `Desktop 3`, …) using the
	 * monotonic seq counter so closing + reopening doesn't reuse the
	 * same id mid-session.
	 */
	public createDesktop(): Desktop {
		this.desktopSeq++;
		const desktop: Desktop = {
			id: `desktop-${ this.desktopSeq }`,
			// translators: %d is the desktop number (e.g., "Desktop 2")
			label: sprintf( __( 'Desktop %d' ), this.desktopSeq ),
		};
		this.desktops.push( desktop );
		doAction( HOOKS.DESKTOP_CREATED, { desktopId: desktop.id } );
		return desktop;
	}

	/**
	 * Switch the active desktop. No-op if `id` is already active or
	 * doesn't exist. Fires `wp-desktop.desktop.switched` with both
	 * the leaving and entering desktop ids so plugins can sync per-
	 * desktop state (active-desktop-aware indicators, custom widgets,
	 * etc.).
	 */
	public switchDesktop( id: string ): void {
		if ( id === this.activeDesktopId ) {
			return;
		}
		if ( ! this.desktops.some( ( d ) => d.id === id ) ) {
			return;
		}
		const previousId = this.activeDesktopId;
		this.activeDesktopId = id;
		this.refreshDesktopVisibility();

		// Re-focus the topmost window on the new desktop. Without
		// this, focus / z-state would still point at the prior
		// desktop's window — invisible and confusing if the user
		// then triggers a dock action that reuses the focused
		// window's context.
		const topOnNew = [ ...this.stack ]
			.reverse()
			.find( ( w ) => w.config.desktopId === id && w.state !== 'minimized' );
		if ( topOnNew ) {
			this.focus( topOnNew );
		}

		doAction( HOOKS.DESKTOP_SWITCHED, {
			from: previousId,
			to: id,
		} );
	}

	/**
	 * Close a desktop. Refuses to close the last remaining desktop —
	 * the shell needs at least one. Windows on the closed desktop
	 * migrate to the surviving desktop the user lands on (the one to
	 * the left in the bar, falling back to the first), so the user
	 * never silently loses work to a misclick.
	 */
	public closeDesktop( id: string ): void {
		if ( this.desktops.length <= 1 ) {
			return;
		}
		const idx = this.desktops.findIndex( ( d ) => d.id === id );
		if ( idx === -1 ) {
			return;
		}
		// Pick the destination for orphaned windows — and the next
		// active desktop if we're closing the active one. Prefer the
		// neighbour to the left so the user's eye stays anchored;
		// fall back to the right neighbour at index 0.
		const survivorIdx = idx > 0 ? idx - 1 : 1;
		const survivor = this.desktops[ survivorIdx ];

		for ( const w of this.stack ) {
			if ( w.config.desktopId === id ) {
				w.config.desktopId = survivor.id;
			}
		}

		this.desktops.splice( idx, 1 );

		const wasActive = this.activeDesktopId === id;
		if ( wasActive ) {
			this.activeDesktopId = survivor.id;
		}

		// Visibility update path. Two cases:
		//
		// 1. Not in overview — plain `refreshDesktopVisibility` is
		//    enough; windows show / hide via `display`, no transforms
		//    in play.
		//
		// 2. In overview — calling `refreshDesktopVisibility` alone
		//    would surface the survivor's windows at their saved
		//    geometry on top of an overview backdrop that's still
		//    showing, with the previously-active windows still
		//    carrying stale grid transforms + the `--overview` class.
		//    `relayoutOverviewForActiveDesktop` flips both sides
		//    cleanly: clears overview state from windows that just
		//    became inactive, and applies the grid transform + label
		//    to whichever windows are now on the active desktop.
		if ( this.overviewActive ) {
			this.relayoutOverviewForActiveDesktop();
		} else {
			this.refreshDesktopVisibility();
		}

		doAction( HOOKS.DESKTOP_CLOSED, {
			desktopId: id,
			migratedTo: survivor.id,
		} );
	}

	/**
	 * Tear down + re-apply the overview grid for whichever desktop
	 * is currently active. Used by {@link closeDesktop} when the
	 * close happens mid-overview — without it, the post-close
	 * visual state is a mismatch (top bar visible, but windows at
	 * non-overview positions).
	 *
	 * Steps:
	 *   1. Clear overview state from every window that was in the
	 *      previous snapshot (transform → restored, class removed,
	 *      label dropped).
	 *   2. Re-evaluate `display` per window so the new active
	 *      desktop's windows surface and the rest hide.
	 *   3. Snapshot + lay out the new active desktop's eligible
	 *      windows in the overview grid.
	 *
	 * If the new active desktop has no eligible windows (empty
	 * desktop), the overview just shows the top bar over the dim
	 * backdrop — the user can still pick another desktop or hit
	 * Escape.
	 */
	private relayoutOverviewForActiveDesktop(): void {
		// 1. Clear stale overview state.
		for ( const [ winId, snap ] of this.overviewSnapshot ) {
			const w = this.getById( winId );
			if ( w ) {
				w.element.style.transform = snap.transform;
				w.element.style.transition = snap.transition;
				w.element.classList.remove( 'wp-desktop-window--overview' );
			}
		}
		for ( const label of this.overviewLabels.values() ) {
			label.remove();
		}
		this.overviewLabels.clear();
		this.overviewSnapshot.clear();

		// 2. Surface / hide windows for the new active desktop.
		this.refreshDesktopVisibility();

		// 3. Lay out the new active desktop's windows in the grid.
		//    Native windows (OS Settings, plugin-registered panels)
		//    participate just like iframe windows — from overview's
		//    point of view they're windows with content, nothing
		//    special.
		const eligible = this.stack.filter(
			( w ) =>
				w.state !== 'minimized' &&
				w.config.desktopId === this.activeDesktopId,
		);
		if ( eligible.length === 0 ) {
			return;
		}

		for ( const w of eligible ) {
			this.overviewSnapshot.set( w.id, {
				transform: w.element.style.transform || '',
				transition: w.element.style.transition || '',
			} );
		}

		// At this point the dock has already collapsed (we're mid-
		// overview), so the desktop area's bounding rect already
		// reflects the post-collapse width. No need to add the
		// dock width back.
		const targetRect = this.desktop.getBoundingClientRect();
		const layout = computeOverviewLayout(
			eligible,
			targetRect,
			WindowManager.OVERVIEW_TOP_BAR_RESERVE,
		);
		for ( const item of layout ) {
			const el = item.win.element;
			el.classList.add( 'wp-desktop-window--overview' );
			const dx = item.x - el.offsetLeft;
			const dy = item.y - el.offsetTop;
			el.style.transform = `translate(${ dx }px, ${ dy }px) scale(${ item.scale })`;
			const label = this.createOverviewLabel( item );
			el.insertAdjacentElement( 'afterend', label );
			this.overviewLabels.set( item.win.id, label );
		}
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
		// Cascade only the active desktop's windows — windows belonging
		// to other desktops are hidden and re-laying them out would
		// invalidate the user's saved geometry there. Native windows
		// participate: they're windows with content, same as iframes
		// from cascade's point of view.
		const eligible = this.stack.filter(
			( w ) => w.config.desktopId === this.activeDesktopId,
		);
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
		if ( focused ) {
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

	/**
	 * Tile every eligible window into a uniform grid that covers the
	 * desktop area — "Show all windows," macOS-style. The grid
	 * dimensions (cols × rows) are picked to maximise individual
	 * window size while still fitting all of them, by matching the
	 * cell aspect ratio to the desktop area's aspect ratio.
	 *
	 * Algorithm: among every (cols, rows) pair where `cols * rows ≥ N`,
	 * pick the one whose cell aspect ratio (areaWidth/cols : areaHeight/rows)
	 * is closest to the area's aspect ratio. Ties broken by fewer empty
	 * cells. Capped at 6 cols / 6 rows so a runaway window count
	 * doesn't produce postage-stamp tiles.
	 */
	public tile(): void {
		const eligible = this.stack.filter(
			( w ) => w.config.desktopId === this.activeDesktopId,
		);
		if ( eligible.length === 0 ) {
			return;
		}

		// Normalize state: no fullscreen / maximized / minimized — every
		// window participates in the tiled grid.
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
		const auto = pickGridDimensions(
			eligible.length,
			rect.width,
			rect.height,
		);

		// Let plugins override the chosen grid. Validate the return:
		// a non-integer, non-positive, or under-sized grid would
		// produce a broken layout, so we silently fall back to the
		// algorithmic choice rather than trust a malformed value.
		const filtered = applyFilters<
			{ cols: number; rows: number },
			[ { windowCount: number; areaWidth: number; areaHeight: number } ]
		>(
			HOOKS.ARRANGE_TILE_DIMENSIONS,
			auto,
			{
				windowCount: eligible.length,
				areaWidth: rect.width,
				areaHeight: rect.height,
			},
		);
		const { cols, rows } = isValidGrid( filtered, eligible.length )
			? { cols: Math.floor( filtered.cols ), rows: Math.floor( filtered.rows ) }
			: auto;

		doAction( HOOKS.ARRANGE_TILE_STARTING, {
			windowCount: eligible.length,
			cols,
			rows,
		} );

		const padding = 16;
		const gap = 12;
		const cellWidth = Math.floor(
			( rect.width - padding * 2 - gap * ( cols - 1 ) ) / cols,
		);
		const cellHeight = Math.floor(
			( rect.height - padding * 2 - gap * ( rows - 1 ) ) / rows,
		);

		eligible.forEach( ( w, i ) => {
			const col = i % cols;
			const row = Math.floor( i / cols );
			w.element.style.left = `${ padding + col * ( cellWidth + gap ) }px`;
			w.element.style.top = `${ padding + row * ( cellHeight + gap ) }px`;
			w.element.style.width = `${ cellWidth }px`;
			w.element.style.height = `${ cellHeight }px`;
		} );

		const focused = this.getFocused();
		if ( focused ) {
			this.focus( focused );
		}

		document.dispatchEvent(
			new CustomEvent( 'wp-desktop-window-changed', {
				detail: { reason: 'tile' },
			} ),
		);

		doAction( HOOKS.ARRANGE_TILE_APPLIED, {
			windowCount: eligible.length,
			cols,
			rows,
		} );
	}

	// ----------------------------------------------------------
	// Snap to grid — optional drag/resize quantization. Stored on
	// the manager + persisted to localStorage so the choice survives
	// page reloads. Windows read snap state via `getSnapConfig()`
	// which the manager wires onto each new window.
	// ----------------------------------------------------------

	/** Storage key for the snap-to-grid preference. */
	private static readonly SNAP_STORAGE_KEY = 'wp-desktop-snap-to-grid';

	/** Whether drag/resize movements snap to the desktop-area grid. */
	private snapEnabled = ( () => {
		try {
			return window.localStorage.getItem(
				WindowManager.SNAP_STORAGE_KEY,
			) === '1';
		} catch {
			return false;
		}
	} )();

	/** Public read for UI (admin-bar checkbox initial state). */
	public isSnapEnabled(): boolean {
		return this.snapEnabled;
	}

	/**
	 * Toggle (or set) the snap-to-grid preference. Persisted via
	 * localStorage and broadcast through {@link HOOKS.ARRANGE_SNAP_CHANGED}
	 * so any external UI mirroring the state stays in sync.
	 */
	public setSnapEnabled( enabled: boolean ): void {
		if ( this.snapEnabled === enabled ) {
			return;
		}
		this.snapEnabled = enabled;
		try {
			window.localStorage.setItem(
				WindowManager.SNAP_STORAGE_KEY,
				enabled ? '1' : '0',
			);
		} catch {
			/* private mode / storage unavailable — silently degrade */
		}
		doAction( HOOKS.ARRANGE_SNAP_CHANGED, { enabled } );
	}

	/**
	 * Resolve the live snap config for a window's drag/resize loop.
	 * Cell sizes scale with the desktop area so a small viewport gets
	 * a smaller grid (~12 cols × 8 rows) and a 4K monitor gets a
	 * proportionally finer one.
	 *
	 * Each call hits `getBoundingClientRect`, so callers should cache
	 * the result for the duration of a single drag rather than calling
	 * once per pointermove.
	 */
	public getSnapConfig(): { enabled: boolean; cellWidth: number; cellHeight: number } {
		if ( ! this.snapEnabled ) {
			return { enabled: false, cellWidth: 0, cellHeight: 0 };
		}
		const rect = this.desktop.getBoundingClientRect();
		// Aim for roughly 12 columns on landscape, 8 on portrait.
		// Clamp to reasonable bounds so a 320 px sidebar doesn't
		// produce 27-pixel cells.
		const targetCols = rect.width >= rect.height ? 12 : 8;
		const auto = {
			cellWidth: Math.max(
				40,
				Math.round( rect.width / targetCols ),
			),
			cellHeight: Math.max(
				40,
				Math.round( rect.height / Math.round( targetCols * 0.66 ) ),
			),
		};

		// Filter — plugins can swap in a custom grid (fixed Tetris
		// blocks, golden-ratio cells, etc.). A non-positive return
		// is rejected; we'd rather silently use the default than
		// produce divide-by-zero math downstream.
		const filtered = applyFilters<
			{ cellWidth: number; cellHeight: number },
			[ { areaWidth: number; areaHeight: number } ]
		>(
			HOOKS.ARRANGE_SNAP_CELL_SIZE,
			auto,
			{ areaWidth: rect.width, areaHeight: rect.height },
		);
		const { cellWidth, cellHeight } = isValidCellSize( filtered )
			? filtered
			: auto;

		return { enabled: true, cellWidth, cellHeight };
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
	 * Top-bar element rendered inside the desktop area while overview
	 * is active. Carries a tile per desktop + a "+ new" tile. Removed
	 * during overview exit.
	 */
	private overviewTopBar: HTMLElement | null = null;

	/**
	 * Vertical space reserved at the top of the desktop area for the
	 * overview top bar. Used by `enterOverview` to push the thumbnail
	 * grid downward so tiles aren't covered by the bar.
	 */
	private static readonly OVERVIEW_TOP_BAR_RESERVE = 120;
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
		// Overview shows only the ACTIVE desktop's windows in the main
		// grid; windows on other desktops stay hidden underneath. The
		// top bar (rendered later) gives the user a way to switch.
		// Native windows (OS Settings, Jorvy, etc.) participate as
		// first-class citizens — clicking their thumbnail maximizes
		// them, they lay out in the grid, they count toward the
		// top-bar tile's window count.
		const eligible = this.stack.filter(
			( w ) =>
				w.state !== 'minimized' &&
				w.config.desktopId === this.activeDesktopId,
		);
		// Even with zero windows on the active desktop we still enter
		// overview — otherwise an empty desktop would have no way to
		// reach the top bar to switch to one with windows.
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

		// Build + mount the top bar. Belongs INSIDE the desktop area
		// so it shares the dim backdrop, but its own clicks are
		// allowed past the click blocker (see below).
		this.overviewTopBar = this.buildOverviewTopBar();
		this.desktop.appendChild( this.overviewTopBar );

		// Reserve vertical space at the top for the bar so the grid
		// shifts down (and shrinks to fit) — thumbnails never land
		// behind the tile strip.
		const layout = computeOverviewLayout(
			eligible,
			targetRect,
			WindowManager.OVERVIEW_TOP_BAR_RESERVE,
		);

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
		// window" click handler. Top-bar clicks are exempt — those
		// are deliberate UI interactions (switch desktop, create,
		// close) that need their own handlers to fire.
		this.overviewClickBlocker = ( e: MouseEvent ) => {
			const target = e.target as HTMLElement | null;
			if ( target?.closest( '.wp-desktop-overview-top-bar' ) ) {
				return;
			}
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
	/**
	 * Build the overview top bar — a tile per virtual desktop plus a
	 * trailing "+" tile that creates a new one. Each tile carries:
	 *
	 *  - the desktop's label
	 *  - a window-count meta line ("3 windows")
	 *  - an active-state border when the desktop is the current one
	 *  - a per-tile close button (X) revealed on hover, hidden when
	 *    only one desktop exists (you can't close the last one)
	 *
	 * Tile click → switch + exit overview onto that desktop. The plus
	 * tile creates a new desktop, switches to it, and exits. The X on
	 * a tile closes that desktop (without exiting overview, so the
	 * user can keep reorganising).
	 */
	private buildOverviewTopBar(): HTMLElement {
		const bar = document.createElement( 'div' );
		bar.className = 'wp-desktop-overview-top-bar';

		const list = document.createElement( 'div' );
		list.className = 'wp-desktop-overview-top-bar__list';
		bar.appendChild( list );

		for ( const d of this.desktops ) {
			list.appendChild( this.buildDesktopTile( d ) );
		}

		// Trailing "+" tile.
		const addTile = document.createElement( 'button' );
		addTile.type = 'button';
		addTile.className =
			'wp-desktop-overview-top-bar__tile wp-desktop-overview-top-bar__tile--add';
		addTile.setAttribute( 'aria-label', __( 'Add new desktop' ) );
		addTile.innerHTML =
			'<span class="wp-desktop-overview-top-bar__tile-plus" aria-hidden="true">+</span>';
		addTile.addEventListener( 'click', ( e: MouseEvent ) => {
			e.preventDefault();
			e.stopPropagation();
			const created = this.createDesktop();
			// Auto-switch to the new desktop AND exit overview onto
			// it — matches macOS Spaces ergonomics where pressing
			// "+" lands you on the freshly-created blank space.
			this.exitOverviewToDesktop( created.id );
		} );
		list.appendChild( addTile );

		return bar;
	}

	/** Build a single desktop tile for the overview top bar. */
	private buildDesktopTile( d: Desktop ): HTMLElement {
		const tile = document.createElement( 'button' );
		tile.type = 'button';
		tile.className = 'wp-desktop-overview-top-bar__tile';
		tile.dataset.desktopId = d.id;
		if ( d.id === this.activeDesktopId ) {
			tile.classList.add(
				'wp-desktop-overview-top-bar__tile--active',
			);
		}
		// translators: %s is the desktop label
		tile.setAttribute( 'aria-label', sprintf( __( 'Switch to %s' ), d.label ) );

		const preview = document.createElement( 'span' );
		preview.className = 'wp-desktop-overview-top-bar__tile-preview';
		// Window-count badge inside the preview area gives users a
		// quick "what's on this desktop" hint without needing real
		// per-window thumbnails (a follow-up enhancement). Includes
		// native windows — they're windows just like iframes from
		// the user's count-what's-open perspective.
		const count = this.stack.filter(
			( w ) => w.config.desktopId === d.id,
		).length;
		if ( count > 0 ) {
			const badge = document.createElement( 'span' );
			badge.className = 'wp-desktop-overview-top-bar__tile-count';
			badge.textContent = String( count );
			preview.appendChild( badge );
		}
		tile.appendChild( preview );

		const label = document.createElement( 'span' );
		label.className = 'wp-desktop-overview-top-bar__tile-label';
		label.textContent = d.label;
		tile.appendChild( label );

		// Close X — hidden via CSS when only one desktop exists, so
		// users can't soft-lock themselves out of the last one. We
		// still render the button (rather than omitting) so its
		// presence/absence doesn't reflow the tile.
		const closeBtn = document.createElement( 'span' );
		closeBtn.className = 'wp-desktop-overview-top-bar__tile-close';
		closeBtn.setAttribute( 'role', 'button' );
		closeBtn.setAttribute( 'tabindex', '0' );
		// translators: %s is the desktop label
		closeBtn.setAttribute( 'aria-label', sprintf( __( 'Close %s' ), d.label ) );
		closeBtn.innerHTML =
			'<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
		closeBtn.addEventListener( 'click', ( e: MouseEvent ) => {
			// stopPropagation so the parent tile's click handler
			// doesn't ALSO fire (which would switch + exit on top
			// of the close).
			e.preventDefault();
			e.stopPropagation();
			this.closeDesktop( d.id );
			this.refreshOverviewTopBar();
		} );
		tile.appendChild( closeBtn );

		tile.addEventListener( 'click', ( e: MouseEvent ) => {
			e.preventDefault();
			e.stopPropagation();
			this.exitOverviewToDesktop( d.id );
		} );

		return tile;
	}

	/**
	 * Re-render the top bar in place. Called after any operation that
	 * mutates the desktop list (create, close) so the bar reflects
	 * the new state without a full overview exit/re-enter cycle.
	 */
	private refreshOverviewTopBar(): void {
		if ( ! this.overviewTopBar ) {
			return;
		}
		const fresh = this.buildOverviewTopBar();
		this.overviewTopBar.replaceWith( fresh );
		this.overviewTopBar = fresh;
	}

	/**
	 * Switch to the given desktop, then exit overview without a
	 * specific window selection. Used by top-bar tile clicks and the
	 * post-create flow.
	 */
	private exitOverviewToDesktop( desktopId: string ): void {
		this.switchDesktop( desktopId );
		// Exit overview WITHOUT selecting a specific window — the
		// active desktop has its own focus state that the switch
		// already restored.
		this.exitOverview();
	}

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
			meta.textContent = sprintf(
				// translators: %d is the number of external sub-tabs open on this window.
				_n( '· %d open tab', '· %d open tabs', tabCount ),
				tabCount,
			);
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

		// Top bar fades out in parallel with the windows. Removed
		// fully when the animation settles (in the setTimeout below).
		if ( this.overviewTopBar ) {
			this.overviewTopBar.classList.add(
				'wp-desktop-overview-top-bar--out',
			);
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
			if ( this.overviewTopBar ) {
				this.overviewTopBar.remove();
				this.overviewTopBar = null;
			}
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
				desktopId: w.config.desktopId || this.activeDesktopId,
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
			activeDesktop: this.activeDesktopId,
			focused: focusedId,
			updated: Math.floor( Date.now() / 1000 ),
		};
	}

	/**
	 * Replace the in-memory desktops list with a server-restored
	 * snapshot. Called once during shell boot, BEFORE any windows are
	 * recreated, so the per-window `desktopId` assignments line up
	 * with desktop ids that actually exist.
	 *
	 * Defends against an empty list — the shell can't function with
	 * zero desktops, so an empty payload falls back to the default.
	 * The seq counter advances past the highest numeric suffix in
	 * the restored list so newly created desktops don't collide.
	 */
	public seedDesktops( desktops: Desktop[], activeDesktopId: string ): void {
		if ( desktops.length === 0 ) {
			return;
		}
		this.desktops = desktops.map( ( d ) => ( { ...d } ) );
		this.activeDesktopId = desktops.some( ( d ) => d.id === activeDesktopId )
			? activeDesktopId
			: desktops[ 0 ].id;

		// Advance the seq counter past the highest existing numeric
		// suffix (`desktop-3` → seq 3) so the next createDesktop()
		// produces a fresh id.
		let highest = 0;
		for ( const d of desktops ) {
			const match = d.id.match( /^desktop-(\d+)$/ );
			if ( match ) {
				const n = parseInt( match[ 1 ], 10 );
				if ( Number.isFinite( n ) && n > highest ) {
					highest = n;
				}
			}
		}
		this.desktopSeq = Math.max( this.desktopSeq, highest );
	}
}

/**
 * Validate a plugin-supplied grid choice from the
 * `wp-desktop.arrange.tile.dimensions` filter. Rejects non-finite
 * numbers, non-positive dimensions, and grids smaller than the
 * window count (which would silently drop windows).
 */
function isValidGrid(
	candidate: unknown,
	windowCount: number,
): candidate is { cols: number; rows: number } {
	if ( ! candidate || typeof candidate !== 'object' ) {
		return false;
	}
	const c = ( candidate as { cols?: unknown } ).cols;
	const r = ( candidate as { rows?: unknown } ).rows;
	if ( typeof c !== 'number' || typeof r !== 'number' ) {
		return false;
	}
	if ( ! Number.isFinite( c ) || ! Number.isFinite( r ) ) {
		return false;
	}
	if ( c < 1 || r < 1 ) {
		return false;
	}
	return Math.floor( c ) * Math.floor( r ) >= windowCount;
}

/**
 * Validate a plugin-supplied snap cell size from the
 * `wp-desktop.arrange.snap.cell-size` filter. Both dimensions must
 * be positive finite numbers; anything else falls back to the
 * algorithmic default to avoid divide-by-zero downstream.
 */
function isValidCellSize(
	candidate: unknown,
): candidate is { cellWidth: number; cellHeight: number } {
	if ( ! candidate || typeof candidate !== 'object' ) {
		return false;
	}
	const w = ( candidate as { cellWidth?: unknown } ).cellWidth;
	const h = ( candidate as { cellHeight?: unknown } ).cellHeight;
	if ( typeof w !== 'number' || typeof h !== 'number' ) {
		return false;
	}
	if ( ! Number.isFinite( w ) || ! Number.isFinite( h ) ) {
		return false;
	}
	return w > 0 && h > 0;
}

/**
 * Choose the (cols × rows) grid for `tile()` that maximises
 * individual window size while still fitting all `n` windows in a
 * `width × height` area. Scoring: minimise the absolute difference
 * between the cell aspect ratio and the area aspect ratio, with a
 * small penalty for empty trailing cells (so 5 windows pick 3×2
 * over 5×1 when the area is roughly square).
 *
 * Capped at 6×6 — beyond that, individual windows are too small to
 * be useful and the user is better off with cascade or overview.
 */
function pickGridDimensions(
	n: number,
	width: number,
	height: number,
): { cols: number; rows: number } {
	if ( n <= 1 ) {
		return { cols: 1, rows: 1 };
	}
	const areaAspect = width / Math.max( 1, height );
	const max = 6;
	let best = { cols: n, rows: 1, score: Infinity };
	for ( let cols = 1; cols <= Math.min( max, n ); cols++ ) {
		const rows = Math.min( max, Math.ceil( n / cols ) );
		if ( cols * rows < n ) {
			continue;
		}
		const cellAspect = ( width / cols ) / Math.max( 1, height / rows );
		const aspectDelta = Math.abs( cellAspect - areaAspect );
		const emptyCells = cols * rows - n;
		const score = aspectDelta + emptyCells * 0.05;
		if ( score < best.score ) {
			best = { cols, rows, score };
		}
	}
	return { cols: best.cols, rows: best.rows };
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
	topInset = 0,
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
	// `topInset` carves out vertical space for the desktops top bar.
	// Cells SHRINK to fit the remaining height AND shift down by
	// `topInset` so the first row's label clears the bar instead of
	// landing behind it.
	const cellHeight =
		( rect.height - padding * 2 - topInset - gap * ( rows - 1 ) ) / rows;
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
		// `topInset` pushes the entire grid downward.
		const cellY =
			topInset + padding + row * ( cellHeight + gap ) + labelReserve;

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
