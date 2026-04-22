/**
 * `<wpd-stack>` — smoke test. Verifies the gap + align attributes
 * flow through to the host's inline custom properties and that
 * slotted children reach light DOM.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-stack';

const tick = (): Promise< void > => Promise.resolve();

describe( '<wpd-stack>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'writes `gap` + `align` as custom properties on the host', async () => {
		host.innerHTML = `
			<wpd-stack gap="24" align="center">
				<span class="child">a</span>
				<span class="child">b</span>
			</wpd-stack>
		`;
		await tick();
		const stack = host.querySelector< HTMLElement >( 'wpd-stack' )!;
		expect( stack.style.getPropertyValue( '--wpd-stack-gap' ) ).toBe( '24px' );
		expect( stack.style.getPropertyValue( '--wpd-stack-align' ) ).toBe( 'center' );
		expect( stack.querySelectorAll( '.child' ) ).toHaveLength( 2 );
	} );

	test( 'non-numeric gap is ignored (falls back to CSS default)', async () => {
		host.innerHTML = `<wpd-stack gap="huge"></wpd-stack>`;
		await tick();
		const stack = host.querySelector< HTMLElement >( 'wpd-stack' )!;
		expect( stack.style.getPropertyValue( '--wpd-stack-gap' ) ).toBe( '' );
	} );
} );
