/**
 * Smoke test: right-click "Hide from dock" must remove the item from
 * the dock's effective list — without an F5. Pure unit test against
 * the visibility writer + applyDockPlacement.
 */

import { describe, expect, test } from 'vitest';
import {
	applyDockPlacement,
	resolvePlacement,
} from '../../src/settings/item-placement';

describe( 'item visibility — hide from dock', () => {
	test( 'plugin item with visibility=desktop is filtered from dock', () => {
		const dockItems = [
			{
				id: 'woocommerce',
				title: 'WooCommerce',
				icon: 'dashicons-cart',
				url: 'admin.php?page=wc-admin',
				badge: 0,
				submenu: [],
				isCore: false,
			},
		];
		const out = applyDockPlacement(
			dockItems,
			[],
			{
				itemVisibility: { woocommerce: 'desktop' },
				dockOrder: [],
			},
		);
		expect( out.find( ( i ) => i.id === 'woocommerce' ) ).toBeUndefined();
	} );

	test( 'plugin item with visibility=both stays on dock', () => {
		const dockItems = [
			{
				id: 'woocommerce',
				title: 'WooCommerce',
				icon: 'dashicons-cart',
				url: 'admin.php?page=wc-admin',
				badge: 0,
				submenu: [],
				isCore: false,
			},
		];
		const out = applyDockPlacement(
			dockItems,
			[],
			{
				itemVisibility: { woocommerce: 'both' },
				dockOrder: [],
			},
		);
		expect( out.find( ( i ) => i.id === 'woocommerce' ) ).toBeDefined();
	} );

	test( 'resolvePlacement returns override when present', () => {
		expect(
			resolvePlacement( 'woocommerce', 'dock', {
				woocommerce: 'desktop',
			} ),
		).toBe( 'desktop' );
	} );

	test( 'resolvePlacement falls back to nativeRail when no override', () => {
		expect( resolvePlacement( 'woocommerce', 'dock', {} ) ).toBe( 'dock' );
	} );
} );
