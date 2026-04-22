import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-display';

const tick = (): Promise< void > => Promise.resolve();

describe( '<wpd-display>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'renders the value attribute into the <output>', async () => {
		host.innerHTML = `<wpd-display value="1,234.00"></wpd-display>`;
		await tick();
		const output = host
			.querySelector( 'wpd-display' )!
			.shadowRoot!.querySelector( 'output' )!;
		expect( output.textContent?.trim() ).toBe( '1,234.00' );
	} );

	test( 'auto-labels role + aria-live on first connect', async () => {
		host.innerHTML = `<wpd-display value="0"></wpd-display>`;
		await tick();
		const display = host.querySelector( 'wpd-display' )!;
		expect( display.getAttribute( 'role' ) ).toBe( 'status' );
		expect( display.getAttribute( 'aria-live' ) ).toBe( 'polite' );
	} );

	test( 'size + align flow through to custom properties', async () => {
		host.innerHTML = `<wpd-display value="42" size="xl" align="center"></wpd-display>`;
		await tick();
		const display = host.querySelector< HTMLElement >( 'wpd-display' )!;
		expect( display.style.getPropertyValue( '--wpd-display-size' ) ).toBe( '40px' );
		expect( display.style.getPropertyValue( '--wpd-display-align' ) ).toBe(
			'center',
		);
	} );
} );
