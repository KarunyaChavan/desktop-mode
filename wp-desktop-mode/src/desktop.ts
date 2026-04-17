/**
 * Desktop Mode — Entry Point.
 *
 * Initializes the desktop shell and opens the current admin page in a window.
 *
 * @since 6.9.0
 */

import { WindowManager } from './window-manager';
import { Dock } from './dock';
import { deriveWindowId } from './utils';
import type { DesktopConfig } from './types';

declare global {
	interface Window {
		wpDesktopConfig?: DesktopConfig;
		wp?: {
			desktop?: {
				windowManager: WindowManager;
				dock: Dock | null;
			};
		};
	}
}

/**
 * Initialize Desktop Mode.
 */
function init(): void {
	const config = window.wpDesktopConfig;
	if ( ! config ) {
		return;
	}

	const desktopArea = document.getElementById( 'wp-desktop-area' );
	if ( ! desktopArea ) {
		return;
	}

	const manager = new WindowManager( desktopArea );

	// Initialize the dock.
	const dockEl = document.getElementById( 'wp-desktop-dock' );
	let dock: Dock | null = null;
	if ( dockEl && config.dockItems ) {
		dock = new Dock(
			dockEl,
			manager,
			config.dockItems,
			config.adminUrl
		);
		desktopArea.classList.add( 'wp-desktop-area--with-dock' );
	}

	// Expose on wp.desktop global for plugins.
	window.wp = window.wp || {};
	window.wp.desktop = {
		windowManager: manager,
		dock: dock,
	};

	// Click on the desktop background to minimize all windows (like macOS "Show Desktop").
	desktopArea.addEventListener( 'click', ( e: MouseEvent ) => {
		// Only trigger on direct clicks on the desktop area itself, not on windows.
		if ( e.target === desktopArea ) {
			const windows = manager.getAll();
			const allMinimized = windows.length > 0 && windows.every( ( w ) => w.state === 'minimized' );
			if ( allMinimized ) {
				for ( const win of windows ) {
					win.restore();
				}
			} else {
				for ( const win of windows ) {
					if ( win.state !== 'minimized' ) {
						win.minimize();
					}
				}
			}
		}
	} );

	// Open the current page in a window. Look up the matching dock entry by
	// derived window ID so the auto-opened window also gets its tab strip
	// when the user lands directly on a sub-page (e.g., Categories).
	const windowId = deriveWindowId( config.currentPage, config.adminUrl );
	const matchedDockItem = ( config.dockItems || [] ).find(
		( item ) => deriveWindowId( item.url, config.adminUrl ) === windowId
			|| ( item.submenu || [] ).some(
				( sub ) => deriveWindowId( sub.url, config.adminUrl ) === windowId
			)
	);
	manager.open( {
		id: windowId,
		url: config.currentPage,
		title: config.currentTitle,
		icon: config.currentIcon,
		submenu: matchedDockItem?.submenu,
	} );

	// Dispatch init event.
	document.dispatchEvent( new CustomEvent( 'wp-desktop-init', {
		detail: { config },
	} ) );
}

// Initialize when DOM is ready.
if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', init );
} else {
	init();
}
