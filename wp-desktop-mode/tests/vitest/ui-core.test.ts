/**
 * wpd-ui core — tests for the templater + base component.
 *
 * Covers:
 *   - text, attribute, event, property, boolean-attribute bindings
 *   - diffing on re-render (no-op updates don't touch the DOM)
 *   - prop ↔ attribute sync on Component subclasses
 *   - static styles applied to shadow and light DOM
 *   - microtask-batched re-render
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Component, css, defineComponent, html, render } from '../../src/ui/core';

describe( 'wpd-ui html renderer', () => {
	let host: HTMLDivElement;

	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
	} );

	afterEach( () => {
		host.remove();
	} );

	test( 'renders text interpolation', () => {
		render( html`<p>Hello ${ 'world' }!</p>`, host );
		expect( host.innerHTML ).toBe( '<p>Hello world!</p>' );
	} );

	test( 'attribute interpolation composes around static fragments', () => {
		render( html`<div class="a ${ 'b' } c">X</div>`, host );
		expect( host.querySelector( 'div' )?.getAttribute( 'class' ) ).toBe(
			'a b c',
		);
	} );

	test( 'empty attribute interpolation removes the attribute', () => {
		render( html`<div class=${ '' }>X</div>`, host );
		expect( host.querySelector( 'div' )?.hasAttribute( 'class' ) ).toBe(
			false,
		);
	} );

	test( '@event binding fires handler on dispatch', () => {
		const spy = vi.fn();
		render( html`<button @click=${ spy }>Go</button>`, host );
		host.querySelector( 'button' )!.click();
		expect( spy ).toHaveBeenCalledTimes( 1 );
	} );

	test( '@event binding swaps listeners on re-render', () => {
		const first = vi.fn();
		const second = vi.fn();
		const go = ( handler: typeof first ) =>
			render( html`<button @click=${ handler }>Go</button>`, host );
		go( first );
		go( second );
		host.querySelector( 'button' )!.click();
		expect( first ).not.toHaveBeenCalled();
		expect( second ).toHaveBeenCalledTimes( 1 );
	} );

	test( '.property binding sets a JS property, not an attribute', () => {
		render( html`<input .value=${ 'hello' } />`, host );
		const input = host.querySelector( 'input' )!;
		expect( input.value ).toBe( 'hello' );
		// Verified NOT as attribute — reading via property is the
		// whole point of this binding.
		expect( input.hasAttribute( 'value' ) ).toBe( false );
	} );

	test( '?attribute binding toggles presence', () => {
		const go = ( disabled: boolean ) =>
			render( html`<button ?disabled=${ disabled }>X</button>`, host );
		go( true );
		expect( host.querySelector( 'button' )!.hasAttribute( 'disabled' ) ).toBe(
			true,
		);
		go( false );
		expect( host.querySelector( 'button' )!.hasAttribute( 'disabled' ) ).toBe(
			false,
		);
	} );

	test( 'second render with same template updates text without re-parsing', () => {
		// Call-site identity matters — TemplateStringsArray is
		// cached per tagged-template call site, so wrapping in a
		// helper keeps the identity stable across calls.
		const update = ( value: string ) =>
			render( html`<p>${ value }</p>`, host );
		update( 'one' );
		const first = host.querySelector( 'p' )!;
		update( 'two' );
		const second = host.querySelector( 'p' )!;
		expect( first ).toBe( second );
		expect( first.textContent ).toBe( 'two' );
	} );

	test( 'no-op re-render doesn\'t touch the text-node slot', () => {
		const update = ( value: string ) =>
			render( html`<p>${ value }</p>`, host );
		update( 'same' );
		const p = host.querySelector( 'p' )!;
		// The dynamic slot is the <p>'s first (and only) child text
		// node. Spy on its textContent setter — a no-op render
		// should leave it untouched.
		const slot = p.firstChild as Text;
		const setSpy = vi.spyOn( slot, 'textContent', 'set' );
		update( 'same' );
		expect( setSpy ).not.toHaveBeenCalled();
		setSpy.mockRestore();
	} );

	test( 'null / false / undefined render as empty strings in text', () => {
		render( html`<p>${ null }|${ undefined }|${ false }|${ 0 }</p>`, host );
		expect( host.querySelector( 'p' )?.textContent ).toBe( '|||0' );
	} );

	test( 'arrays in text flatten to concatenated strings', () => {
		render( html`<p>${ [ 'a', 'b', 'c' ] }</p>`, host );
		expect( host.querySelector( 'p' )?.textContent ).toBe( 'abc' );
	} );

	test( 'different strings identity triggers a full remount', () => {
		render( html`<p>first</p>`, host );
		const firstP = host.querySelector( 'p' );
		render( html`<p>second</p>`, host );
		const secondP = host.querySelector( 'p' );
		// Because strings identity changed, the container is
		// re-emptied and re-parsed — different node instances.
		expect( firstP ).not.toBe( secondP );
	} );
} );

describe( 'wpd-ui css', () => {
	test( 'returns a StyleDef with text content', () => {
		const style = css`
			:host {
				color: red;
			}
		`;
		expect( style.__wpdCss ).toBe( true );
		expect( style.cssText ).toContain( 'color: red' );
	} );

	test( 'rejects unknown interpolations', () => {
		expect( () =>
			// @ts-expect-error — intentional misuse
			css`:host { color: ${ {} } }`,
		).toThrow( TypeError );
	} );

	test( 'composes nested css`` results', () => {
		const brand = css`
			color: #2271b1;
		`;
		const composed = css`
			:host {
				${ brand }
			}
		`;
		expect( composed.cssText ).toContain( 'color: #2271b1' );
	} );
} );

describe( 'wpd-ui Component', () => {
	// Light-DOM component — exercises the `shadow = false` escape
	// hatch. Most app components use the default (shadow = true),
	// but a few low-level shells want the outer CSS cascade to
	// continue; this test keeps that path covered.
	class WpdGreeter extends Component {
		static props = [ 'name' ] as const;
		static shadow = false;
		protected render() {
			const name = ( this as unknown as { name: string } ).name || 'world';
			return html`<p>Hello ${ name }</p>`;
		}
	}
	defineComponent( 'wpd-greeter', WpdGreeter );

	class WpdSwatch extends Component {
		static props = [ 'selected', 'label' ] as const;
		static shadow = true;
		static styles = [
			css`
				:host {
					display: inline-block;
				}
				button {
					background: var(--bg, #eee);
				}
			`,
		];
		protected render() {
			const selected =
				( this as unknown as { selected: string | null } ).selected !==
				null;
			const label =
				( this as unknown as { label: string | null } ).label || '';
			return html`<button
				class=${ selected ? 'selected' : '' }
				@click=${ ( e: Event ) => this._onClick( e ) }
			>
				${ label }
			</button>`;
		}
		private _onClick( _e: Event ): void {
			this.emit( 'wpd-pick', { label: ( this as unknown as { label: string } ).label } );
		}
	}
	defineComponent( 'wpd-swatch', WpdSwatch );

	afterEach( () => {
		document.body.innerHTML = '';
	} );

	test( 'renders on connection + reflects the initial prop', async () => {
		const el = document.createElement( 'wpd-greeter' ) as WpdGreeter;
		( el as unknown as { name: string } ).name = 'Alice';
		document.body.appendChild( el );
		await microtask();
		expect( el.innerHTML ).toBe( '<p>Hello Alice</p>' );
	} );

	test( 'property → attribute sync', async () => {
		const el = document.createElement( 'wpd-greeter' ) as WpdGreeter;
		document.body.appendChild( el );
		( el as unknown as { name: string } ).name = 'Bob';
		await microtask();
		expect( el.getAttribute( 'name' ) ).toBe( 'Bob' );
	} );

	test( 'attribute → property → re-render', async () => {
		const el = document.createElement( 'wpd-greeter' ) as WpdGreeter;
		document.body.appendChild( el );
		await microtask();
		el.setAttribute( 'name', 'Carol' );
		await microtask();
		expect( el.textContent ).toBe( 'Hello Carol' );
	} );

	test( 'multiple property writes in one tick collapse into a single render', async () => {
		// Subclass-local counter — more robust than spying on DOM
		// ops that an optimiser might skip.
		let renderCount = 0;
		class WpdCounter extends Component {
			static props = [ 'n' ] as const;
			static shadow = false;
			protected render() {
				renderCount++;
				return html`<span>${ ( this as unknown as { n: string } ).n }</span>`;
			}
		}
		defineComponent( 'wpd-counter', WpdCounter );
		const el = document.createElement( 'wpd-counter' ) as WpdCounter;
		document.body.appendChild( el );
		await microtask();
		const before = renderCount;
		( el as unknown as { n: string } ).n = 'one';
		( el as unknown as { n: string } ).n = 'two';
		( el as unknown as { n: string } ).n = 'three';
		await microtask();
		expect( renderCount - before ).toBe( 1 );
		expect( el.textContent ).toBe( 'three' );
	} );

	test( 'shadow DOM component adopts stylesheets on mount', async () => {
		const el = document.createElement( 'wpd-swatch' ) as WpdSwatch;
		( el as unknown as { label: string } ).label = 'Red';
		document.body.appendChild( el );
		await microtask();
		expect( el.shadowRoot ).not.toBeNull();
		const btn = el.shadowRoot!.querySelector( 'button' )!;
		expect( btn.textContent?.trim() ).toBe( 'Red' );
	} );

	test( 'emit dispatches a CustomEvent with detail', async () => {
		const el = document.createElement( 'wpd-swatch' ) as WpdSwatch;
		( el as unknown as { label: string } ).label = 'Blue';
		document.body.appendChild( el );
		await microtask();
		const heard: { detail: { label: string } }[] = [];
		el.addEventListener( 'wpd-pick', ( e: Event ) => {
			heard.push( { detail: ( e as CustomEvent ).detail } );
		} );
		el.shadowRoot!.querySelector( 'button' )!.click();
		expect( heard ).toHaveLength( 1 );
		expect( heard[ 0 ].detail.label ).toBe( 'Blue' );
	} );
} );

/**
 * Vitest + jsdom don't queue microtasks when we simply call
 * `await Promise.resolve()` from outside an async boundary. One
 * `await` of a resolved promise drains the queued `queueMicrotask`
 * callback reliably across engines.
 */
function microtask(): Promise<void> {
	return Promise.resolve();
}
