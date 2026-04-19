/**
 * Widget registry + layer behaviour.
 *
 * Covers:
 *   - registry validation, late-wins on id conflict, filter passthrough
 *   - layer first-run seeds the clock default
 *   - add / remove idempotency + persistence
 *   - mount lifecycle hook firings (mounting → mounted)
 *   - async mount rejection fires mount-failed (not mounted)
 *   - rapid add-then-remove discards the stale mount
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	clearHooksStub,
	installHooksStub,
	recordActions,
	type FakeWpHooks,
} from './helpers/hooks-stub';

const WIDGET_HOOKS = [
	'wp-desktop.widget.mounting',
	'wp-desktop.widget.mounted',
	'wp-desktop.widget.unmounting',
	'wp-desktop.widget.mount-failed',
	'wp-desktop.widget.added',
	'wp-desktop.widget.removed',
] as const;

describe( 'widgets/registry', () => {
	let hooks: FakeWpHooks;

	beforeEach( async () => {
		hooks = installHooksStub();
		vi.resetModules();
		// Clear any persisted state between files.
		try {
			window.localStorage.removeItem( 'wp-desktop-widgets' );
		} catch {
			/* jsdom always supports localStorage */
		}
	} );

	afterEach( () => {
		clearHooksStub();
	} );

	test( 'register stores a valid def; all() returns it', async () => {
		const registry = await import( '../../src/widgets/registry' );
		registry.register( {
			id: 'a',
			label: 'A',
			description: 'alpha',
			icon: 'dashicons-star-filled',
			mount: () => () => undefined,
		} );
		const list = registry.all();
		expect( list.map( ( w ) => w.id ) ).toEqual( [ 'a' ] );
	} );

	test( 'register drops invalid defs with a console warning', async () => {
		const registry = await import( '../../src/widgets/registry' );
		const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
		registry.register( { id: '', label: 'x', description: '', icon: 'i', mount: () => () => undefined } as unknown as never );
		expect( warn ).toHaveBeenCalled();
		warn.mockRestore();
	} );

	test( 'register late-wins on id conflict', async () => {
		const registry = await import( '../../src/widgets/registry' );
		const first = {
			id: 'x',
			label: 'First',
			description: '',
			icon: 'dashicons-clock',
			mount: () => () => undefined,
		};
		const second = { ...first, label: 'Second' };
		registry.register( first );
		registry.register( second );
		expect( registry.get( 'x' )?.label ).toBe( 'Second' );
	} );

	test( 'plugins can filter the registry via wp-desktop.widgets', async () => {
		const registry = await import( '../../src/widgets/registry' );
		registry.register( {
			id: 'keep',
			label: 'Keep',
			description: '',
			icon: 'dashicons-star-filled',
			mount: () => () => undefined,
		} );
		registry.register( {
			id: 'drop',
			label: 'Drop',
			description: '',
			icon: 'dashicons-trash',
			mount: () => () => undefined,
		} );
		hooks.addFilter(
			'wp-desktop.widgets',
			'test/filter',
			( list: unknown ) =>
				( list as Array<{ id: string }> ).filter(
					( w ) => w.id !== 'drop',
				),
		);
		expect( registry.all().map( ( w ) => w.id ) ).toEqual( [ 'keep' ] );
	} );
} );

