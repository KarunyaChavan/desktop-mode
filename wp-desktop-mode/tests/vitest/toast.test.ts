/**
 * Unit tests for `src/toast.ts`. Uses jsdom's fake timers so the
 * dismiss timeout is deterministic without actually waiting.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { showToast } from '../../src/toast';

describe( 'toast.ts', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		vi.useFakeTimers();
	} );

	afterEach( () => {
		vi.useRealTimers();
		document.body.innerHTML = '';
	} );

	test( 'showToast creates a container + toast element', () => {
		showToast( { message: 'hello' } );
		const container = document.querySelector( '.wp-desktop-toast-container' );
		expect( container ).not.toBeNull();
		const toast = container?.querySelector( '.wp-desktop-toast' );
		expect( toast ).not.toBeNull();
		expect( toast?.textContent?.includes( 'hello' ) ).toBe( true );
	} );

	test( 'showToast reuses an existing container for stacking', () => {
		showToast( { message: 'one' } );
		showToast( { message: 'two' } );
		const containers = document.querySelectorAll(
			'.wp-desktop-toast-container',
		);
		expect( containers ).toHaveLength( 1 );
		const toasts = containers[ 0 ].querySelectorAll( '.wp-desktop-toast' );
		expect( toasts ).toHaveLength( 2 );
	} );

	test( 'auto-dismisses after the default duration', () => {
		showToast( { message: 'bye' } );
		const container = document.querySelector( '.wp-desktop-toast-container' )!;
		expect( container.querySelectorAll( '.wp-desktop-toast' ) ).toHaveLength( 1 );

		// Default duration (4000 ms) kicks the fade; fade takes 200 ms
		// to complete and remove the element.
		vi.advanceTimersByTime( 4000 );
		vi.advanceTimersByTime( 200 );
		expect( container.querySelectorAll( '.wp-desktop-toast' ) ).toHaveLength( 0 );
	} );

	test( 'custom duration is honored', () => {
		showToast( { message: 'quick', duration: 500 } );
		const container = document.querySelector( '.wp-desktop-toast-container' )!;
		vi.advanceTimersByTime( 400 );
		expect( container.querySelectorAll( '.wp-desktop-toast' ) ).toHaveLength( 1 );
		// Advance past (500 duration + 200 fade) to guarantee removal.
		vi.advanceTimersByTime( 400 );
		expect( container.querySelectorAll( '.wp-desktop-toast' ) ).toHaveLength( 0 );
	} );

	test( 'action button renders and fires the callback on click', () => {
		let clicked = false;
		showToast( {
			message: 'retry?',
			action: {
				label: 'Retry',
				onClick: () => {
					clicked = true;
				},
			},
		} );
		const button = document.querySelector< HTMLButtonElement >(
			'.wp-desktop-toast__action',
		);
		expect( button ).not.toBeNull();
		expect( button?.textContent ).toBe( 'Retry' );

		button?.click();
		expect( clicked ).toBe( true );

		// After the action callback fires, the toast starts fading.
		vi.advanceTimersByTime( 200 );
		expect(
			document.querySelectorAll( '.wp-desktop-toast' ),
		).toHaveLength( 0 );
	} );

	test( 'the returned dismiss function removes the toast early', () => {
		const dismiss = showToast( { message: 'ephemeral', duration: 10000 } );
		const container = document.querySelector( '.wp-desktop-toast-container' )!;
		expect( container.querySelectorAll( '.wp-desktop-toast' ) ).toHaveLength( 1 );
		dismiss();
		vi.advanceTimersByTime( 250 );
		expect( container.querySelectorAll( '.wp-desktop-toast' ) ).toHaveLength( 0 );
	} );

	test( 'calling dismiss twice is a no-op (idempotent)', () => {
		const dismiss = showToast( { message: 'once', duration: 10000 } );
		expect( () => {
			dismiss();
			dismiss();
		} ).not.toThrow();
	} );
} );
