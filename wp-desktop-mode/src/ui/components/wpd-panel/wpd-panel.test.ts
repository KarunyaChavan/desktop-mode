import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-panel';

const tick = (): Promise< void > => Promise.resolve();

describe( '<wpd-panel>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'custom padding + gap flow through to the host', async () => {
		host.innerHTML = `<wpd-panel padding="24" gap="6"></wpd-panel>`;
		await tick();
		const panel = host.querySelector< HTMLElement >( 'wpd-panel' )!;
		expect( panel.style.getPropertyValue( '--wpd-panel-padding' ) ).toBe( '24px' );
		expect( panel.style.getPropertyValue( '--wpd-panel-gap' ) ).toBe( '6px' );
	} );

	test( 'without attributes, host has no inline properties (CSS defaults win)', async () => {
		host.innerHTML = `<wpd-panel></wpd-panel>`;
		await tick();
		const panel = host.querySelector< HTMLElement >( 'wpd-panel' )!;
		expect( panel.style.getPropertyValue( '--wpd-panel-padding' ) ).toBe( '' );
		expect( panel.style.getPropertyValue( '--wpd-panel-gap' ) ).toBe( '' );
	} );
} );
