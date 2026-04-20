/**
 * `<wpd-empty-state>` — centered placeholder for "nothing here
 * yet" UI: icon + heading + description + optional CTA slot.
 * Every plugin eventually needs one (empty lists, missing
 * templates, feature-unavailable guards) and a canonical shape
 * keeps them visually consistent across the shell.
 *
 * Usage:
 *
 *   <wpd-empty-state
 *     icon="admin-plugins"
 *     heading="No plugins installed yet"
 *     description="Install a plugin to see it here."
 *   >
 *     <wpd-button slot="cta" variant="primary">Browse plugins</wpd-button>
 *   </wpd-empty-state>
 *
 * Attributes:
 *   - `icon`        — dashicons slug (with or without `dashicons-` prefix).
 *   - `heading`     — bold first line.
 *   - `description` — secondary text below the heading.
 *
 * Slots:
 *   - `cta`  — optional call-to-action row below the description.
 *   - default — any additional content.
 *
 * @since 0.10.0
 */

import { Component, defineComponent, html } from '../../core';
import '../wpd-icon/wpd-icon';
import { styles } from './wpd-empty-state.styles';

export class WpdEmptyState extends Component {
	static props = [ 'icon', 'heading', 'description' ] as const;
	static styles = [ styles ];

	protected render() {
		const icon = ( this as unknown as { icon: string | null } ).icon || '';
		const heading = ( this as unknown as { heading: string | null } ).heading || '';
		const description =
			( this as unknown as { description: string | null } ).description || '';

		return html`
			${ icon
		? html`<wpd-icon
						class="wpd-empty-state__icon"
						name=${ icon }
						size="28"
				  ></wpd-icon>`
		: null }
			<h3 class="wpd-empty-state__heading">${ heading }</h3>
			<p class="wpd-empty-state__description">${ description }</p>
			<div class="wpd-empty-state__cta">
				<slot name="cta"></slot>
			</div>
			<slot></slot>
		`;
	}
}
defineComponent( 'wpd-empty-state', WpdEmptyState );
