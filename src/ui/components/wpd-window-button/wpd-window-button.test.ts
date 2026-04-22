import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-window-button';

const tick = (): Promise<void> => Promise.resolve();

describe( '<wpd-window-button>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'renders a button + SVG for built-in icons', async () => {
		host.innerHTML = `<wpd-window-button icon="minimize" aria-label="Minimize"></wpd-window-button>`;
		await tick();
		await tick();
		const el = host.querySelector( 'wpd-window-button' )!;
		const btn = el.shadowRoot!.querySelector( 'button' );
		expect( btn ).not.toBeNull();
		const svg = el.shadowRoot!.querySelector( 'svg' );
		expect( svg ).not.toBeNull();
		// Minimize icon is a horizontal line via <path>.
		expect( svg!.querySelector( 'path' ) ).not.toBeNull();
	} );

	test( 'unknown icon key renders an empty svg (slot fallback available)', async () => {
		host.innerHTML = `<wpd-window-button icon="nope">🎯</wpd-window-button>`;
		await tick();
		await tick();
		const el = host.querySelector( 'wpd-window-button' )!;
		const svg = el.shadowRoot!.querySelector( 'svg' );
		expect( svg!.innerHTML ).toBe( '' );
		// Slotted content stays in light DOM.
		expect( el.textContent?.trim() ).toBe( '🎯' );
	} );

	test( 'click bubbles through the host element', async () => {
		host.innerHTML = `<wpd-window-button icon="close"></wpd-window-button>`;
		await tick();
		const el = host.querySelector( 'wpd-window-button' )!;
		let fired = false;
		el.addEventListener( 'click', () => {
			fired = true;
		} );
		el.shadowRoot!.querySelector( 'button' )!.click();
		expect( fired ).toBe( true );
	} );

	test( 'switching the icon attribute repaints the svg', async () => {
		host.innerHTML = `<wpd-window-button icon="minimize"></wpd-window-button>`;
		await tick();
		await tick();
		const el = host.querySelector( 'wpd-window-button' )!;
		const svg = el.shadowRoot!.querySelector( 'svg' )!;
		const before = svg.innerHTML;
		el.setAttribute( 'icon', 'close' );
		await tick();
		await tick();
		const after = svg.innerHTML;
		expect( after ).not.toBe( before );
		expect( after.length ).toBeGreaterThan( 0 );
	} );
} );
