import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-checkbox';

const tick = (): Promise<void> => Promise.resolve();

describe( '<wpd-checkbox>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'unchecked by default; toggling emits wpd-checkbox-change + sets checked attribute', async () => {
		host.innerHTML = `<wpd-checkbox label="HD only" value="hd"></wpd-checkbox>`;
		await tick();

		const el = host.querySelector( 'wpd-checkbox' )!;
		const input = el.shadowRoot!.querySelector( 'input' ) as HTMLInputElement;
		expect( input.checked ).toBe( false );
		expect( el.hasAttribute( 'checked' ) ).toBe( false );

		let heard: { checked: boolean; value: string | null } | null = null;
		el.addEventListener( 'wpd-checkbox-change', ( e ) => {
			heard = ( e as CustomEvent ).detail;
		} );

		input.checked = true;
		input.dispatchEvent( new Event( 'change', { bubbles: true } ) );

		expect( heard ).toEqual( { checked: true, value: 'hd' } );
		expect( el.hasAttribute( 'checked' ) ).toBe( true );
	} );

	test( '`checked` attribute reflects into the native input', async () => {
		host.innerHTML = `<wpd-checkbox checked label="Default on"></wpd-checkbox>`;
		await tick();

		const input = host
			.querySelector( 'wpd-checkbox' )!
			.shadowRoot!.querySelector( 'input' ) as HTMLInputElement;
		expect( input.checked ).toBe( true );
	} );

	test( '`disabled` attribute propagates to the native input', async () => {
		host.innerHTML = `<wpd-checkbox disabled label="Can't touch this"></wpd-checkbox>`;
		await tick();

		const input = host
			.querySelector( 'wpd-checkbox' )!
			.shadowRoot!.querySelector( 'input' ) as HTMLInputElement;
		expect( input.disabled ).toBe( true );
	} );

	test( 'emits value=null when no value attribute is set', async () => {
		host.innerHTML = `<wpd-checkbox></wpd-checkbox>`;
		await tick();

		const el = host.querySelector( 'wpd-checkbox' )!;
		const input = el.shadowRoot!.querySelector( 'input' ) as HTMLInputElement;
		let heard: { checked: boolean; value: string | null } | null = null;
		el.addEventListener( 'wpd-checkbox-change', ( e ) => {
			heard = ( e as CustomEvent ).detail;
		} );

		input.checked = true;
		input.dispatchEvent( new Event( 'change', { bubbles: true } ) );

		expect( heard ).toEqual( { checked: true, value: null } );
	} );

	test( 'unchecking removes the checked attribute', async () => {
		host.innerHTML = `<wpd-checkbox checked></wpd-checkbox>`;
		await tick();

		const el = host.querySelector( 'wpd-checkbox' )!;
		const input = el.shadowRoot!.querySelector( 'input' ) as HTMLInputElement;

		input.checked = false;
		input.dispatchEvent( new Event( 'change', { bubbles: true } ) );

		expect( el.hasAttribute( 'checked' ) ).toBe( false );
	} );
} );
