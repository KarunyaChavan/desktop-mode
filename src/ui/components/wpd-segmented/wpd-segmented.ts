/**
 * `<wpd-segmented>` + `<wpd-segment>` — iOS-style segmented radio
 * group. Visually a pill-shaped bar of equal-width buttons; only
 * one is "on" at a time. Used in OS Settings for Dock size.
 *
 * The parent `<wpd-segmented>` owns the `value` prop. Whenever it
 * changes (via property, attribute, or a child segment clicked),
 * every `<wpd-segment>` child reflects selection state via
 * `aria-checked`. Clicking a segment emits `wpd-pick` with
 * `{ value }` on the group.
 */

import { Component, defineComponent, html } from '../../core';
import { segmentStyles, segmentedStyles } from './wpd-segmented.styles';

export class WpdSegment extends Component {
	static props = [ 'value' ] as const;
	static styles = [ segmentStyles ];

	protected render() {
		this.setAttribute( 'role', 'radio' );
		return html`
			<button type="button" @click=${ () => this._onPick() }>
				<slot></slot>
			</button>
		`;
	}

	private _onPick(): void {
		this.emit( 'wpd-segment-pick', {
			value: ( this as unknown as { value: string | null } ).value,
		} );
	}
}
defineComponent( 'wpd-segment', WpdSegment );

export class WpdSegmented extends Component {
	static props = [ 'value', 'label' ] as const;
	static styles = [ segmentedStyles ];

	connectedCallback(): void {
		super.connectedCallback();
		// Delegated pick handler — children bubble
		// `wpd-segment-pick` up to us, we update our own `value`
		// (which cascades back into re-rendering child aria-
		// checked), then re-emit as `wpd-pick` for the user.
		this.addEventListener( 'wpd-segment-pick', ( e: Event ) => {
			const detail = ( e as CustomEvent ).detail as { value: string };
			e.stopPropagation();
			( this as unknown as { value: string } ).value = detail.value;
			this.emit( 'wpd-pick', { value: detail.value } );
		} );
	}

	/**
	 * Declarative item-list setter. Replaces the existing
	 * `<wpd-segment>` children with a fresh set built from a
	 * `{ value, label }` array; preserves the current selection
	 * when the value still matches an entry, otherwise falls back
	 * to the first item.
	 *
	 * Collapses the pre-0.11 imperative dance (clear children,
	 * `createElement`, set `textContent`, `appendChild`, then
	 * `setAttribute('value', …)` on the group — order matters) to
	 * a single assignment:
	 *
	 * ```js
	 * segmented.items = [
	 *   { value: 'm',  label: 'm' },
	 *   { value: 'km', label: 'km' },
	 * ];
	 * ```
	 *
	 * @since 0.11.0
	 */
	set items( list: ReadonlyArray<{ value: string; label: string }> ) {
		const existing = this.querySelectorAll( ':scope > wpd-segment' );
		for ( const el of Array.from( existing ) ) {
			el.remove();
		}
		for ( const item of list ) {
			const seg = document.createElement( 'wpd-segment' );
			seg.setAttribute( 'value', item.value );
			seg.textContent = item.label;
			this.appendChild( seg );
		}
		const current =
			( this as unknown as { value: string | null } ).value;
		const stillValid =
			current !== null && list.some( ( i ) => i.value === current );
		if ( ! stillValid && list.length > 0 ) {
			( this as unknown as { value: string } ).value = list[ 0 ].value;
		} else {
			this.requestUpdate();
		}
	}

	protected render() {
		const label = ( this as unknown as { label: string | null } ).label || '';
		if ( label ) {
			this.setAttribute( 'aria-label', label );
		}
		this.setAttribute( 'role', 'radiogroup' );
		// Mirror the current `value` onto each child segment via
		// aria-checked. Children live in LIGHT DOM (caller places
		// them inside the tag), so we reach them via a simple
		// querySelectorAll. Deferred one microtask so the children
		// have upgraded before we read them.
		const current = ( this as unknown as { value: string | null } ).value;
		queueMicrotask( () => {
			const segs = this.querySelectorAll( 'wpd-segment' );
			for ( const seg of Array.from( segs ) ) {
				const v = seg.getAttribute( 'value' );
				seg.setAttribute(
					'aria-checked',
					v === current ? 'true' : 'false',
				);
			}
		} );
		return html`<slot></slot>`;
	}
}
defineComponent( 'wpd-segmented', WpdSegmented );
