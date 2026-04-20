/**
 * `<wpd-color-field>` — label + native color input, emits
 * `wpd-color-change` on user edits.
 *
 * The `value` reflects both ways: typing in the picker updates the
 * attribute + emits; setting the attribute updates the picker. We
 * purposefully do NOT debounce here — gradient previews update
 * live and any higher-level flush (save to localStorage) debounces
 * upstream.
 */

import { Component, defineComponent, html } from '../../core';
import { styles } from './wpd-color-field.styles';

export class WpdColorField extends Component {
	static props = [ 'label', 'value' ] as const;
	static styles = [ styles ];

	protected render() {
		const label = ( this as unknown as { label: string | null } ).label || '';
		const value =
			( this as unknown as { value: string | null } ).value || '#000000';
		return html`
			<label>
				<span class="wpd-color-field__label">${ label }</span>
				<input
					type="color"
					.value=${ value }
					@input=${ ( e: Event ) => this._onInput( e ) }
				/>
			</label>
		`;
	}

	private _onInput( e: Event ): void {
		const input = e.target as HTMLInputElement;
		( this as unknown as { value: string } ).value = input.value;
		this.emit( 'wpd-color-change', { value: input.value } );
	}
}
defineComponent( 'wpd-color-field', WpdColorField );
