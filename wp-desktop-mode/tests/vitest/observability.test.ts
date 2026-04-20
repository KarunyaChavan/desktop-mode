/**
 * Observability additions — tests for the four hook additions + the
 * widget ctx.storage + ensureMounted helper:
 *
 *   - `ctx.storage` namespaced localStorage wrapper.
 *   - `WidgetLayer.ensureMounted( id )` idempotent public entry.
 *   - `HOOKS.IFRAME_ERROR` fired when the bridge relays
 *     `wp-desktop-iframe-error`.
 *   - `HOOKS.IFRAME_NETWORK_COMPLETED` fired when the bridge relays
 *     `wp-desktop-iframe-network`.
 *   - `HOOKS.SHELL_ERROR` fired alongside the widget / wallpaper mount
 *     failure paths.
 *   - `MonitorEntry` filter round-trip — plugins can mutate / drop
 *     entries via `wp-desktop.monitor.entry`.
 *
 * Exercises real classes (`WidgetLayer`, `handleWindowMessage`,
 * `WindowManager`) against jsdom + the hook-bus stub.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createWidgetStorage } from '../../src/widgets/storage';
import { HOOKS, applyFilters } from '../../src/hooks';
import { handleWindowMessage } from '../../src/window/iframe-bridge';
import type { Window as DesktopWindow } from '../../src/window';
import type { MonitorEntry } from '../../src/types';
import {
	clearHooksStub,
	installHooksStub,
	recordActions,
	type FakeWpHooks,
} from './helpers/hooks-stub';

describe( 'createWidgetStorage', () => {
	beforeEach( () => {
		installHooksStub();
		localStorage.clear();
	} );
	afterEach( () => {
		clearHooksStub();
		localStorage.clear();
	} );

	test( 'round-trips JSON-serializable values under a namespaced key', () => {
		const storage = createWidgetStorage( 'jorvy/quote' );
		storage.set( 'count', 7 );
		storage.set( 'last', { quote: 'I am Iron Man', ts: 1 } );

		expect( storage.get< number >( 'count' ) ).toBe( 7 );
		expect( storage.get< { quote: string; ts: number } >( 'last' ) ).toEqual( {
			quote: 'I am Iron Man',
			ts: 1,
		} );

		// Keys must be namespaced so a sibling widget can't read them
		// through a coincidentally-matching name.
		expect( localStorage.getItem( 'wp-desktop.widget.jorvy/quote.count' ) ).toBe( '7' );
		expect( localStorage.getItem( 'count' ) ).toBeNull();
	} );

	test( 'get returns null for missing / malformed values', () => {
		const storage = createWidgetStorage( 'x' );
		expect( storage.get( 'unknown' ) ).toBeNull();

		// Raw write outside the wrapper simulates a malformed entry;
		// get should swallow the parse error and return null.
		localStorage.setItem( 'wp-desktop.widget.x.bad', '{not json' );
		expect( storage.get( 'bad' ) ).toBeNull();
	} );

	test( 'clear removes only this widget\'s keys', () => {
		const a = createWidgetStorage( 'a' );
		const b = createWidgetStorage( 'b' );
		a.set( 'k', 1 );
		b.set( 'k', 2 );
		localStorage.setItem( 'some-other-key', 'untouched' );

		a.clear();

		expect( a.get( 'k' ) ).toBeNull();
		expect( b.get( 'k' ) ).toBe( 2 );
		expect( localStorage.getItem( 'some-other-key' ) ).toBe( 'untouched' );
	} );

	test( 'two widgets with overlapping keys do not collide', () => {
		const a = createWidgetStorage( 'a' );
		const b = createWidgetStorage( 'b' );
		a.set( 'layout', 'compact' );
		b.set( 'layout', 'wide' );
		expect( a.get( 'layout' ) ).toBe( 'compact' );
		expect( b.get( 'layout' ) ).toBe( 'wide' );
	} );
} );

/**
 * Build a minimal `Window` stand-in for `handleWindowMessage`. The
 * handler only reads `win.id` and `win.iframe.contentWindow`; we use
 * the same `contentWindow` object as the message event's `source` so
 * the origin/source filter passes.
 */
function makeFakeWindow( id: string ): {
	win: DesktopWindow;
	iframeWindow: WindowProxy;
} {
	const iframe = document.createElement( 'iframe' );
	document.body.appendChild( iframe );
	const contentWindow = ( iframe.contentWindow ?? window ) as WindowProxy;
	const win = {
		id,
		iframe,
		config: { id },
		element: document.createElement( 'div' ),
		onFocusRequest: null,
	} as unknown as DesktopWindow;
	return { win, iframeWindow: contentWindow };
}

