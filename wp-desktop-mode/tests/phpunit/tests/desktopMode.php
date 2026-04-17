<?php
/**
 * Tests for the Desktop Mode core helpers.
 *
 * @package WordPress
 * @subpackage UnitTests
 *
 * @group desktop-mode
 */
class Tests_DesktopMode_DesktopMode extends WP_UnitTestCase {

	protected static $admin_id;

	public static function wpSetUpBeforeClass( WP_UnitTest_Factory $factory ) {
		self::$admin_id = $factory->user->create( array( 'role' => 'administrator' ) );
	}

	public function tear_down() {
		unset( $_GET['wp_desktop'] );
		delete_user_meta( self::$admin_id, 'wp_desktop_mode' );
		parent::tear_down();
	}

	/**
	 * @covers ::wp_is_desktop_mode
	 */
	public function test_returns_false_for_logged_out_user() {
		wp_set_current_user( 0 );
		$this->assertFalse( wp_is_desktop_mode() );
	}

	/**
	 * @covers ::wp_is_desktop_mode
	 */
	public function test_returns_false_when_meta_is_missing() {
		wp_set_current_user( self::$admin_id );
		$this->assertFalse( wp_is_desktop_mode() );
	}

	/**
	 * @covers ::wp_is_desktop_mode
	 */
	public function test_returns_false_when_meta_is_empty_string() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '' );
		$this->assertFalse( wp_is_desktop_mode() );
	}

	/**
	 * @covers ::wp_is_desktop_mode
	 */
	public function test_returns_true_when_meta_is_one() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$this->assertTrue( wp_is_desktop_mode() );
	}

	/**
	 * Truthy-but-not-'1' values must NOT enable desktop mode. The AJAX
	 * handler stores either '1' or empty string, so anything else
	 * (legacy data, manual edits, plugin tampering) is treated as off.
	 *
	 * @covers ::wp_is_desktop_mode
	 */
	public function test_returns_false_for_non_one_truthy_meta() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', 'true' );
		$this->assertFalse( wp_is_desktop_mode() );

		update_user_meta( self::$admin_id, 'wp_desktop_mode', '0' );
		$this->assertFalse( wp_is_desktop_mode() );
	}

	/**
	 * @covers ::wp_is_chromeless_request
	 */
	public function test_chromeless_false_without_query_param() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$this->assertFalse( wp_is_chromeless_request() );
	}

	/**
	 * @covers ::wp_is_chromeless_request
	 */
	public function test_chromeless_false_when_param_is_not_one() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = 'yes';
		$this->assertFalse( wp_is_chromeless_request() );
	}

	/**
	 * Critical security check: the chromeless query param MUST NOT
	 * strip admin chrome unless the user actually has desktop mode
	 * enabled. Otherwise anyone could send a victim a link with
	 * ?wp_desktop=1 and load admin pages without the navigation.
	 *
	 * @covers ::wp_is_chromeless_request
	 */
	public function test_chromeless_false_when_user_has_desktop_mode_off() {
		wp_set_current_user( self::$admin_id );
		// Meta intentionally not set.
		$_GET['wp_desktop'] = '1';
		$this->assertFalse( wp_is_chromeless_request() );
	}

	/**
	 * @covers ::wp_is_chromeless_request
	 */
	public function test_chromeless_false_for_logged_out_user_with_param() {
		wp_set_current_user( 0 );
		$_GET['wp_desktop'] = '1';
		$this->assertFalse( wp_is_chromeless_request() );
	}

	/**
	 * @covers ::wp_is_chromeless_request
	 */
	public function test_chromeless_true_when_param_set_and_user_opted_in() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = '1';
		$this->assertTrue( wp_is_chromeless_request() );
	}

	/**
	 * @covers ::wp_desktop_chromeless_hide_admin_bar
	 */
	public function test_show_admin_bar_filter_returns_false_in_chromeless() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = '1';
		$this->assertFalse( wp_desktop_chromeless_hide_admin_bar( true ) );
	}

	/**
	 * @covers ::wp_desktop_chromeless_hide_admin_bar
	 */
	public function test_show_admin_bar_filter_passes_through_outside_chromeless() {
		wp_set_current_user( self::$admin_id );
		// No chromeless param, no meta — both conditions for chromeless fail.
		$this->assertTrue( wp_desktop_chromeless_hide_admin_bar( true ) );
		$this->assertFalse( wp_desktop_chromeless_hide_admin_bar( false ) );
	}

	/**
	 * The filter is registered at module load via add_filter().
	 * Verify it actually fires through apply_filters('show_admin_bar').
	 *
	 * @covers ::wp_desktop_chromeless_hide_admin_bar
	 */
	public function test_show_admin_bar_filter_is_wired() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = '1';
		$this->assertFalse( apply_filters( 'show_admin_bar', true ) );
	}
}
