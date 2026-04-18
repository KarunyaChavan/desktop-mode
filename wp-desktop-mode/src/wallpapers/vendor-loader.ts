/**
 * Desktop Mode — Lazy vendor-script loader.
 *
 * Canvas wallpapers routinely want heavy dependencies (PixiJS, Three,
 * phaser) that would balloon the main bundle if eagerly imported.
 * Vite's library-mode IIFE output flattens dynamic `import()` into
 * the main chunk, so we can't rely on code splitting — instead we
 * inject a `<script>` tag the first time a wallpaper needs it and
 * resolve a shared promise to subsequent callers.
 *
 * Exported on `wp.desktop.loadVendorScript` so third-party canvas
 * plugins can reuse the same memoization and not race each other on
 * first activation.
 *
 * @since 0.6.0
 */

/**
 * Map of url → in-flight or resolved load promise. Keeps concurrent
 * requests for the same script deduplicated.
 */
const pending = new Map<string, Promise<void>>();

/**
 * Fetch a remote script by injecting a `<script>` tag into the
 * document. Resolves when the script fires `load`, rejects on
 * `error`. Calls for the same URL after resolution return immediately.
 *
 * Only same-origin and plugin-hosted URLs should be passed. The
 * shell does no CSP / SRI plumbing here; plugins that need cross-
 * origin integrity should ship their own loader.
 */
export function loadVendorScript( url: string ): Promise<void> {
	const existing = pending.get( url );
	if ( existing ) {
		return existing;
	}

	const promise = new Promise<void>( ( resolve, reject ) => {
		// If the URL is already in the DOM (e.g. another plugin
		// enqueued the same file), wait on its load state rather than
		// double-adding.
		const selector = `script[data-wp-desktop-vendor="${ cssEscape( url ) }"]`;
		const preexisting = document.querySelector<HTMLScriptElement>( selector );
		if ( preexisting ) {
			if ( preexisting.dataset.loaded === '1' ) {
				resolve();
				return;
			}
			preexisting.addEventListener( 'load', () => resolve(), { once: true } );
			preexisting.addEventListener(
				'error',
				() => reject( new Error( `Failed to load ${ url }` ) ),
				{ once: true }
			);
			return;
		}

		const script = document.createElement( 'script' );
		script.src = url;
		script.async = true;
		script.dataset.wpDesktopVendor = url;
		script.addEventListener(
			'load',
			() => {
				script.dataset.loaded = '1';
				resolve();
			},
			{ once: true }
		);
		script.addEventListener(
			'error',
			() => {
				// Don't cache failures — a flaky connection should let
				// the next attempt try again.
				pending.delete( url );
				script.remove();
				reject( new Error( `Failed to load ${ url }` ) );
			},
			{ once: true }
		);
		document.head.appendChild( script );
	} );

	pending.set( url, promise );
	return promise;
}

/**
 * Narrow helper for escaping strings into a CSS attribute selector.
 * Using the modern `CSS.escape()` when available, falling back to a
 * manual regex replacement. Older browsers that predate `CSS.escape`
 * are extreme outliers for a WP admin — the fallback is conservative
 * rather than robust.
 */
function cssEscape( value: string ): string {
	if ( typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ) {
		return CSS.escape( value );
	}
	return value.replace( /["\\]/g, '\\$&' );
}
