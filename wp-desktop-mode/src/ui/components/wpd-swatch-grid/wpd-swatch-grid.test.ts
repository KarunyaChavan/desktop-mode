import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-swatch-grid';

const tick = (): Promise<void> => Promise.resolve();

describe( '<wpd-swatch-grid>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'applies radiogroup role + aria-label + custom column count', async () => {
		host.innerHTML = `
			<wpd-swatch-grid label="Accent" columns="6">
				<span class="tile">a</span>
			</wpd-swatch-grid>
		`;
		await tick();
		const grid = host.querySelector( 'wpd-swatch-grid' ) as HTMLElement;
		expect( grid.getAttribute( 'role' ) ).toBe( 'radiogroup' );
		expect( grid.getAttribute( 'aria-label' ) ).toBe( 'Accent' );
		expect(
			grid.style.getPropertyValue( '--wpd-swatch-grid-cols' ),
		).toBe( '6' );
	} );
} );
