import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-cluster';

const tick = (): Promise< void > => Promise.resolve();

describe( '<wpd-cluster>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'writes gap, justify, align as custom properties', async () => {
		host.innerHTML = `
			<wpd-cluster gap="16" justify="end" align="start">
				<span>a</span><span>b</span>
			</wpd-cluster>
		`;
		await tick();
		const cluster = host.querySelector< HTMLElement >( 'wpd-cluster' )!;
		expect( cluster.style.getPropertyValue( '--wpd-cluster-gap' ) ).toBe( '16px' );
		expect( cluster.style.getPropertyValue( '--wpd-cluster-justify' ) ).toBe( 'end' );
		expect( cluster.style.getPropertyValue( '--wpd-cluster-align' ) ).toBe( 'start' );
	} );
} );
