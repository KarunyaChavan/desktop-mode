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
