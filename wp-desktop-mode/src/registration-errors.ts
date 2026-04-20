/**
 * Desktop Mode — Shared registration-error helpers.
 *
 * Plugin authors that register a widget / wallpaper / module with a
 * malformed def used to see a generic
 * `[wp-desktop-mode] Ignored invalid widget registration: { ... }`
 * warning and have to guess which field failed. These helpers collect
 * per-field errors instead, so the console message tells them exactly
 * what's wrong:
 *
 *   [wp-desktop-mode] Widget registration rejected — fields: id (missing), mount (not a function).
 *
 * Factored out so every registry validates with the same ergonomics.
 *
 * @since 0.8.2
 */

type FieldCheck<T> = {
	/** Human name of the field, used in the error message. */
	field: string;
	/** True when the field passes. Falsy → the `message` gets reported. */
	valid: ( d: Partial< T > ) => boolean;
	/**
	 * Short suffix after the field name in the composed error, e.g.
	 * `"id"` + `"missing"` → `"id (missing)"`. Keep terse — plugin
	 * authors read it at a glance.
	 */
	message: string;
};

/**
 * Run a list of per-field checks against a def. Returns an empty
 * array when everything passes, or a list of `field (reason)` strings
 * when something's off.
 */
export function collectRegistrationErrors<T>(
	def: unknown,
	checks: FieldCheck< T >[],
): string[] {
	if ( ! def || typeof def !== 'object' ) {
		return [ 'def (not an object)' ];
	}
	const d = def as Partial< T >;
	const errors: string[] = [];
	for ( const check of checks ) {
		if ( ! check.valid( d ) ) {
			errors.push( `${ check.field } (${ check.message })` );
		}
	}
	return errors;
}

/**
 * Log a registration rejection with a readable error + the offending
 * def payload so the plugin author can introspect. Console-only:
 * throwing would break compatibility with plugins that register in a
 * fire-and-forget way.
 */
export function logRegistrationErrors(
	kind: string,
	errors: string[],
	def: unknown,
): void {
	if ( typeof console === 'undefined' ) {
		return;
	}
	console.warn(
		`[wp-desktop-mode] ${ kind } registration rejected — fields: ` +
			errors.join( ', ' ) +
			'.',
		def,
	);
}
