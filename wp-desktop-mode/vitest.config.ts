/**
 * Vitest configuration for the wp-desktop-mode TypeScript test suite.
 *
 * Mirrors the existing Vite build in key ways — same TypeScript
 * target, same module resolution — while swapping in a jsdom
 * environment so tests can exercise DOM-manipulating code (window,
 * registries that touch `document`, toast lifecycle).
 *
 * Tests live under `tests/vitest/` — parallel to `tests/phpunit/`.
 * They import the real modules from `src/` rather than mocking the
 * shell, so we're testing what actually ships.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig( {
	test: {
		environment: 'jsdom',
		globals: false,
		// Two include paths:
		// - `tests/vitest/` for cross-module integration / shell tests
		// - `src/**/*.test.ts` for component-local specs that live
		//   next to the code they test (one folder per component
		//   keeps styles + logic + tests together)
		include: [ 'tests/vitest/**/*.test.ts', 'src/**/*.test.ts' ],
		// A fresh module graph per test file keeps registry state
		// (hooks, wallpapers, modules) from leaking between
		// top-level describes in different files.
		isolate: true,
		// Short timeout — these are pure unit tests, nothing should
		// take longer than a few ms. Helps catch accidental awaits.
		testTimeout: 2000,
	},
} );
