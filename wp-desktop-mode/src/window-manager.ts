/**
 * Desktop Mode — Window Manager.
 *
 * Manages the lifecycle, z-order, and focus of all desktop windows.
 *
 * @since 6.9.0
 */

import { Window } from './window';
import type { WindowConfig } from './types';

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
	 * Open a new window or focus an existing one for the given page.
	 */
	public open( config: Partial<WindowConfig> & { id: string; url: string; title: string } ): Window {
		// If a window for this page already exists, focus it.
		const existing = this.getById( config.id );
		if ( existing ) {
			this.focus( existing );
			if ( existing.state === 'minimized' ) {
				existing.restore();
			}
			return existing;
		}

		// Calculate default position and size.
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
		};

		this.cascadeIndex++;

		const win = new Window( fullConfig );

		// Wire up callbacks.
		win.onFocusRequest = ( w: Window ) => this.focus( w );
		win.onClose = ( w: Window ) => this.remove( w );
		win.onMinimize = () => {
			// Focus the next window in the stack.
			const visible = this.stack.filter( ( w ) => w.state !== 'minimized' );
			if ( visible.length > 0 ) {
				this.focus( visible[ visible.length - 1 ] );
			}
		};

		// Add to stack and DOM.
		this.stack.push( win );
		this.desktop.appendChild( win.element );
		this.focus( win );

		// Dispatch custom event.
		document.dispatchEvent( new CustomEvent( 'wp-desktop-window-opened', {
			detail: { windowId: win.id, page: config.url, title: config.title },
		} ) );

		return win;
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

		// Dispatch custom event.
		document.dispatchEvent( new CustomEvent( 'wp-desktop-window-focused', {
			detail: { windowId: win.id },
		} ) );
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

		// Dispatch custom event.
		document.dispatchEvent( new CustomEvent( 'wp-desktop-window-closed', {
			detail: { windowId: win.id },
		} ) );
	}

	/**
	 * Get a window by its ID.
	 */
	public getById( id: string ): Window | undefined {
		return this.stack.find( ( w ) => w.id === id );
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
}
