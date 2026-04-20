import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-color-field';

const tick = (): Promise<void> => Promise.resolve();

describe( '<wpd-color-field>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'emits wpd-color-change with the new value on input', async () => {
		host.innerHTML = `<wpd-color-field label="From" value="#2271b1"></wpd-color-field>`;
		await tick();
		const field = host.querySelector( 'wpd-color-field' )!;
		const input = field.shadowRoot!.querySelector(
			'input',
		) as HTMLInputElement;
		let heard: string | null = null;
		field.addEventListener( 'wpd-color-change', ( e ) => {
			heard = ( e as CustomEvent ).detail.value;
		} );
		input.value = '#ff0000';
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		expect( heard ).toBe( '#ff0000' );
	} );
} );
