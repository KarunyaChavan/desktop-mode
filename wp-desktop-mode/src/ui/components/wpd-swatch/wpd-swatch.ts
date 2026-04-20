/**
 * `<wpd-swatch>` — single selectable color/wallpaper tile.
 *
 * The tile renders as a button with `aria-pressed` tracking `selected`
 * and a `background` css-property driven by `preview`. Clicks emit a
 * `wpd-pick` CustomEvent with `{ value }`. See the colocated test
 * file for usage.
 */

import { Component, defineComponent, html } from '../../core';
import { styles } from './wpd-swatch.styles';

export class WpdSwatch extends Component {
	static props = [ 'value', 'label', 'selected', 'preview', 'size' ] as const;
	static styles = [ styles ];

	protected render() {
		const selected =
			( this as unknown as { selected: string | null } ).selected !== null;
		const label = ( this as unknown as { label: string | null } ).label || '';
		const preview =
			( this as unknown as { preview: string | null } ).preview || '';
		return html`
			<button
				type="button"
				aria-pressed=${ selected ? 'true' : 'false' }
				aria-label=${ label }
				title=${ label }
				style="background: ${ preview }"
				@click=${ () => this._onPick() }
			></button>
		`;
	}

	private _onPick(): void {
		this.emit( 'wpd-pick', {
			value: ( this as unknown as { value: string | null } ).value,
		} );
	}
}
defineComponent( 'wpd-swatch', WpdSwatch );
