/**
 * `<wpd-section>` — titled panel used throughout OS Settings.
 *
 * Usage:
 *
 *   <wpd-section heading="Wallpaper" description="The backdrop …">
 *     <wpd-swatch-grid>…</wpd-swatch-grid>
 *   </wpd-section>
 *
 * The `<slot>` receives whatever the caller puts inside; heading +
 * description are attribute-driven so plain HTML calls can reach
 * them without JS scaffolding.
 */

import { Component, defineComponent, html } from '../../core';
import { styles } from './wpd-section.styles';

export class WpdSection extends Component {
	static props = [ 'heading', 'description' ] as const;
	static styles = [ styles ];

	protected render() {
		const heading = ( this as unknown as { heading: string | null } ).heading || '';
		const description =
			( this as unknown as { description: string | null } ).description || '';
		return html`
			<h3 class="wpd-section__heading">${ heading }</h3>
			<p class="wpd-section__description">${ description }</p>
			<slot></slot>
		`;
	}
}
defineComponent( 'wpd-section', WpdSection );
