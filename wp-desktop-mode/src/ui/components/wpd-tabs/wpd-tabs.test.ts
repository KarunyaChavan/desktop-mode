import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-tabs';

const tick = (): Promise<void> => Promise.resolve();

describe( '<wpd-tabs> + <wpd-tab>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'clicking a tab bubbles wpd-tab-change + updates aria-selected', async () => {
		host.innerHTML = `
			<wpd-tabs value="library" label="Source">
				<wpd-tab value="upload">Upload</wpd-tab>
				<wpd-tab value="library">Library</wpd-tab>
			</wpd-tabs>
		`;
		await tick();
		await tick();
		const strip = host.querySelector( 'wpd-tabs' )!;
		const upload = host.querySelector( 'wpd-tab[value="upload"]' )!;
		const library = host.querySelector( 'wpd-tab[value="library"]' )!;

		expect( library.getAttribute( 'aria-selected' ) ).toBe( 'true' );
		expect( upload.getAttribute( 'aria-selected' ) ).toBe( 'false' );

		let heard: string | null = null;
		strip.addEventListener( 'wpd-tab-change', ( e ) => {
			heard = ( e as CustomEvent ).detail.value;
		} );
		upload.shadowRoot!.querySelector( 'button' )!.click();
		await tick();
		await tick();

		expect( heard ).toBe( 'upload' );
		expect( strip.getAttribute( 'value' ) ).toBe( 'upload' );
		expect( upload.getAttribute( 'aria-selected' ) ).toBe( 'true' );
		expect( library.getAttribute( 'aria-selected' ) ).toBe( 'false' );
	} );

	test( 'each tab gets role=tab + the strip gets role=tablist + aria-label', async () => {
		host.innerHTML = `
			<wpd-tabs value="a" label="Source">
				<wpd-tab value="a">A</wpd-tab>
			</wpd-tabs>
		`;
		await tick();
		const strip = host.querySelector( 'wpd-tabs' )!;
		expect( strip.getAttribute( 'role' ) ).toBe( 'tablist' );
		expect( strip.getAttribute( 'aria-label' ) ).toBe( 'Source' );
		expect(
			host.querySelector( 'wpd-tab' )!.getAttribute( 'role' ),
		).toBe( 'tab' );
	} );
} );