describe( 'iframe bridge — IFRAME_ERROR routing', () => {
	let hooks: FakeWpHooks;

	beforeEach( () => {
		hooks = installHooksStub();
	} );
	afterEach( () => {
		clearHooksStub();
		document.body.innerHTML = '';
	} );

	test( 'routes wp-desktop-iframe-error message to HOOKS.IFRAME_ERROR', () => {
		const { win, iframeWindow } = makeFakeWindow( 'posts' );
		const log = recordActions( hooks, [ HOOKS.IFRAME_ERROR ] );

		const event = new MessageEvent( 'message', {
			data: {
				type: 'wp-desktop-iframe-error',
				kind: 'error',
				message: 'Uncaught TypeError: foo',
				filename: 'https://site/wp-admin/edit.php',
				lineno: 17,
				colno: 3,
				stack: 'at foo (x.js:1:1)',
			},
			origin: window.location.origin,
			source: iframeWindow,
		} );
		handleWindowMessage( win, event );

		expect( log ).toHaveLength( 1 );
		const payload = log[ 0 ].args[ 0 ] as {
			windowId: string;
			kind: string;
			message: string;
			stack: string | null;
		};
		expect( payload.windowId ).toBe( 'posts' );
		expect( payload.kind ).toBe( 'error' );
		expect( payload.message ).toBe( 'Uncaught TypeError: foo' );
		expect( payload.stack ).toBe( 'at foo (x.js:1:1)' );
	} );

	test( 'unhandledrejection kind is preserved; unknown kinds default to "error"', () => {
		const { win, iframeWindow } = makeFakeWindow( 'w' );
		const log = recordActions( hooks, [ HOOKS.IFRAME_ERROR ] );

		handleWindowMessage( win, new MessageEvent( 'message', {
			data: {
				type: 'wp-desktop-iframe-error',
				kind: 'unhandledrejection',
				message: 'boom',
			},
			origin: window.location.origin,
			source: iframeWindow,
		} ) );

		handleWindowMessage( win, new MessageEvent( 'message', {
			data: {
				type: 'wp-desktop-iframe-error',
				kind: 'wat',
				message: 'also boom',
			},
			origin: window.location.origin,
			source: iframeWindow,
		} ) );

		expect(
			( log[ 0 ].args[ 0 ] as { kind: string } ).kind,
		).toBe( 'unhandledrejection' );
		expect(
			( log[ 1 ].args[ 0 ] as { kind: string } ).kind,
		).toBe( 'error' );
	} );

	test( 'origin mismatch drops the message silently', () => {
		const { win, iframeWindow } = makeFakeWindow( 'w' );
		const log = recordActions( hooks, [ HOOKS.IFRAME_ERROR ] );

		handleWindowMessage( win, new MessageEvent( 'message', {
			data: {
				type: 'wp-desktop-iframe-error',
				kind: 'error',
				message: 'x',
			},
			origin: 'https://evil.example',
			source: iframeWindow,
		} ) );

		expect( log ).toHaveLength( 0 );
	} );
} );

describe( 'iframe bridge — IFRAME_NETWORK_COMPLETED routing', () => {
	let hooks: FakeWpHooks;

	beforeEach( () => {
		hooks = installHooksStub();
	} );
	afterEach( () => {
		clearHooksStub();
		document.body.innerHTML = '';
	} );

	test( 'routes wp-desktop-iframe-network message with status + duration', () => {
		const { win, iframeWindow } = makeFakeWindow( 'edit' );
		const log = recordActions( hooks, [ HOOKS.IFRAME_NETWORK_COMPLETED ] );

		handleWindowMessage( win, new MessageEvent( 'message', {
			data: {
				type: 'wp-desktop-iframe-network',
				method: 'POST',
				url: '/wp-admin/admin-ajax.php',
				status: 500,
				duration: 42,
				failed: true,
			},
			origin: window.location.origin,
			source: iframeWindow,
		} ) );

		expect( log ).toHaveLength( 1 );
		const payload = log[ 0 ].args[ 0 ] as {
			windowId: string;
			method: string;
			url: string;
			status: number;
			duration: number;
			failed: boolean;
		};
		expect( payload.windowId ).toBe( 'edit' );
		expect( payload.method ).toBe( 'POST' );
		expect( payload.url ).toBe( '/wp-admin/admin-ajax.php' );
		expect( payload.status ).toBe( 500 );
		expect( payload.failed ).toBe( true );
	} );

	test( 'network failures (status 0) relay with failed: true', () => {
		const { win, iframeWindow } = makeFakeWindow( 'w' );
		const log = recordActions( hooks, [ HOOKS.IFRAME_NETWORK_COMPLETED ] );

		handleWindowMessage( win, new MessageEvent( 'message', {
			data: {
				type: 'wp-desktop-iframe-network',
				method: 'GET',
				url: '/wp-json/wp/v2/posts',
				status: 0,
				duration: 1000,
				failed: true,
			},
			origin: window.location.origin,
			source: iframeWindow,
		} ) );

		const payload = log[ 0 ].args[ 0 ] as { status: number; failed: boolean };
		expect( payload.status ).toBe( 0 );
		expect( payload.failed ).toBe( true );
	} );
} );