describe( 'widgets/layer', () => {
	let hooks: FakeWpHooks;
	let host: HTMLElement;

	beforeEach( async () => {
		hooks = installHooksStub();
		vi.resetModules();
		try {
			window.localStorage.removeItem( 'wp-desktop-widgets' );
		} catch {
			/* jsdom */
		}
		host = document.createElement( 'aside' );
		document.body.appendChild( host );
	} );

	afterEach( () => {
		host.remove();
		clearHooksStub();
	} );

	test( 'hydrate on first run seeds the clock default if registered', async () => {
		const registry = await import( '../../src/widgets/registry' );
		const { WidgetLayer } = await import( '../../src/widgets/layer' );
		registry.register( {
			id: 'clock',
			label: 'Clock',
			description: '',
			icon: 'dashicons-clock',
			mount: ( body ) => {
				body.textContent = 'tick';
				return () => undefined;
			},
		} );
		const log = recordActions( hooks, WIDGET_HOOKS );

		const layer = new WidgetLayer( host, 'http://example.test/plugin' );
		layer.hydrate();

		expect( layer.getEnabledIds() ).toEqual( [ 'clock' ] );
		const names = log.map( ( e ) => e.name );
		expect( names ).toContain( 'wp-desktop.widget.mounting' );
		expect( names ).toContain( 'wp-desktop.widget.mounted' );
		expect( host.querySelector( '.wp-desktop-widgets__card' ) ).not.toBeNull();
		expect( host.textContent ).toContain( 'tick' );
	} );

	test( 'hydrate preserves an empty saved list (user removed default)', async () => {
		window.localStorage.setItem( 'wp-desktop-widgets', '[]' );
		const registry = await import( '../../src/widgets/registry' );
		const { WidgetLayer } = await import( '../../src/widgets/layer' );
		registry.register( {
			id: 'clock',
			label: 'Clock',
			description: '',
			icon: 'dashicons-clock',
			mount: () => () => undefined,
		} );

		const layer = new WidgetLayer( host, '' );
		layer.hydrate();

		expect( layer.getEnabledIds() ).toEqual( [] );
		expect( host.querySelector( '.wp-desktop-widgets__card' ) ).toBeNull();
	} );

	test( 'add mounts + fires added + persists', async () => {
		const registry = await import( '../../src/widgets/registry' );
		const { WidgetLayer } = await import( '../../src/widgets/layer' );
		registry.register( {
			id: 'stats',
			label: 'Stats',
			description: '',
			icon: 'dashicons-chart-bar',
			mount: ( body ) => {
				body.textContent = 'stats';
				return () => undefined;
			},
		} );
		const layer = new WidgetLayer( host, '' );
		layer.hydrate();
		layer.remove( 'clock' ); // ensure clean
		const log = recordActions( hooks, WIDGET_HOOKS );

		layer.add( 'stats' );

		expect( layer.getEnabledIds() ).toContain( 'stats' );
		expect(
			JSON.parse( window.localStorage.getItem( 'wp-desktop-widgets' )! ),
		).toContain( 'stats' );
		const names = log.map( ( e ) => e.name );
		expect( names ).toContain( 'wp-desktop.widget.added' );
		expect( names ).toContain( 'wp-desktop.widget.mounting' );
		expect( names ).toContain( 'wp-desktop.widget.mounted' );
	} );

	test( 'add is idempotent — calling twice fires only one added + mounts once', async () => {
		const registry = await import( '../../src/widgets/registry' );
		const { WidgetLayer } = await import( '../../src/widgets/layer' );
		registry.register( {
			id: 'x',
			label: 'X',
			description: '',
			icon: 'dashicons-star-filled',
			mount: () => () => undefined,
		} );
		const layer = new WidgetLayer( host, '' );
		layer.hydrate();
		layer.remove( 'clock' );
		const log = recordActions( hooks, WIDGET_HOOKS );

		layer.add( 'x' );
		layer.add( 'x' );

		const addedCount = log.filter(
			( e ) => e.name === 'wp-desktop.widget.added',
		).length;
		const mountedCount = log.filter(
			( e ) => e.name === 'wp-desktop.widget.mounted',
		).length;
		expect( addedCount ).toBe( 1 );
		expect( mountedCount ).toBe( 1 );
	} );

	test( 'remove tears down + fires removed + persists', async () => {
		const registry = await import( '../../src/widgets/registry' );
		const { WidgetLayer } = await import( '../../src/widgets/layer' );
		let teardownFired = false;
		registry.register( {
			id: 'x',
			label: 'X',
			description: '',
			icon: 'dashicons-star-filled',
			mount: () => () => {
				teardownFired = true;
			},
		} );
		const layer = new WidgetLayer( host, '' );
		layer.hydrate();
		layer.remove( 'clock' );
		layer.add( 'x' );
		const log = recordActions( hooks, WIDGET_HOOKS );

		layer.remove( 'x' );

		expect( teardownFired ).toBe( true );
		expect( layer.getEnabledIds() ).not.toContain( 'x' );
		const names = log.map( ( e ) => e.name );
		expect( names ).toContain( 'wp-desktop.widget.unmounting' );
		expect( names ).toContain( 'wp-desktop.widget.removed' );
	} );

	test( 'async mount rejection fires mount-failed (not mounted)', async () => {
		const registry = await import( '../../src/widgets/registry' );
		const { WidgetLayer } = await import( '../../src/widgets/layer' );
		const err = new Error( 'no network' );
		registry.register( {
			id: 'bad',
			label: 'Bad',
			description: '',
			icon: 'dashicons-warning',
			mount: () => Promise.reject( err ),
		} );
		// Silence the error log — mount-failed intentionally logs.
		const errSpy = vi
			.spyOn( console, 'error' )
			.mockImplementation( () => {} );
		const layer = new WidgetLayer( host, '' );
		layer.hydrate();
		layer.remove( 'clock' );
		const log = recordActions( hooks, WIDGET_HOOKS );

		layer.add( 'bad' );
		await Promise.resolve();
		await Promise.resolve();

		const names = log.map( ( e ) => e.name );
		expect( names ).toContain( 'wp-desktop.widget.mount-failed' );
		expect( names ).not.toContain( 'wp-desktop.widget.mounted' );
		errSpy.mockRestore();
	} );

	test( 'add-then-remove before async mount resolves discards the stale mount', async () => {
		const registry = await import( '../../src/widgets/registry' );
		const { WidgetLayer } = await import( '../../src/widgets/layer' );
		let teardownCalled = false;
		let resolveMount: ( ( cb: () => void ) => void ) | null = null;
		registry.register( {
			id: 'slow',
			label: 'Slow',
			description: '',
			icon: 'dashicons-star-filled',
			mount: () =>
				new Promise( ( res ) => {
					resolveMount = res;
				} ),
		} );
		const layer = new WidgetLayer( host, '' );
		layer.hydrate();
		layer.remove( 'clock' );
		layer.add( 'slow' );
		layer.remove( 'slow' );
		const log = recordActions( hooks, WIDGET_HOOKS );

		// Resolve the stale mount. Its teardown MUST run (so the
		// widget has a chance to tidy up) but no 'mounted' hook
		// should fire for the discarded record.
		resolveMount!( () => {
			teardownCalled = true;
		} );
		await Promise.resolve();
		await Promise.resolve();

		expect( teardownCalled ).toBe( true );
		expect(
			log.some( ( e ) => e.name === 'wp-desktop.widget.mounted' ),
		).toBe( false );
	} );
} );
