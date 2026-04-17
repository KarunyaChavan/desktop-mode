<?php
/**
 * Tests for the desktop mode admin bar toggle node and the
 * accompanying asset-enqueue helpers that back it.
 *
 * @package WordPress
 * @subpackage UnitTests
 *
 * @group desktop-mode
 * @group admin-bar
 */
class Tests_DesktopMode_AdminBarDesktopToggle extends WP_UnitTestCase {

	protected static $admin_id;

	public static function set_up_before_class() {
		parent::set_up_before_class();
		require_once ABSPATH . WPINC . '/class-wp-admin-bar.php';
	}

	public static function wpSetUpBeforeClass( WP_UnitTest_Factory $factory ) {
		self::$admin_id = $factory->user->create( array( 'role' => 'administrator' ) );
	}

	public function set_up() {
		parent::set_up();
		set_current_screen( 'dashboard' );
		// Re-register admin-bar style + script fresh so inline data from
		// other tests doesn't leak into the assertions below.
		wp_styles()->remove( 'admin-bar' );
		wp_scripts()->remove( 'admin-bar' );
		wp_register_style( 'admin-bar', false );
		wp_register_script( 'admin-bar', false );
		// Dequeue desktop styles/scripts from previous tests so each case
		// observes a clean enqueue state.
		foreach ( array( 'wp-desktop', 'wp-desktop-windows', 'wp-desktop-dock', 'wp-desktop-chromeless' ) as $handle ) {
			wp_dequeue_style( $handle );
			wp_dequeue_script( $handle );
		}
	}

	public function tear_down() {
		delete_user_meta( self::$admin_id, 'wp_desktop_mode' );
		remove_all_filters( 'wp_desktop_shell_config' );
		unset( $_GET['wp_desktop'] );
		parent::tear_down();
	}

	/**
	 * Helper: build an admin bar and apply the toggle node.
	 */
	private function build_admin_bar() {
		$admin_bar = new WP_Admin_Bar();
		wp_admin_bar_desktop_mode_toggle( $admin_bar );
		return $admin_bar;
	}

	/**
	 * @covers ::wp_admin_bar_desktop_mode_toggle
	 */
	public function test_toggle_is_added_for_admin_in_admin() {
		wp_set_current_user( self::$admin_id );
		$bar = $this->build_admin_bar();

		$node = $bar->get_node( 'desktop-mode-toggle' );
		$this->assertNotNull( $node );
		$this->assertSame( 'top-secondary', $node->parent );
	}

	/**
	 * @covers ::wp_admin_bar_desktop_mode_toggle
	 */
	public function test_toggle_is_not_added_for_logged_out_user() {
		wp_set_current_user( 0 );
		$bar = $this->build_admin_bar();
		$this->assertNull( $bar->get_node( 'desktop-mode-toggle' ) );
	}

	/**
	 * The toggle should only render on admin screens — on the front-end
	 * the admin bar is used by logged-in users too, but the desktop mode
	 * toggle is admin-only.
	 *
	 * @covers ::wp_admin_bar_desktop_mode_toggle
	 */
	public function test_toggle_is_not_added_on_front_end() {
		wp_set_current_user( self::$admin_id );
		set_current_screen( 'front' );
		$bar = $this->build_admin_bar();
		$this->assertNull( $bar->get_node( 'desktop-mode-toggle' ) );
	}

	/**
	 * @covers ::wp_admin_bar_desktop_mode_toggle
	 */
	public function test_toggle_title_switches_when_desktop_mode_is_active() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$bar  = $this->build_admin_bar();
		$node = $bar->get_node( 'desktop-mode-toggle' );

