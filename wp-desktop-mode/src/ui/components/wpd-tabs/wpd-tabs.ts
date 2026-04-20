/**
 * `<wpd-tabs>` + `<wpd-tab>` — underline-accent tab strip.
 *
 * The parent owns the `value` prop; tab children reflect selection
 * via `aria-selected`. Tabs DON'T own the panel content — callers
 * render whatever pane should appear and swap based on the
 * `wpd-tab-change` CustomEvent. See the colocated test file for
 * usage.
 */

import { Component, defineComponent, html } from '../../core';
import { tabStyles, tabsStyles } from './wpd-tabs.styles';

export class WpdTab extends Component {
	static props = [ 'value' ] as const;
	static styles = [ tabStyles ];

	protected render() {
		this.setAttribute( 'role', 'tab' );
		return html`
			<button type="button" @click=${ () => this._onPick() }>
				<slot></slot>
			</button>
		`;
	}

	private _onPick(): void {
		this.emit( 'wpd-tab-pick', {
			value: ( this as unknown as { value: string | null } ).value,
		} );
	}
}
defineComponent( 'wpd-tab', WpdTab );

export class WpdTabs extends Component {
	static props = [ 'value', 'label' ] as const;
	static styles = [ tabsStyles ];

	connectedCallback(): void {
		super.connectedCallback();
		this.addEventListener( 'wpd-tab-pick', ( e: Event ) => {
			const detail = ( e as CustomEvent ).detail as { value: string };
			e.stopPropagation();
			( this as unknown as { value: string } ).value = detail.value;
			this.emit( 'wpd-tab-change', { value: detail.value } );
		} );
	}

	protected render() {
		this.setAttribute( 'role', 'tablist' );
		const label = ( this as unknown as { label: string | null } ).label || '';
		if ( label ) {
			this.setAttribute( 'aria-label', label );
		}
		// Mirror the current `value` onto each child tab via
		// aria-selected. Children live in LIGHT DOM; deferred one
		// microtask so newly-added children have a chance to upgrade
		// before we read them.
		const current = ( this as unknown as { value: string | null } ).value;
		queueMicrotask( () => {
			const tabs = this.querySelectorAll( 'wpd-tab' );
			for ( const tab of Array.from( tabs ) ) {
				const v = tab.getAttribute( 'value' );
				tab.setAttribute(
					'aria-selected',
					v === current ? 'true' : 'false',
				);
				tab.setAttribute( 'tabindex', v === current ? '0' : '-1' );
			}
		} );
		return html`<slot></slot>`;
	}
}
defineComponent( 'wpd-tabs', WpdTabs );
