import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-grid';

const tick = (): Promise< void > => Promise.resolve();

describe( '<wpd-grid>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'columns + rows resolve to grid-template track lists', async () => {
		host.innerHTML = `<wpd-grid columns="4" rows="5"></wpd-grid>`;
		await tick();
		const grid = host.querySelector< HTMLElement >( 'wpd-grid' )!;
		expect( grid.style.getPropertyValue( '--wpd-grid-columns' ) ).toBe(
			'repeat(4, minmax(0, 1fr))',
		);
		expect( grid.style.getPropertyValue( '--wpd-grid-rows' ) ).toBe(
			'repeat(5, minmax(0, 1fr))',
		);
	} );

	test( 'gap + per-axis gaps both flow through', async () => {
		host.innerHTML = `<wpd-grid gap="12" column-gap="6" row-gap="18"></wpd-grid>`;
		await tick();
		const grid = host.querySelector< HTMLElement >( 'wpd-grid' )!;
		expect( grid.style.getPropertyValue( '--wpd-grid-gap' ) ).toBe( '12px' );
		expect( grid.style.getPropertyValue( '--wpd-grid-column-gap' ) ).toBe( '6px' );
		expect( grid.style.getPropertyValue( '--wpd-grid-row-gap' ) ).toBe( '18px' );
	} );
} );
