/**
 * `<wpd-toast-container>` + `<wpd-toast>` — transient top-right
 * notifications.
 *
 * Container lives as a singleton under `<body>` (created lazily by
 * `showToast()` in `src/toast.ts`) and stacks toasts vertically.
 * Each `<wpd-toast>` carries the message text as slotted content
 * and an optional action button via an `action` attribute + a
 * `wpd-toast-action` CustomEvent fired when the button is clicked.
 *
 * The fade-in / fade-out choreography is driven by a `state`
 * attribute (`'in'` → visible, `'out'` → fading) — the component's
 * stylesheet does the actual transition. JS just flips the attr.
 */

import { Component, defineComponent, html } from '../../core';
import { containerStyles, toastStyles } from './wpd-toast.styles';

export class WpdToastContainer extends Component {
	static styles = [ containerStyles ];

	connectedCallback(): void {
		super.connectedCallback();
		this.setAttribute( 'aria-live', 'polite' );
	}

	protected render() {
		return html`<slot></slot>`;
	}
}
defineComponent( 'wpd-toast-container', WpdToastContainer );

export class WpdToast extends Component {
	static props = [ 'action', 'state' ] as const;
	static styles = [ toastStyles ];

	connectedCallback(): void {
		super.connectedCallback();
		if ( ! this.hasAttribute( 'role' ) ) {
			this.setAttribute( 'role', 'status' );
		}
	}

	protected render() {
		const action =
			( this as unknown as { action: string | null } ).action || '';
		// Always render the button element; `?hidden` keeps it out
		// of the accessibility tree when there's no action. Means
		// a single stable template across render passes (my
		// templater doesn't swap subtrees mid-run).
		return html`
			<span class="wpd-toast__label"><slot></slot></span>
			<button
				type="button"
				?hidden=${ ! action }
				@click=${ ( e: Event ) => this._onAction( e ) }
			>
				${ action }
			</button>
		`;
	}

	private _onAction( e: Event ): void {
		e.preventDefault();
		e.stopPropagation();
		this.emit( 'wpd-toast-action', {} );
	}
}
defineComponent( 'wpd-toast', WpdToast );
