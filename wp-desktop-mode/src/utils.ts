/**
 * Desktop Mode — Shared Utilities.
 *
 * @since 6.9.0
 */

/**
 * Derive a window ID from an admin page URL.
 *
 * Strips the admin base URL and special characters to produce
 * a clean slug suitable for use as a DOM id attribute.
 *
 * @param url      The full admin page URL.
 * @param adminUrl The base admin URL (e.g., 'http://localhost/wp-admin/').
 * @return A sanitized window ID string.
 */
export function deriveWindowId( url: string, adminUrl: string ): string {
	let path = url.replace( adminUrl, '' );

	// Remove leading slash.
	if ( path.startsWith( '/' ) ) {
		path = path.substring( 1 );
	}

	// Replace special chars with dashes for a clean DOM id.
	return path
		.replace( /\.php/g, '-php' )
		.replace( /[?&=]/g, '-' )
		.replace( /[^a-zA-Z0-9_-]/g, '' )
		.replace( /-+/g, '-' )
		.replace( /^-|-$/g, '' ) || 'index';
}

/**
 * Sanitize a string for safe use as a CSS class name.
 *
 * Strips any characters that are not alphanumeric, hyphens, or underscores.
 *
 * @param value The raw class name value.
 * @return The sanitized class name.
 */
export function sanitizeClassName( value: string ): string {
	return value.replace( /[^a-zA-Z0-9_-]/g, '' );
}
