import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-checkbox-label';

const tick = (): Promise<void> => Promise.resolve();

describe( '<wpd-checkbox-label>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'toggles `checked` + emits wpd-checkbox-change', async () => {
		host.innerHTML = `<wpd-checkbox-label label="Only HD"></wpd-checkbox-label>`;
		await tick();
		const el = host.querySelector( 'wpd-checkbox-label' )!;
		const input = el.shadowRoot!.querySelector( 'input' ) as HTMLInputElement;
		let heard: boolean | null = null;
		el.addEventListener( 'wpd-checkbox-change', ( e ) => {
			heard = ( e as CustomEvent ).detail.checked;
		} );
		input.checked = true;
		input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		expect( heard ).toBe( true );
		expect( el.hasAttribute( 'checked' ) ).toBe( true );
	} );
} );
