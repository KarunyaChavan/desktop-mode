/**
 * `<wpd-button>` — thin wrapper around `<button>` with consistent
 * variant styling + a slot for the label.
 *
 * Variants (Stable, will not be renamed within a major release):
 *
 *   - `primary`   — accent-colored, attention-grabbing action. One
 *                   per surface.
 *   - `secondary` — neutral filled control. Quiet action in a row
 *                   of mostly-primary controls (Save / Cancel;
 *                   AC / ± / % on a calculator).
 *   - `danger`    — destructive action. Red outline → red fill on hover.
 *   - `ghost`     — default. Transparent background, 1 px border.
 *   - `link`      — underline only, no chrome.
 *
 * `fill-cell` boolean attribute makes the host fill its parent
 * cell (flex / grid item), growing width AND the inner button
 * height. Intended for grid-based surfaces like a calculator
 * keypad where every key should tile flush.
 *
 * CSS custom-property surface (documented in
 * `docs/components-reference.md`):
 *
 *   --wpd-button-bg              — background color
 *   --wpd-button-fg              — text color
 *   --wpd-button-border          — shorthand for the border
 *   --wpd-button-border-radius   — corner radius (default 6px)
 *   --wpd-button-padding         — shorthand for padding (default "6px 12px")
 *   --wpd-button-min-height      — minimum height when `fill-cell` is set
 *
 * Shadow parts (author hook — use with `::part(button)`):
 *
 *   button — the underlying `<button>` element.
 */

import { Component, defineComponent, html } from '../../core';
import { styles } from './wpd-button.styles';

/**
 * Stable string enum of recognised variants. Exported so
 * plugin-side TS can narrow.
 */
export type WpdButtonVariant =
	| 'primary'
	| 'secondary'
	| 'ghost'
	| 'danger'
	| 'link';

export class WpdButton extends Component {
	static props = [ 'variant', 'disabled', 'type', 'busy', 'fill-cell' ] as const;
	static styles = [ styles ];

	protected render() {
		const disabled =
			( this as unknown as { disabled: string | null } ).disabled !== null;
		const type = ( this as unknown as { type: string | null } ).type || 'button';
		return html`
			<button part="button" type=${ type } ?disabled=${ disabled }>
				<slot></slot>
			</button>
		`;
	}
}
defineComponent( 'wpd-button', WpdButton );
