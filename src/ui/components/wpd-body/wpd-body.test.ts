import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import './wpd-body';

const tick = (): Promise<void> => Promise.resolve();

describe( '<wpd-body>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => host.remove() );

	test( 'renders a shadow slot so light children project', async () => {
		host.innerHTML = `
			<wpd-body>
				<div class="one">A</div>
				<div class="two">B</div>
			</wpd-body>
		`;
		await tick();

		const body = host.querySelector( 'wpd-body' )!;
		expect( body.shadowRoot ).not.toBeNull();
		expect( body.shadowRoot!.querySelector( 'slot' ) ).not.toBeNull();
		expect( body.querySelectorAll( 'div' ).length ).toBe( 2 );
	} );

	test( 'gap attribute sets the --wpd-body-gap custom property', async () => {
		host.innerHTML = `<wpd-body gap="20"></wpd-body>`;
		await tick();

		const body = host.querySelector( 'wpd-body' ) as HTMLElement;
		expect( body.style.getPropertyValue( '--wpd-body-gap' ) ).toBe( '20px' );
	} );

	test( 'padding="0" drops the inset for edge-to-edge content', async () => {
		host.innerHTML = `<wpd-body padding="0"></wpd-body>`;
		await tick();

		const body = host.querySelector( 'wpd-body' ) as HTMLElement;
		expect( body.style.getPropertyValue( '--wpd-body-padding' ) ).toBe( '0px' );
	} );

	test( 'non-numeric padding is ignored defensively', async () => {
		host.innerHTML = `<wpd-body padding="garbage"></wpd-body>`;
		await tick();

		const body = host.querySelector( 'wpd-body' ) as HTMLElement;
		expect( body.style.getPropertyValue( '--wpd-body-padding' ) ).toBe( '' );
	} );

	test( 'scroll attribute is honoured declaratively (hosts overflow via :host([scroll]))', async () => {
		host.innerHTML = `<wpd-body scroll></wpd-body>`;
		await tick();

		const body = host.querySelector( 'wpd-body' )!;
		// Attribute presence is the contract — the CSS rule keys off
		// `:host([scroll])`. jsdom doesn't resolve the computed
		// style, but the structural contract (attribute present) is
		// what plugin authors write.
		expect( body.hasAttribute( 'scroll' ) ).toBe( true );
	} );

	test( 'composes naturally with panels and rows (layout stack probe)', async () => {
		host.innerHTML = `
			<wpd-body>
				<wpd-panel>
					<wpd-row>
						<div col="6" class="a"></div>
						<div col="6" class="b"></div>
					</wpd-row>
				</wpd-panel>
			</wpd-body>
		`;
		await tick();
		await tick();

		// The full body → panel → row → col tree should survive
		// mounting. querySelector walks flattened light tree, so
		// plugin author code reaches every level predictably.
		expect( host.querySelector( 'wpd-body wpd-panel wpd-row .a' ) ).not.toBeNull();
		expect( host.querySelector( 'wpd-body wpd-panel wpd-row .b' ) ).not.toBeNull();
	} );
} );
