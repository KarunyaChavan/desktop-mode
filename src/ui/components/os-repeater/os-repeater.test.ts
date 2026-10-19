/**
 * `<os-repeater>` — the contract is that it reports intent and never
 * mutates its own `keys`.
 *
 * The consumer owns the data the rows are a view of, so a component
 * that removed a row on its own would be right exactly until the
 * removal failed to persist. Every test here checks both halves: the
 * event carries the already-applied list, and `keys` is unchanged
 * until the consumer assigns it.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import './os-repeater';
import type { OsRepeater } from './os-repeater';

const tick = (): Promise< void > => Promise.resolve();

describe( '<os-repeater>', () => {
	let host: HTMLElement;
	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );
	afterEach( () => {
		host.remove();
	} );

	async function mount( attrs = '', innerHTML = '' ): Promise< OsRepeater > {
		host.innerHTML = `<os-repeater ${ attrs }>${ innerHTML }</os-repeater>`;
		const el = host.querySelector( 'os-repeater' ) as OsRepeater;
		el.keys = [ 'a', 'b', 'c' ];
		await tick();
		return el;
	}

	function rows( el: OsRepeater ): HTMLElement[] {
		return Array.from(
			el.shadowRoot!.querySelectorAll< HTMLElement >( '.os-repeater__row' ),
		);
	}

	test( 'renders one keyed slot per row, in order', async () => {
		const el = await mount();
		const slots = rows( el ).map(
			( row ) => row.querySelector( 'slot' )!.getAttribute( 'name' ),
		);
		expect( slots ).toEqual( [ 'row-a', 'row-b', 'row-c' ] );
	} );

	test( 'remove reports the list with the row already dropped, and does not apply it', async () => {
		const el = await mount();
		const seen = vi.fn();
		el.addEventListener( 'os-repeater-remove', ( e ) =>
			seen( ( e as CustomEvent ).detail ),
		);

		(
			rows( el )[ 1 ].querySelector( '.os-repeater__remove' ) as HTMLButtonElement
		).click();

		expect( seen ).toHaveBeenCalledWith( {
			key: 'b',
			index: 1,
			keys: [ 'a', 'c' ],
		} );
		// The component is a view. Until the consumer assigns, nothing
		// has happened.
		expect( el.keys ).toEqual( [ 'a', 'b', 'c' ] );
	} );

	test( 'move reports the reordered list', async () => {
		const el = await mount( 'reorderable' );
		const seen = vi.fn();
		el.addEventListener( 'os-repeater-move', ( e ) =>
			seen( ( e as CustomEvent ).detail ),
		);

		const handles = rows( el )[ 2 ].querySelectorAll< HTMLButtonElement >(
			'.os-repeater__handle',
		);
		handles[ 0 ].click(); // up

		expect( seen ).toHaveBeenCalledWith( {
			key: 'c',
			from: 2,
			to: 1,
			keys: [ 'a', 'c', 'b' ],
		} );
		expect( el.keys ).toEqual( [ 'a', 'b', 'c' ] );
	} );

	test( 'the end rows cannot move past the ends', async () => {
		const el = await mount( 'reorderable' );
		const first = rows( el )[ 0 ].querySelectorAll< HTMLButtonElement >(
			'.os-repeater__handle',
		);
		const last = rows( el )[ 2 ].querySelectorAll< HTMLButtonElement >(
			'.os-repeater__handle',
		);
		expect( first[ 0 ].disabled ).toBe( true );
		expect( first[ 1 ].disabled ).toBe( false );
		expect( last[ 1 ].disabled ).toBe( true );
	} );

	test( 'alt+arrow moves the row the focus is inside', async () => {
		const el = await mount( 'reorderable' );
		el.innerHTML = `<div slot="row-b"><input /></div>`;
		await tick();
		const seen = vi.fn();
		el.addEventListener( 'os-repeater-move', ( e ) =>
			seen( ( e as CustomEvent ).detail ),
		);

		el.querySelector( 'input' )!.dispatchEvent(
			new KeyboardEvent( 'keydown', {
				key: 'ArrowUp',
				altKey: true,
				bubbles: true,
				composed: true,
			} ),
		);

		expect( seen ).toHaveBeenCalledWith(
			expect.objectContaining( { key: 'b', from: 1, to: 0 } ),
		);
	} );

	test( 'a bare arrow key is left to the caret', async () => {
		const el = await mount( 'reorderable' );
		el.innerHTML = `<div slot="row-b"><input /></div>`;
		await tick();
		const seen = vi.fn();
		el.addEventListener( 'os-repeater-move', seen );

		el.querySelector( 'input' )!.dispatchEvent(
			new KeyboardEvent( 'keydown', {
				key: 'ArrowUp',
				bubbles: true,
				composed: true,
			} ),
		);

		expect( seen ).not.toHaveBeenCalled();
	} );

	test( 'min disables remove at the floor', async () => {
		const el = await mount( 'min="3"' );
		const remove = rows( el )[ 0 ].querySelector< HTMLButtonElement >(
			'.os-repeater__remove',
		)!;
		expect( remove.disabled ).toBe( true );
	} );

	test( 'max disables add at the ceiling', async () => {
		const el = await mount( 'max="3"' );
		const add = el.shadowRoot!.querySelector( 'os-button' )!;
		expect( add.hasAttribute( 'disabled' ) ).toBe( true );
	} );

	test( 'empty text shows only when there are no rows', async () => {
		const el = await mount( 'empty-text="No choices yet"' );
		expect( el.shadowRoot!.querySelector( '.os-repeater__empty' ) ).toBeNull();

		el.keys = [];
		await tick();
		const empty = el.shadowRoot!.querySelector( '.os-repeater__empty' )!;
		expect( empty.textContent ).toContain( 'No choices yet' );
	} );

	test( 'disabled silences every control', async () => {
		const el = await mount( 'reorderable disabled' );
		const seen = vi.fn();
		el.addEventListener( 'os-repeater-remove', seen );
		el.addEventListener( 'os-repeater-add', seen );

		(
			rows( el )[ 0 ].querySelector( '.os-repeater__remove' ) as HTMLButtonElement
		).click();
		( el.shadowRoot!.querySelector( 'os-button' ) as HTMLElement ).click();

		expect( seen ).not.toHaveBeenCalled();
	} );

	test( 'add-label and row-label reach the DOM with unique positional names', async () => {
		const el = await mount( 'add-label="Add choice" row-label="choice"' );
		expect( el.shadowRoot!.querySelector( 'os-button' )!.textContent ).toContain(
			'Add choice',
		);
		expect(
			rows( el ).map(
				( r ) =>
					r.querySelector( '.os-repeater__remove' )!.getAttribute( 'aria-label' ),
			),
		).toEqual( [
			'Remove choice 1 of 3',
			'Remove choice 2 of 3',
			'Remove choice 3 of 3',
		] );
	} );

	test( 'reorder handles carry unique positional accessible names', async () => {
		const el = await mount( 'row-label="choice" reorderable' );
		const handles = rows( el ).map( ( r ) =>
			Array.from( r.querySelectorAll( '.os-repeater__handle' ) ).map( ( h ) =>
				h.getAttribute( 'aria-label' ),
			),
		);
		expect( handles ).toEqual( [
			[ 'Move choice 1 up', 'Move choice 1 down' ],
			[ 'Move choice 2 up', 'Move choice 2 down' ],
			[ 'Move choice 3 up', 'Move choice 3 down' ],
		] );
	} );

	test( 'positional labels update when keys change', async () => {
		const el = await mount( 'row-label="choice"' );
		el.keys = [ 'a', 'c' ];
		await tick();
		expect(
			rows( el ).map(
				( r ) =>
					r.querySelector( '.os-repeater__remove' )!.getAttribute( 'aria-label' ),
			),
		).toEqual( [ 'Remove choice 1 of 2', 'Remove choice 2 of 2' ] );
	} );

	test( 'row-label-from labels row controls from a named child field', async () => {
		const el = await mount(
			'row-label="choice" row-label-from="title" reorderable',
			`
				<div slot="row-a"><input name="title" value="First Choice" /></div>
				<div slot="row-b"><input name="title" value="Second Choice" /></div>
				<div slot="row-c"><input name="title" value="" /></div>
			`,
		);

		const removeLabels = rows( el ).map(
			( r ) =>
				r.querySelector( '.os-repeater__remove' )!.getAttribute( 'aria-label' ),
		);
		expect( removeLabels ).toEqual( [
			'Remove First Choice (1 of 3)',
			'Remove Second Choice (2 of 3)',
			'Remove choice 3 of 3', // falls back to position when empty
		] );

		const moveLabels = rows( el ).map( ( r ) =>
			Array.from( r.querySelectorAll( '.os-repeater__handle' ) ).map( ( h ) =>
				h.getAttribute( 'aria-label' ),
			),
		);
		expect( moveLabels[ 0 ] ).toEqual( [
			'Move First Choice (1 of 3) up',
			'Move First Choice (1 of 3) down',
		] );
	} );

	test( 'data-label on row slot labels row controls', async () => {
		const el = await mount(
			'row-label="choice"',
			`
				<div slot="row-a" data-label="Drafting"></div>
				<div slot="row-b"></div>
				<div slot="row-c"></div>
			`,
		);

		expect(
			rows( el )[ 0 ]
				.querySelector( '.os-repeater__remove' )!
				.getAttribute( 'aria-label' ),
		).toBe( 'Remove Drafting (1 of 3)' );
		expect(
			rows( el )[ 1 ]
				.querySelector( '.os-repeater__remove' )!
				.getAttribute( 'aria-label' ),
		).toBe( 'Remove choice 2 of 3' );
	} );

	test( 'typing into a row-label-from input updates accessible labels live', async () => {
		const el = await mount(
			'row-label="choice" row-label-from="title"',
			'<div slot="row-a"><input name="title" value="Draft" /></div>',
		);

		expect(
			rows( el )[ 0 ]
				.querySelector( '.os-repeater__remove' )!
				.getAttribute( 'aria-label' ),
		).toBe( 'Remove Draft (1 of 3)' );

		const input = el.querySelector( 'input' )!;
		input.value = 'Published';
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		await tick();

		expect(
			rows( el )[ 0 ]
				.querySelector( '.os-repeater__remove' )!
				.getAttribute( 'aria-label' ),
		).toBe( 'Remove Published (1 of 3)' );
	} );

	test( 'handles WordPress bracketed field names and numeric keys without throwing', async () => {
		host.innerHTML = `
			<os-repeater row-label="field" row-label-from="items[0][title]">
				<div slot="row-0"><input name="items[0][title]" value="Option Zero" /></div>
				<div slot="row-1:special"><input name="items[0][title]" value="Option One" /></div>
			</os-repeater>
		`;
		const el = host.querySelector( 'os-repeater' ) as OsRepeater;
		el.keys = [ '0', '1:special' ];
		await tick();

		const removeButtons = rows( el ).map( ( r ) =>
			r.querySelector( '.os-repeater__remove' )!.getAttribute( 'aria-label' ),
		);
		expect( removeButtons ).toEqual( [
			'Remove Option Zero (1 of 2)',
			'Remove Option One (2 of 2)',
		] );
	} );

	test( 'scoped lookup ignores slotted rows in nested repeaters', async () => {
		host.innerHTML = `
			<os-repeater id="outer" row-label="outer" row-label-from="title">
				<div slot="row-a">
					<input name="title" value="Outer A" />
					<os-repeater id="inner" row-label="inner" row-label-from="title">
						<div slot="row-b"><input name="title" value="Inner B" /></div>
					</os-repeater>
				</div>
			</os-repeater>
		`;
		const outer = host.querySelector( '#outer' ) as OsRepeater;
		const inner = host.querySelector( '#inner' ) as OsRepeater;
		outer.keys = [ 'a' ];
		inner.keys = [ 'b' ];
		await tick();

		const outerRemove = rows( outer )[ 0 ]
			.querySelector( '.os-repeater__remove' )!
			.getAttribute( 'aria-label' );
		const innerRemove = rows( inner )[ 0 ]
			.querySelector( '.os-repeater__remove' )!
			.getAttribute( 'aria-label' );

		expect( outerRemove ).toBe( 'Remove Outer A (1 of 1)' );
		expect( innerRemove ).toBe( 'Remove Inner B (1 of 1)' );
	} );

	test( 'collapses excess whitespace in extracted labels', async () => {
		const el = await mount(
			'row-label="choice"',
			'<div slot="row-a" data-label="   Draft   Title   \n\t "></div>',
		);

		expect(
			rows( el )[ 0 ]
				.querySelector( '.os-repeater__remove' )!
				.getAttribute( 'aria-label' ),
		).toBe( 'Remove Draft Title (1 of 3)' );
	} );

	test( 'renames the row buttons when a row label changes from code', async () => {
		const el = await mount( 'row-label="choice"', '<div slot="row-a" data-label="Draft"></div>' );
		const removeLabel = (): string | null =>
			rows( el )[ 0 ]
				.querySelector( '.os-repeater__remove' )!
				.getAttribute( 'aria-label' );
		expect( removeLabel() ).toBe( 'Remove Draft (1 of 3)' );

		// Neither write fires `input`, and `keys` does not change.
		el.querySelector( '[slot="row-a"]' )!.setAttribute( 'data-label', 'Published' );
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
		expect( removeLabel() ).toBe( 'Remove Published (1 of 3)' );

		el.querySelector( '[slot="row-a"]' )!.remove();
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
		expect( removeLabel() ).toBe( 'Remove choice 1 of 3' );
	} );
} );
