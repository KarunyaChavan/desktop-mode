/**
 * `<wpd-range-field>` — label + range slider + live value readout.
 *
 * Emits `wpd-range-change` with `{ value: number }` — already
 * parsed to a number so consumers don't repeat the coercion.
 */

import { Component, defineComponent, html } from '../../core';
import { styles } from './wpd-range-field.styles';

export class WpdRangeField extends Component {
	static props = [ 'label', 'value', 'min', 'max', 'step', 'suffix' ] as const;
	static styles = [ styles ];

	protected render() {
		const label = ( this as unknown as { label: string | null } ).label || '';
		const value =
			( this as unknown as { value: string | null } ).value || '0';
		const min = ( this as unknown as { min: string | null } ).min || '0';
		const max = ( this as unknown as { max: string | null } ).max || '100';
		const step = ( this as unknown as { step: string | null } ).step || '1';
		const suffix =
			( this as unknown as { suffix: string | null } ).suffix || '';
		return html`
			<label class="wpd-range-field__label">${ label }</label>
			<input
				type="range"
				min=${ min }
				max=${ max }
				step=${ step }
				.value=${ value }
				@input=${ ( e: Event ) => this._onInput( e ) }
			/>
			<span class="wpd-range-field__value">${ value }${ suffix }</span>
		`;
	}

	private _onInput( e: Event ): void {
		const input = e.target as HTMLInputElement;
		const n = parseFloat( input.value );
		if ( ! Number.isFinite( n ) ) {
			return;
		}
		( this as unknown as { value: string } ).value = String( n );
		this.emit( 'wpd-range-change', { value: n } );
	}
}
defineComponent( 'wpd-range-field', WpdRangeField );
