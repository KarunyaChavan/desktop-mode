/**
 * `<wpd-swatch-grid>` — flex grid container for `<wpd-swatch>`
 * children. Carries the radiogroup semantics so screen readers
 * announce the set as a unit.
 */

import { Component, defineComponent, html } from '../../core';
import { styles } from './wpd-swatch-grid.styles';

export class WpdSwatchGrid extends Component {
	static props = [ 'label', 'columns', 'mode' ] as const;
	static styles = [ styles ];

	protected render() {
		const label = ( this as unknown as { label: string | null } ).label || '';
		const cols =
			( this as unknown as { columns: string | null } ).columns || '';
		if ( cols ) {
			this.style.setProperty( '--wpd-swatch-grid-cols', cols );
		}
		this.setAttribute( 'role', 'radiogroup' );
		if ( label ) {
			this.setAttribute( 'aria-label', label );
		}
		return html`<slot></slot>`;
	}
}
defineComponent( 'wpd-swatch-grid', WpdSwatchGrid );
