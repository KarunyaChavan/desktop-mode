/**
 * `<wpd-button>` — thin wrapper around `<button>` with consistent
 * variant styling + a slot for the label.
 *
 * Variants: `primary` · `ghost` · `danger` · `link`. Omitting the
 * attribute gives the default "ghost" look.
 */

import { Component, defineComponent, html } from '../../core';
import { styles } from './wpd-button.styles';

export class WpdButton extends Component {
	static props = [ 'variant', 'disabled', 'type', 'busy' ] as const;
	static styles = [ styles ];

	protected render() {
		const disabled =
			( this as unknown as { disabled: string | null } ).disabled !== null;
		const type = ( this as unknown as { type: string | null } ).type || 'button';
		return html`
			<button type=${ type } ?disabled=${ disabled }>
				<slot></slot>
			</button>
		`;
	}
}
defineComponent( 'wpd-button', WpdButton );
