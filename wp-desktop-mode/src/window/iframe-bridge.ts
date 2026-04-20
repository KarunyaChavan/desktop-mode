/**
 * Desktop Mode — Window iframe postMessage bridge.
 *
 * Handles the parent → chromeless-iframe → parent message bus. The
 * iframe sends title changes, focus requests, external-link intents,
 * and available screen-meta panels; we route each to the appropriate
 * Window method. All messages are origin-gated to `window.location.origin`
 * — the chromeless iframe is always same-origin.
 *
 * @since 0.8.1
 */

import { addExternalTab } from './tabs';
import type { Window } from './index';

/**
 * Entry point for the `message` event listener the Window binds
 * during `bindEvents`. Filters out foreign-origin and foreign-source
 * events, then dispatches on the `data.type` payload string.
 */
export function handleWindowMessage( win: Window, event: MessageEvent ): void {
	// Only accept same-origin messages from our own iframe.
	if ( event.origin !== window.location.origin ) {
		return;
	}
	if ( ! win.iframe || event.source !== win.iframe.contentWindow ) {
		return;
	}

	const data = event.data;
	if ( ! data || typeof data.type !== 'string' ) {
		return;
	}

	if ( data.type === 'wp-desktop-title-change' && typeof data.title === 'string' ) {
		win.setTitle( data.title );
	}

	if ( data.type === 'wp-desktop-focus-request' ) {
		// Sent from the chromeless bridge on every pointerdown inside
		// the iframe — covers the "click inside iframe should focus
		// this window" UX that isn't reachable via parent-side
		// listeners (the click doesn't cross the browsing-context
		// boundary).
		if ( ! win.element.classList.contains( 'wp-desktop-window--overview' ) ) {
			win.onFocusRequest?.( win );
		}
	}

	if ( data.type === 'wp-desktop-screen-meta' && Array.isArray( data.panels ) ) {
		addScreenMetaButtons( win, data.panels as string[] );
	}

	if ( data.type === 'wp-desktop-screen-meta-state' ) {
		setActiveScreenMetaPanel(
			win,
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
		addExternalTab( win, data.url, label );
	}
}

/**
 * Add Screen Options / Help buttons to the title bar.
 *
 * Called when the iframe reports which screen-meta panels are
 * available. Repopulates on every call — the iframe re-announces on
 * each navigation, and different pages expose different panels.
 */
export function addScreenMetaButtons( win: Window, panels: string[] ): void {
	const container = win.element.querySelector( '.wp-desktop-window__screen-meta' );
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
			win.iframe?.contentWindow?.postMessage(
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
export function setActiveScreenMetaPanel( win: Window, panel: string | null ): void {
	const container = win.element.querySelector( '.wp-desktop-window__screen-meta' );
	if ( ! container ) {
		return;
	}
	container.querySelectorAll<HTMLElement>( '.wp-desktop-window__meta-btn' ).forEach( ( btn ) => {
		const isActive = btn.dataset.panel === panel;
		btn.classList.toggle( 'wp-desktop-window__meta-btn--active', isActive );
		btn.setAttribute( 'aria-pressed', isActive ? 'true' : 'false' );
	} );
}
