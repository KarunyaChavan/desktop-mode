import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-icon';

const tick = (): Promise< void > => Promise.resolve();

describe( '<wpd-icon>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'renders dashicons-<name> when given a bare slug', async () => {
		host.innerHTML = `<wpd-icon name="calculator"></wpd-icon>`;
		await tick();
		const icon = host.querySelector( 'wpd-icon' )!;
		const glyph = icon.shadowRoot!.querySelector( '.wpd-icon__glyph' )!;
		expect( glyph.className ).toContain( 'dashicons-calculator' );
	} );

	test( 'accepts the full dashicons-* class form without double-prefixing', async () => {
		host.innerHTML = `<wpd-icon name="dashicons-admin-post"></wpd-icon>`;
		await tick();
		const glyph = host
			.querySelector( 'wpd-icon' )!
			.shadowRoot!.querySelector( '.wpd-icon__glyph' )!;
		expect( glyph.className ).toContain( 'dashicons-admin-post' );
		expect( glyph.className ).not.toContain( 'dashicons-dashicons-' );
	} );

	test( 'writes size as a custom property when given', async () => {
		host.innerHTML = `<wpd-icon name="smiley" size="32"></wpd-icon>`;
		await tick();
		const icon = host.querySelector< HTMLElement >( 'wpd-icon' )!;
		expect( icon.style.getPropertyValue( '--wpd-icon-size' ) ).toBe( '32px' );
	} );
} );