		$this->assertStringContainsString( 'Classic Admin', $node->title );
		$this->assertSame( 'desktop-mode-active', $node->meta['class'] );
	}

	/**
	 * @covers ::wp_admin_bar_desktop_mode_toggle
	 */
	public function test_toggle_title_advertises_desktop_mode_when_inactive() {
		wp_set_current_user( self::$admin_id );
		$bar  = $this->build_admin_bar();
		$node = $bar->get_node( 'desktop-mode-toggle' );

		$this->assertStringContainsString( 'Desktop Mode', $node->title );
		$this->assertSame( '', $node->meta['class'] );
	}

	/**
	 * The toggle wiring adds it to the admin_bar_menu action at priority 190
	 * so it runs before the secondary groups render. Registration happens
	 * inside WP_Admin_Bar::add_menus(), so we need to build the bar first.
	 *
	 * @covers ::wp_admin_bar_desktop_mode_toggle
	 */
	public function test_toggle_is_registered_on_admin_bar_menu_action() {
		wp_set_current_user( self::$admin_id );
		$admin_bar = new WP_Admin_Bar();
		$admin_bar->add_menus();

		$this->assertSame(
			190,
			has_action( 'admin_bar_menu', 'wp_admin_bar_desktop_mode_toggle' )
		);
	}

	/**
	 * @covers ::wp_enqueue_desktop_mode_toggle_assets
	 */
	public function test_toggle_assets_are_added_to_admin_bar_style() {
		wp_set_current_user( self::$admin_id );

		wp_enqueue_desktop_mode_toggle_assets();

		$after  = wp_styles()->get_data( 'admin-bar', 'after' );
		$inline = is_array( $after ) ? implode( '', $after ) : (string) $after;
		$this->assertStringContainsString( '#wp-admin-bar-desktop-mode-toggle', $inline );
	}

	/**
	 * @covers ::wp_enqueue_desktop_mode_toggle_assets
	 */
	public function test_toggle_assets_nonce_is_baked_into_inline_script() {
		wp_set_current_user( self::$admin_id );

		wp_enqueue_desktop_mode_toggle_assets();

		$after  = wp_scripts()->get_data( 'admin-bar', 'after' );
		$inline = is_array( $after ) ? implode( '', $after ) : (string) $after;
		$this->assertStringContainsString( 'save-desktop-mode', $inline );
	}

	/**
	 * The function exits early for logged-out users. We verify that by
	 * checking the toggle-specific selector is NOT in the inline CSS.
	 *
	 * @covers ::wp_enqueue_desktop_mode_toggle_assets
	 */
	public function test_toggle_assets_skipped_for_logged_out_user() {
		wp_set_current_user( 0 );

		wp_enqueue_desktop_mode_toggle_assets();

		$after  = wp_styles()->get_data( 'admin-bar', 'after' );
		$inline = is_array( $after ) ? implode( '', $after ) : (string) $after;
		$this->assertStringNotContainsString( '#wp-admin-bar-desktop-mode-toggle', $inline );
	}

	/**
	 * @covers ::wp_enqueue_desktop_mode_assets
	 */
	public function test_desktop_mode_assets_not_enqueued_when_mode_off() {
		wp_set_current_user( self::$admin_id );

		wp_enqueue_desktop_mode_assets();

		$this->assertFalse( wp_style_is( 'wp-desktop', 'enqueued' ) );
		$this->assertFalse( wp_script_is( 'wp-desktop', 'enqueued' ) );
	}

	/**
	 * @covers ::wp_enqueue_desktop_mode_assets
	 */
	public function test_desktop_mode_assets_enqueued_when_mode_on() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );

		wp_enqueue_desktop_mode_assets();

		$this->assertTrue( wp_style_is( 'wp-desktop', 'enqueued' ) );
		$this->assertTrue( wp_style_is( 'wp-desktop-windows', 'enqueued' ) );
		$this->assertTrue( wp_style_is( 'wp-desktop-dock', 'enqueued' ) );
		$this->assertTrue( wp_script_is( 'wp-desktop', 'enqueued' ) );
	}

	/**
	 * Chromeless requests must get the chromeless stylesheet but NOT the
	 * full shell assets — the shell lives in the parent frame.
	 *
	 * @covers ::wp_enqueue_desktop_mode_assets
	 */
	public function test_chromeless_request_enqueues_chromeless_style_only() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = '1';

		wp_enqueue_desktop_mode_assets();

		$this->assertTrue( wp_style_is( 'wp-desktop-chromeless', 'enqueued' ) );
		$this->assertFalse( wp_style_is( 'wp-desktop-windows', 'enqueued' ) );
		$this->assertFalse( wp_style_is( 'wp-desktop-dock', 'enqueued' ) );
		$this->assertFalse( wp_script_is( 'wp-desktop', 'enqueued' ) );
	}

	/**
	 * @covers ::wp_enqueue_desktop_mode_assets
	 */
	public function test_desktop_mode_assets_localize_shell_config() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );

		wp_enqueue_desktop_mode_assets();

		$data = wp_scripts()->get_data( 'wp-desktop', 'data' );
		$this->assertNotEmpty( $data );
		$this->assertStringContainsString( 'wpDesktopConfig', (string) $data );
		$this->assertStringContainsString( 'dockItems', (string) $data );
	}

	/**
	 * @covers ::wp_enqueue_desktop_mode_assets
	 */
	public function test_shell_config_filter_can_replace_entire_config() {
		wp_set_current_user( self::$admin_id );
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );

		add_filter(
			'wp_desktop_shell_config',
			function () {
				return array( 'currentTitle' => 'Filtered Title' );
			}
		);

		wp_enqueue_desktop_mode_assets();

		$data = (string) wp_scripts()->get_data( 'wp-desktop', 'data' );
		$this->assertStringContainsString( 'Filtered Title', $data );
	}

	/**
	 * @covers ::wp_enqueue_desktop_mode_assets
	 */
	public function test_default_filters_wire_enqueue_callbacks_to_admin_enqueue_scripts() {
		$this->assertNotFalse( has_action( 'admin_enqueue_scripts', 'wp_enqueue_desktop_mode_toggle_assets' ) );
		$this->assertNotFalse( has_action( 'admin_enqueue_scripts', 'wp_enqueue_desktop_mode_assets' ) );
	}
}
