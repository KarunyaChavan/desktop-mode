/**
 * Desktop Mode — Dock.
 *
 * Renders the icon-only dock on the left edge of the desktop.
 * Icons come from the admin menu data passed via wpDesktopConfig.dockItems.
 * The dock always starts with a WordPress logo "Show Desktop" button
 * that minimizes all open windows.
 *
 * @since 6.9.0
 */

import type { WindowManager } from './window-manager';
import { deriveWindowId } from './utils';

/**
 * A single dock item from the PHP menu data.
 */
export interface DockItem {
	/** Unique identifier (menu slug). */
	id: string;
	/** Display label (for tooltip). */
	title: string;
	/** Icon: dashicons class, data:image/svg+xml, URL, or 'none'. */
	icon: string;
	/** Admin page URL to open. */
	url: string;
	/** Number badge (update count, comment count, etc.). 0 = no badge. */
	badge: number;
	/** Submenu items. */
	submenu: { title: string; url: string }[];
}

/**
 * Dock class.
 *
 * Manages the dock element, its icons, tooltips, and interaction with the window manager.
 */
export class Dock {
	private container: HTMLElement;
	private windowManager: WindowManager;
	private items: DockItem[];
	private tooltip: HTMLElement;
	private itemElements: Map<string, HTMLElement> = new Map();
	private adminUrl: string;

	constructor(
		container: HTMLElement,
		windowManager: WindowManager,
		items: DockItem[],
		adminUrl: string
	) {
		this.container = container;
		this.windowManager = windowManager;
		this.items = items;
		this.adminUrl = adminUrl;

		// Create tooltip element (shared across all items).
		this.tooltip = document.createElement( 'div' );
		this.tooltip.className = 'wp-desktop-dock__tooltip';
		this.tooltip.setAttribute( 'role', 'tooltip' );
		document.body.appendChild( this.tooltip );

		this.render();
		this.bindWindowEvents();
	}

	/**
	 * Render the dock contents.
	 */
	private render(): void {
		this.container.innerHTML = '';

		// Dock items from the admin menu.
		for ( const item of this.items ) {
			const btn = this.createItemButton( item );
			this.itemElements.set( item.id, btn );
			this.container.appendChild( btn );
		}
	}

	/**
	 * Create a single dock icon button.
	 */
	private createItemButton( item: DockItem ): HTMLElement {
		const btn = document.createElement( 'button' );
		btn.className = 'wp-desktop-dock__item';
		btn.setAttribute( 'type', 'button' );
		btn.setAttribute( 'aria-label', item.title );
		btn.dataset.menuSlug = item.id;

		// Icon.
		const iconEl = this.createIcon( item.icon );
		btn.appendChild( iconEl );

		// Badge.
		if ( item.badge > 0 ) {
			const badge = document.createElement( 'span' );
			badge.className = 'wp-desktop-dock__badge';
			badge.textContent = String( item.badge );
			badge.setAttribute( 'aria-label', `${ item.badge } updates` );
			btn.appendChild( badge );
		}

		// Click → open or focus window.
		btn.addEventListener( 'click', () => {
			this.openPage( item );
		} );

		// Tooltip.
		this.bindTooltip( btn, item.title );

		return btn;
	}

	/**
	 * Create the icon element based on the icon type.
	 */
	private createIcon( icon: string ): HTMLElement {
		if ( icon.startsWith( 'dashicons-' ) ) {
			// Dashicon.
			const el = document.createElement( 'span' );
			el.className = `dashicons ${ icon }`;
			el.setAttribute( 'aria-hidden', 'true' );
			return el;
		}

		if ( icon.startsWith( 'data:image/svg+xml;base64,' ) ) {
			// Inline SVG data URI — render as a CSS background.
			// Validate that the base64 payload contains only valid characters.
			const base64Part = icon.slice( 'data:image/svg+xml;base64,'.length );
			if ( /^[A-Za-z0-9+/=]+$/.test( base64Part ) ) {
				const el = document.createElement( 'span' );
				el.className = 'wp-desktop-dock__item-svg';
				el.style.backgroundImage = `url("${ icon }")`;
				el.style.backgroundSize = 'contain';
				el.style.backgroundRepeat = 'no-repeat';
				el.style.backgroundPosition = 'center';
				el.setAttribute( 'aria-hidden', 'true' );
				return el;
			}
			// Invalid base64 — fall through to generic icon.
		}

		if ( icon && icon !== 'none' && icon !== 'div' ) {
			// URL to an image.
			const img = document.createElement( 'img' );
			img.className = 'wp-desktop-dock__item-img';
			img.src = icon;
			img.alt = '';
			img.setAttribute( 'aria-hidden', 'true' );
			return img;
		}

		// Fallback: generic admin icon.
		const el = document.createElement( 'span' );
		el.className = 'dashicons dashicons-admin-generic';
		el.setAttribute( 'aria-hidden', 'true' );
		return el;
	}

	/**
	 * Bind tooltip show/hide on hover.
	 */
	private bindTooltip( el: HTMLElement, text: string ): void {
		el.addEventListener( 'pointerenter', () => {
			const rect = el.getBoundingClientRect();
			this.tooltip.textContent = text;
			this.tooltip.style.top = `${ rect.top + rect.height / 2 - 14 }px`;
			this.tooltip.classList.add( 'wp-desktop-dock__tooltip--visible' );
		} );

		el.addEventListener( 'pointerleave', () => {
			this.tooltip.classList.remove( 'wp-desktop-dock__tooltip--visible' );
		} );
	}

	/**
	 * Open an admin page in a window (or focus if already open).
	 */
	private openPage( item: DockItem ): void {
		// Derive window ID from the menu slug.
		const windowId = this.deriveWindowId( item.url );

		this.windowManager.open( {
			id: windowId,
			url: item.url,
			title: item.title,
			icon: item.icon.startsWith( 'dashicons-' ) ? item.icon : 'dashicons-admin-generic',
			submenu: item.submenu,
		} );
	}

	/**
	 * Derive a window ID from an admin page URL.
	 */
	private deriveWindowId( url: string ): string {
		return deriveWindowId( url, this.adminUrl );
	}

	/**
	 * Listen to window events to update active/focused indicators on dock items.
	 */
	private bindWindowEvents(): void {
		document.addEventListener( 'wp-desktop-window-opened', ( ( e: CustomEvent ) => {
			this.updateActiveStates();
		} ) as EventListener );

		document.addEventListener( 'wp-desktop-window-closed', ( ( e: CustomEvent ) => {
			this.updateActiveStates();
		} ) as EventListener );

		document.addEventListener( 'wp-desktop-window-focused', ( ( e: CustomEvent ) => {
			this.updateActiveStates();
		} ) as EventListener );
	}

	/**
	 * Update the active/focused CSS classes on dock items based on open windows.
	 */
	private updateActiveStates(): void {
		const openWindows = this.windowManager.getAll();
		const focused = this.windowManager.getFocused();

		// Build a set of open window IDs.
		const openIds = new Set( openWindows.map( ( w ) => w.id ) );

		for ( const item of this.items ) {
			const btn = this.itemElements.get( item.id );
			if ( ! btn ) {
				continue;
			}

			const windowId = this.deriveWindowId( item.url );
			const isOpen = openIds.has( windowId );
			const isFocused = focused && focused.id === windowId;

			btn.classList.toggle( 'wp-desktop-dock__item--active', isOpen );
			btn.classList.toggle( 'wp-desktop-dock__item--focused', !! isFocused );
		}
	}
}
