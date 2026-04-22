/**
 * `<wpd-menu>` + `<wpd-menu-item>` — popover menu used in the
 * window title bar's ⋯ dropdown. Presentation-only: the consumer
 * (Window) owns the open/close state via the `hidden` attribute
 * and its own outside-click dismissal — the component doesn't
 * try to manage that itself, because the trigger button is OUTSIDE
 * the menu and every consumer wires it differently.
 *
 * Menu-items take one of three looks:
 *
 *   - Plain           — just a label.
 *   - With icon       — `icon="dashicons-…"` dashicon class on the
 *                       left (used by "Open another X").
 *   - Checkbox        — `role="menuitemcheckbox" ?checked=${…}`
 *                       renders a 16 px check indicator (used by
 *                       "Open on startup").
 *
 * Click on an item emits `wpd-menu-item-click` bubbling, with the
 * item's `value` attribute in `detail.value`.
 */

import { Component, defineComponent, html } from '../../core';
import { menuItemStyles, menuStyles } from './wpd-menu.styles';

export class WpdMenu extends Component {
	static styles = [ menuStyles ];

	connectedCallback(): void {
		super.connectedCallback();
		this.setAttribute( 'role', 'menu' );
	}

	protected render() {
		return html`<slot></slot>`;
	}
}
defineComponent( 'wpd-menu', WpdMenu );

export class WpdMenuItem extends Component {
	static props = [ 'icon', 'value', 'checked' ] as const;
	static styles = [ menuItemStyles ];

	connectedCallback(): void {
		super.connectedCallback();
		// Default to `menuitem` role; consumer can override to
		// `menuitemcheckbox` via the role attribute.
		if ( ! this.hasAttribute( 'role' ) ) {
			this.setAttribute( 'role', 'menuitem' );
		}
	}

	protected render() {
		const icon = ( this as unknown as { icon: string | null } ).icon || '';
		const isCheckbox = this.getAttribute( 'role' ) === 'menuitemcheckbox';
		const checked =
			( this as unknown as { checked: string | null } ).checked !== null;
		// Sync aria-checked for checkbox variants — screen readers
		// need the live value, not just the `checked` attribute.
		if ( isCheckbox ) {
			this.setAttribute( 'aria-checked', checked ? 'true' : 'false' );
		}
		return html`
			<button type="button" @click=${ ( e: Event ) => this._onPick( e ) }>
				<span
					class="wpd-menu-item__check"
					?hidden=${ ! isCheckbox }
				></span>
				<span
					class="wpd-menu-item__icon dashicons ${ icon }"
					aria-hidden="true"
					?hidden=${ isCheckbox || ! icon }
				></span>
				<span class="wpd-menu-item__label">
					<slot></slot>
				</span>
			</button>
		`;
	}

	private _onPick( e: Event ): void {
		e.preventDefault();
		this.emit( 'wpd-menu-item-click', {
			value: ( this as unknown as { value: string | null } ).value,
		} );
	}
}
defineComponent( 'wpd-menu-item', WpdMenuItem );
