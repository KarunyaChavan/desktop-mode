/**
 * Vite configuration for the WP Desktop Mode plugin.
 *
 * Builds the shell's TypeScript entry into two IIFE bundles:
 *
 *   - `assets/js/desktop.js`      (development, unminified — loaded when SCRIPT_DEBUG is true)
 *   - `assets/js/desktop.min.js`  (production, esbuild-minified — loaded otherwise)
 *
 * Both bundles are produced by running `npm run build`, which invokes Vite
 * twice (once per mode). `npm run dev` watches and rebuilds the unminified
 * bundle only — iteration is fast, and WordPress picks it up when
 * SCRIPT_DEBUG is enabled in wp-config.php.
 *
 * @since 0.5.0
 */

import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig( ( { mode } ) => {
	const isProd = mode === 'production';

	return {
		build: {
			outDir: 'assets/js',
			// Both builds write into the same dir — don't let the second run
			// delete what the first produced.
			emptyOutDir: false,
			target: 'es2020',
			// esbuild minification is ~10x faster than terser with comparable
			// output for plain TS; no separate dep needed.
			minify: isProd ? 'esbuild' : false,
			sourcemap: false,
			lib: {
				entry: resolve( __dirname, 'src/desktop.ts' ),
				// IIFE wraps the module so it runs on script load without any
				// module-system glue. WordPress admin can't reliably import
				// <script type="module">, so we ship a self-contained bundle.
				formats: [ 'iife' ],
				// Exports from the entry land on window.wpDesktop — a no-op
				// today (no external consumers) but leaves the door open for
				// tests or devtools probing.
				name: 'wpDesktop',
				fileName: () => ( isProd ? 'desktop.min.js' : 'desktop.js' ),
			},
		},
	};
} );
