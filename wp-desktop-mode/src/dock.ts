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
 * A JS-registered dock tile appended below the admin-menu items.
 *
 * System items don't come from the PHP `$menu` globals — they're shell-
 * level affordances (OS Settings, future: Jorvy, desktop widgets) that
 * know how to open themselves. The dock doesn't call into WindowManager
 * for these; it just invokes the supplied `onOpen` handler, which is
 * free to open a native window, route to a URL, or anything else.
 *
 * Kept visually separated from menu items by a dividing line so users
 * distinguish "admin pages" from "shell affordances".
 */
export interface SystemDockItem {
	/** Unique dock-internal id (for active-state tracking). */
	id: string;
	/** Display label (tooltip). */
	title: string;
	/** Icon — dashicons class, data URI, or URL. */
	icon: string;
	/** Handler invoked on click. */
	onOpen: () => void;
	/**
	 * Optional predicate: returns true when the system item currently
	 * has an open window. Drives the active-dot indicator on the tile.
	 */
	isOpen?: () => boolean;
}

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
	/** Whether this admin page supports multiple open windows. */
	multi?: boolean;
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
	private systemItems: SystemDockItem[] = [];
	private systemItemElements: Map<string, HTMLElement> = new Map();
	private systemSeparator: HTMLElement | null = null;

	constructor(
		container: HTMLElement,
		windowManager: WindowManager,
		items: DockItem[],
		adminUrl: string,
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
	 * Append a JS-registered system item to the dock.
	 *
	 * System items render after the menu-derived items, separated by a
	 * hairline divider. Use for shell affordances that don't live in
	 * the admin menu: OS Settings today, Jorvy and desktop widgets
	 * later. Callers supply their own `onOpen` — the dock doesn't
	 * assume the item opens a window at all.
	 */
	public appendSystemItem( item: SystemDockItem ): void {
		this.systemItems.push( item );

		if ( ! this.systemSeparator ) {
			this.systemSeparator = document.createElement( 'div' );
			this.systemSeparator.className = 'wp-desktop-dock__separator';
			this.systemSeparator.setAttribute( 'aria-hidden', 'true' );
			this.container.appendChild( this.systemSeparator );
		}

		const tile = this.createSystemItemButton( item );
		this.systemItemElements.set( item.id, tile );
		this.container.appendChild( tile );
		this.updateActiveStates();
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
	 * Create a tile for a JS-registered system item. Structurally simpler
	 * than a menu tile — no submenu, no multi-instance rail, no badge —
	 * but uses the same base classes so the hover / focus / active
	 * styling is shared.
	 */
	private createSystemItemButton( item: SystemDockItem ): HTMLElement {
		const tile = document.createElement( 'div' );
		tile.className = 'wp-desktop-dock__item wp-desktop-dock__item--system';
		tile.dataset.systemId = item.id;

		const primary = document.createElement( 'button' );
		primary.className = 'wp-desktop-dock__item-primary';
		primary.setAttribute( 'type', 'button' );
		primary.setAttribute( 'aria-label', item.title );

		primary.appendChild( this.createIcon( item.icon ) );
		primary.addEventListener( 'click', () => item.onOpen() );

		tile.appendChild( primary );
		this.bindTooltip( tile, item.title );

		return tile;
	}

	/**
	 * Create a single dock icon tile.
	 *
	 * A tile is a vertical stack: the primary icon button, plus — for
	 * multi-capable pages — an instance rail rendered below it showing one
	 * dot per open window and a trailing "+" to open another. The rail is
	 * hydrated by {@link updateActiveStates}; here we only place the empty
	 * container so the DOM is stable.
	 */
	private createItemButton( item: DockItem ): HTMLElement {
		const tile = document.createElement( 'div' );
		tile.className = 'wp-desktop-dock__item';
		tile.dataset.menuSlug = item.id;
		if ( item.multi ) {
			tile.classList.add( 'wp-desktop-dock__item--multi' );
		}

		// Primary button — the icon body. Focuses existing or opens first.
		const primary = document.createElement( 'button' );
		primary.className = 'wp-desktop-dock__item-primary';
		primary.setAttribute( 'type', 'button' );
		primary.setAttribute( 'aria-label', item.title );

		const iconEl = this.createIcon( item.icon );
		primary.appendChild( iconEl );

		if ( item.badge > 0 ) {
			const badge = document.createElement( 'span' );
			badge.className = 'wp-desktop-dock__badge';
			badge.textContent = String( item.badge );
			badge.setAttribute( 'aria-label', `${ item.badge } updates` );
			primary.appendChild( badge );
		}

		primary.addEventListener( 'click', () => {
			this.openPage( item );
		} );

		tile.appendChild( primary );

		if ( item.multi ) {
			// "Open another" chip floats off the right edge of the tile.
			// Hidden until ≥1 instance is open — nothing to add
			// alongside otherwise. Instance switching happens via the
			// per-window controls, not the dock.
			const addBtn = document.createElement( 'button' );
			addBtn.type = 'button';
			addBtn.className = 'wp-desktop-dock__item-new';
			addBtn.hidden = true;
			addBtn.setAttribute( 'aria-label', `Open another ${ item.title }` );
			addBtn.innerHTML =
				'<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
				'<path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
				'</svg>';
			addBtn.addEventListener( 'click', ( e: Event ) => {
				e.stopPropagation();
				this.openNewInstance( item );
			} );

			// Override the tile's shared tooltip while hovering the chip:
			// the default says the page name, but on the chip we want the
			// action verb. On pointerleave back into the tile we restore
			// the default text; leaving the tile entirely hides the
			// tooltip as usual. Touch devices never fire pointerenter
			// without an immediate click, so this is effectively
			// desktop-only by nature.
			addBtn.addEventListener( 'pointerenter', () => {
				const rect = addBtn.getBoundingClientRect();
				this.tooltip.textContent = `Open new ${ item.title }`;
				this.tooltip.style.top = `${ rect.top + rect.height / 2 - 14 }px`;
				this.tooltip.classList.add( 'wp-desktop-dock__tooltip--visible' );
			} );
			addBtn.addEventListener( 'pointerleave', ( e: PointerEvent ) => {
				const next = e.relatedTarget as Node | null;
				if ( next && tile.contains( next ) ) {
					const rect = tile.getBoundingClientRect();
					this.tooltip.textContent = item.title;
					this.tooltip.style.top = `${ rect.top + rect.height / 2 - 14 }px`;
					return;
				}
				this.tooltip.classList.remove( 'wp-desktop-dock__tooltip--visible' );
			} );

			tile.appendChild( addBtn );
		}

		this.bindTooltip( tile, item.title );

		return tile;
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
		const baseId = this.deriveWindowId( item.url );

		this.windowManager.open( {
			id: baseId,
			baseId,
			url: item.url,
			title: item.title,
			icon: item.icon.startsWith( 'dashicons-' ) ? item.icon : 'dashicons-admin-generic',
			submenu: item.submenu,
			multi: !! item.multi,
		} );
	}

	/**
	 * Open a brand-new instance of a multi-capable page, even if one is
	 * already open. Invoked by the "+" chip on the dock icon.
	 */
	private openNewInstance( item: DockItem ): void {
		const baseId = this.deriveWindowId( item.url );

		this.windowManager.openNew( {
			id: baseId,
			baseId,
			url: item.url,
			title: item.title,
			icon: item.icon.startsWith( 'dashicons-' ) ? item.icon : 'dashicons-admin-generic',
			submenu: item.submenu,
			multi: true,
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
	 *
	 * The event detail isn't used — we just need to re-query the
	 * window manager on every change — so the handlers take no
	 * argument and the type cast is gone with it.
	 */
	private bindWindowEvents(): void {
		const refresh = (): void => this.updateActiveStates();
		document.addEventListener( 'wp-desktop-window-opened', refresh );
		document.addEventListener( 'wp-desktop-window-closed', refresh );
		document.addEventListener( 'wp-desktop-window-focused', refresh );
	}

	/**
	 * Update the active/focused classes and multi-instance rail on every
	 * dock item in response to a window lifecycle event.
	 *
	 * For singletons the rail is absent; "active" means "the one window
	 * is open". For multi-capable items, active means "≥1 instance is
	 * open" and focused means "the focused window belongs to this item".
	 */
	private updateActiveStates(): void {
		const focused = this.windowManager.getFocused();
		const focusedBaseId = focused ? ( focused.config.baseId || focused.id ) : null;

		for ( const item of this.items ) {
			const tile = this.itemElements.get( item.id );
			if ( ! tile ) {
				continue;
			}

			const baseId = this.deriveWindowId( item.url );
			const instances = item.multi
				? this.windowManager.getAllByBaseId( baseId )
				: [];
			const singleOpen = ! item.multi && !! this.windowManager.getById( baseId );
			const isOpen = item.multi ? instances.length > 0 : singleOpen;
			const isFocused = focusedBaseId === baseId;

			tile.classList.toggle( 'wp-desktop-dock__item--active', isOpen );
			tile.classList.toggle( 'wp-desktop-dock__item--focused', isFocused );

			if ( item.multi ) {
				const addBtn = tile.querySelector<HTMLElement>(
					'.wp-desktop-dock__item-new',
				);
				if ( addBtn ) {
					addBtn.hidden = instances.length === 0;
				}
			}
		}

		// System items — active dot driven by the caller's predicate. No
		// focus indicator: the OS Settings window can be focused like any
		// other, and the regular tile styling picks that up naturally.
		for ( const sys of this.systemItems ) {
			const tile = this.systemItemElements.get( sys.id );
			if ( ! tile ) {
				continue;
			}
			const isOpen = sys.isOpen ? sys.isOpen() : false;
			const isFocused = !! focused && focused.id === sys.id;
			tile.classList.toggle( 'wp-desktop-dock__item--active', isOpen );
			tile.classList.toggle( 'wp-desktop-dock__item--focused', isFocused );
		}
	}
}
