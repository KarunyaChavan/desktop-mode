<?php
/**
 * PHPUnit bootstrap for the WP Desktop Mode plugin.
 *
 * Loads the WordPress test framework and activates the plugin before
 * each run so the plugin's hooks are wired in the test environment.
 *
 * Expects the WP_TESTS_DIR environment variable (or WP_PHPUNIT__DIR when
 * using the wp-phpunit/wp-phpunit composer package) to point at the
 * WordPress test library.
 *
 * @package WPDesktopMode
 */

$_tests_dir = getenv( 'WP_TESTS_DIR' );
if ( ! $_tests_dir ) {
	$_tests_dir = getenv( 'WP_PHPUNIT__DIR' );
}
if ( ! $_tests_dir ) {
	$_tests_dir = rtrim( sys_get_temp_dir(), '/\\' ) . '/wordpress-tests-lib';
}

if ( ! file_exists( "{$_tests_dir}/includes/functions.php" ) ) {
	echo "Could not find {$_tests_dir}/includes/functions.php. Set WP_TESTS_DIR or install the WP test suite." . PHP_EOL;
	exit( 1 );
}

require_once "{$_tests_dir}/includes/functions.php";

tests_add_filter(
	'muplugins_loaded',
	static function () {
		require dirname( __DIR__, 2 ) . '/wp-desktop-mode.php';
	}
);

require "{$_tests_dir}/includes/bootstrap.php";
