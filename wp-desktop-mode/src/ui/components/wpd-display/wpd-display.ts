/**
 * `<wpd-display>` — single-line numeric / text readout. The
 * right-aligned, `tabular-nums`, auto-ellipsized readout every
 * calculator, stopwatch, ticker, counter, or meter reinvents.
 *
 * Usage:
 *
 *   <wpd-display value="1,234.00"></wpd-display>
 *
 *   // or with slotted content
 *   <wpd-display aria-label="Current total">
 *     <span slot="label">Total</span>
 *     <strong>$ 12.50</strong>
 *   </wpd-display>
 *
 * Attributes:
 *   - `value`  — convenience: renders this string as the readout.
 *                Ignored when the caller slots their own content.
 *   - `size`   — `sm` | `md` | `lg` | `xl`. Default `lg` — calculator-
 *                sized. Affects the host's font-size custom property.
 *   - `align`  — `start` | `end` | `center`. Default `end` (right-aligned
 *                like a calculator or ledger).
 *
 * The host is a **live region** (`aria-live="polite"`) so screen
 * readers announce value changes without yanking focus.
 *
 * @since 0.10.0
 */

import { Component, defineComponent, html } from '../../core';
import { styles } from './wpd-display.styles';

const SIZE_PX: Record< string, string > = {
	sm: '16px',
	md: '20px',
	lg: '28px',
	xl: '40px',
};

export class WpdDisplay extends Component {
	static props = [ 'value', 'size', 'align' ] as const;
	static styles = [ styles ];

	connectedCallback(): void {
		super.connectedCallback?.();
		// Live-region semantics so screen readers announce
		// value changes without yanking focus.
		if ( ! this.hasAttribute( 'aria-live' ) ) {
			this.setAttribute( 'aria-live', 'polite' );
		}
		if ( ! this.hasAttribute( 'role' ) ) {
			this.setAttribute( 'role', 'status' );
		}
	}

	protected render() {
		const value = ( this as unknown as { value: string | null } ).value;
		const size = ( this as unknown as { size: string | null } ).size || 'lg';
		const align =
			( this as unknown as { align: string | null } ).align || 'end';

		this.style.setProperty( '--wpd-display-size', SIZE_PX[ size ] || SIZE_PX.lg );
		this.style.setProperty( '--wpd-display-align', align );

		// Value attribute wins over slotted content when present —
		// common case for numeric readouts that drive purely via
		// setAttribute. The slot still renders for callers that need
		// richer markup (a currency prefix span, a unit suffix, etc.).
		return html`
			<output part="output" class="wpd-display__output">
				${ value !== null && value !== undefined
		? value
		: html`<slot></slot>` }
			</output>
		`;
	}
}
defineComponent( 'wpd-display', WpdDisplay );
