import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-range-field';

const tick = (): Promise<void> => Promise.resolve();

describe( '<wpd-range-field>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'emits wpd-range-change with a numeric value', async () => {
		host.innerHTML = `<wpd-range-field label="Angle" min="0" max="360" step="1" suffix="°" value="45"></wpd-range-field>`;
		await tick();
		const field = host.querySelector( 'wpd-range-field' )!;
		const input = field.shadowRoot!.querySelector(
			'input',
		) as HTMLInputElement;
		let heard: number | null = null;
		field.addEventListener( 'wpd-range-change', ( e ) => {
			heard = ( e as CustomEvent ).detail.value;
		} );
		input.value = '180';
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		expect( heard ).toBe( 180 );
	} );
} );