describe( 'MonitorEntry + wp-desktop.monitor.entry filter', () => {
	let hooks: FakeWpHooks;

	beforeEach( () => {
		hooks = installHooksStub();
	} );
	afterEach( () => {
		clearHooksStub();
	} );

	test( 'filter can mutate the message + add extra fields', () => {
		hooks.addFilter(
			HOOKS.MONITOR_ENTRY,
			'test/augment',
			( entry: unknown ) => {
				const e = entry as MonitorEntry;
				return {
					...e,
					message: `[tagged] ${ e.message }`,
					extra: { ...( e.extra || {} ), tagged: true },
				};
			},
		);

		const seed: MonitorEntry = {
			ts: 1000,
			type: 'error',
			message: 'Gutenberg save failed',
		};
		const result = applyFilters(
			HOOKS.MONITOR_ENTRY,
			seed,
		) as MonitorEntry;

		expect( result.message ).toBe( '[tagged] Gutenberg save failed' );
		expect( result.extra?.tagged ).toBe( true );
	} );

	test( 'filter can suppress an entry by returning null', () => {
		hooks.addFilter(
			HOOKS.MONITOR_ENTRY,
			'test/drop',
			() => null,
		);

		const seed: MonitorEntry = { ts: 0, type: 'log', message: 'noisy' };
		const result = applyFilters( HOOKS.MONITOR_ENTRY, seed );
		expect( result ).toBeNull();
	} );
} );

describe( 'SHELL_ERROR action fires alongside mount failures', () => {
	let hooks: FakeWpHooks;

	beforeEach( () => {
		hooks = installHooksStub();
		// Silence the console.error that accompanies a mount failure
		// so the test output stays tidy.
		vi.spyOn( console, 'error' ).mockImplementation( () => undefined );
	} );
	afterEach( () => {
		clearHooksStub();
		vi.restoreAllMocks();
	} );

	test( 'widget mount throw fires widget.mount-failed AND shell.error', async () => {
		const { WidgetLayer } = await import( '../../src/widgets/layer' );
		const { register, unregister } = await import( '../../src/widgets/registry' );
		unregister( 'boom' );
		unregister( 'ok' );
		register( {
			id: 'boom',
			label: 'Boom',
			description: 'Throws on mount',
			icon: 'dashicons-warning',
			mount: () => {
				throw new Error( 'intentional' );
			},
		} );

		const log = recordActions( hooks, [
			HOOKS.WIDGET_MOUNT_FAILED,
			HOOKS.SHELL_ERROR,
		] );

		const host = document.createElement( 'div' );
		host.id = 'wp-desktop-widgets';
		document.body.appendChild( host );
		const layer = new WidgetLayer( host, '' );
		layer.ensureMounted( 'boom' );

		expect( log.map( ( l ) => l.name ) ).toContain( HOOKS.WIDGET_MOUNT_FAILED );
		expect( log.map( ( l ) => l.name ) ).toContain( HOOKS.SHELL_ERROR );

		const shellErr = log.find( ( l ) => l.name === HOOKS.SHELL_ERROR );
		const p = shellErr!.args[ 0 ] as { scope: string; id: string; error: Error };
		expect( p.scope ).toBe( 'widget-mount' );
		expect( p.id ).toBe( 'boom' );
		expect( p.error ).toBeInstanceOf( Error );
		expect( p.error.message ).toBe( 'intentional' );

		host.remove();
		unregister( 'boom' );
	} );
} );

describe( 'WidgetLayer.ensureMounted', () => {
	beforeEach( () => {
		installHooksStub();
		localStorage.clear();
	} );
	afterEach( () => {
		clearHooksStub();
		localStorage.clear();
		document.body.innerHTML = '';
	} );

	test( 'returns false for an unregistered id', async () => {
		const { WidgetLayer } = await import( '../../src/widgets/layer' );
		const host = document.createElement( 'div' );
		host.id = 'wp-desktop-widgets';
		document.body.appendChild( host );
		const layer = new WidgetLayer( host, '' );
		expect( layer.ensureMounted( 'really-not-a-widget-id-xyz' ) ).toBe( false );
	} );

	test( 'adds the widget when not already enabled; idempotent when already on', async () => {
		const { WidgetLayer } = await import( '../../src/widgets/layer' );
		const { register, unregister } = await import( '../../src/widgets/registry' );
		unregister( 'boom' );
		unregister( 'ok' );
		register( {
			id: 'ok',
			label: 'OK',
			description: 'noop',
			icon: 'dashicons-yes',
			mount: () => () => undefined,
		} );

		const host = document.createElement( 'div' );
		host.id = 'wp-desktop-widgets';
		document.body.appendChild( host );
		const layer = new WidgetLayer( host, '' );

		expect( layer.getEnabledIds() ).not.toContain( 'ok' );
		expect( layer.ensureMounted( 'ok' ) ).toBe( true );
		expect( layer.getEnabledIds() ).toContain( 'ok' );

		// Second call — already enabled, should still return true,
		// not duplicate the entry.
		expect( layer.ensureMounted( 'ok' ) ).toBe( true );
		const count = layer.getEnabledIds().filter( ( id ) => id === 'ok' ).length;
		expect( count ).toBe( 1 );

		unregister( 'ok' );
	} );
} );
