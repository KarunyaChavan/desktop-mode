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

	constructor( desktop: HTMLElement ) {
		this.desktop = desktop;
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
		config: Partial<WindowConfig> & { id: string; url: string; title: string; baseId?: string }
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
			new CustomEvent( 'wp-desktop-window-opened', { detail: openedDetail } )
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
			new CustomEvent( 'wp-desktop-window-focused', { detail: focusedDetail } )
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
			new CustomEvent( 'wp-desktop-window-closed', { detail: closedDetail } )
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
