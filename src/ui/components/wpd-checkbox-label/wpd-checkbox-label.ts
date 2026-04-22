/**
 * `<wpd-checkbox-label>` — label + checkbox + text, emits
 * `wpd-checkbox-change` on toggle.
 */

import { Component, defineComponent, html } from '../../core';
import { styles } from './wpd-checkbox-label.styles';

export class WpdCheckboxLabel extends Component {
	static props = [ 'label', 'checked' ] as const;
	static styles = [ styles ];

	protected render() {
		const label = ( this as unknown as { label: string | null } ).label || '';
		const checked =
			( this as unknown as { checked: string | null } ).checked !== null;
		return html`
			<label>
				<input
					type="checkbox"
					?checked=${ checked }
					@change=${ ( e: Event ) => this._onChange( e ) }
				/>
				<span class="wpd-checkbox-label__text">${ label }</span>
			</label>
		`;
	}

	private _onChange( e: Event ): void {
		const next = ( e.target as HTMLInputElement ).checked;
		if ( next ) {
			this.setAttribute( 'checked', '' );
		} else {
			this.removeAttribute( 'checked' );
		}
		this.emit( 'wpd-checkbox-change', { checked: next } );
	}
}
defineComponent( 'wpd-checkbox-label', WpdCheckboxLabel );
