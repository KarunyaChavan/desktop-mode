<?php
/**
 * Tests for the rendering helpers: body classes, shell injection,
 * chromeless bridge script, and the admin-bar suppression that
 * replaces the core is_admin_bar_showing() short-circuit.
 *
 * @package WPDesktopMode
 *
 * @group desktop-mode
 */
class Tests_DesktopMode_Render extends WP_UnitTestCase {

	protected static $admin_id;

	public static function wpSetUpBeforeClass( WP_UnitTest_Factory $factory ) {
		self::$admin_id = $factory->user->create( array( 'role' => 'administrator' ) );
	}

	public function set_up() {
		parent::set_up();
		set_current_screen( 'dashboard' );
		wp_set_current_user( self::$admin_id );
	}

	public function tear_down() {
		delete_user_meta( self::$admin_id, 'wp_desktop_mode' );
		unset( $_GET['wp_desktop'] );
		parent::tear_down();
	}

	/**
	 * @covers ::wp_desktop_admin_body_classes
	 */
	public function test_body_class_unchanged_when_mode_off() {
		$this->assertSame( 'foo', wp_desktop_admin_body_classes( 'foo' ) );
	}

	/**
	 * @covers ::wp_desktop_admin_body_classes
	 */
	public function test_body_class_adds_active_when_mode_on() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$this->assertStringContainsString( 'wp-desktop-active', wp_desktop_admin_body_classes( '' ) );
	}

	/**
	 * @covers ::wp_desktop_admin_body_classes
	 */
	public function test_body_class_adds_chromeless_when_iframed() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = '1';
		$this->assertStringContainsString( 'wp-desktop-chromeless', wp_desktop_admin_body_classes( '' ) );
	}

	/**
	 * Chromeless wins over active — inside an iframe we want the
	 * chromeless class, never the shell class.
	 *
	 * @covers ::wp_desktop_admin_body_classes
	 */
	public function test_chromeless_class_wins_over_active() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = '1';
		$classes            = wp_desktop_admin_body_classes( '' );

		$this->assertStringContainsString( 'wp-desktop-chromeless', $classes );
		$this->assertStringNotContainsString( 'wp-desktop-active', $classes );
	}

	/**
	 * @covers ::wp_desktop_render_shell
	 */
	public function test_render_shell_emits_nothing_when_mode_off() {
		ob_start();
		wp_desktop_render_shell();
		$output = ob_get_clean();

		$this->assertSame( '', $output );
	}

	/**
	 * @covers ::wp_desktop_render_shell
	 */
	public function test_render_shell_emits_nothing_in_chromeless() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = '1';

		ob_start();
		wp_desktop_render_shell();
		$output = ob_get_clean();

		$this->assertSame( '', $output );
	}

	/**
	 * @covers ::wp_desktop_render_shell
	 */
	public function test_render_shell_emits_markup_when_mode_on() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );

		ob_start();
		wp_desktop_render_shell();
		$output = ob_get_clean();

		$this->assertStringContainsString( 'wp-desktop-shell', $output );
		$this->assertStringContainsString( 'wp-desktop-dock', $output );
		$this->assertStringContainsString( 'wp-desktop-area', $output );
	}

	/**
	 * @covers ::wp_desktop_render_shell
	 */
	public function test_shell_before_and_after_actions_fire() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );

		$order = array();
		add_action(
			'wp_desktop_shell_before',
			function () use ( &$order ) {
				$order[] = 'before';
			}
		);
		add_action(
			'wp_desktop_shell_after',
			function () use ( &$order ) {
				$order[] = 'after';
			}
		);

		ob_start();
		wp_desktop_render_shell();
		ob_end_clean();

		$this->assertSame( array( 'before', 'after' ), $order );

		remove_all_actions( 'wp_desktop_shell_before' );
		remove_all_actions( 'wp_desktop_shell_after' );
	}

	/**
	 * @covers ::wp_desktop_render_shell
	 */
	public function test_render_shell_is_wired_to_in_admin_header() {
		$this->assertSame(
			5,
			has_action( 'in_admin_header', 'wp_desktop_render_shell' )
		);
	}

	/**
	 * The classic `wp_admin_bar_render` action must be detached inside
	 * chromeless iframes — the filter alone can't stop it because
	 * `is_admin_bar_showing()` returns true unconditionally in admin.
	 *
	 * @covers ::wp_desktop_chromeless_suppress_admin_bar
	 */
	public function test_chromeless_detaches_admin_bar_render_action() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = '1';

		add_action( 'in_admin_header', 'wp_admin_bar_render', 0 );
		wp_desktop_chromeless_suppress_admin_bar();

		$this->assertFalse( has_action( 'in_admin_header', 'wp_admin_bar_render' ) );
	}

	/**
	 * @covers ::wp_desktop_chromeless_suppress_admin_bar
	 */
	public function test_non_chromeless_leaves_admin_bar_render_wired() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );

		add_action( 'in_admin_header', 'wp_admin_bar_render', 0 );
		wp_desktop_chromeless_suppress_admin_bar();

		$this->assertSame( 0, has_action( 'in_admin_header', 'wp_admin_bar_render' ) );
		remove_action( 'in_admin_header', 'wp_admin_bar_render', 0 );
	}

	/**
	 * @covers ::wp_desktop_chromeless_bridge_script
	 */
	public function test_bridge_script_emits_nothing_outside_chromeless() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );

		ob_start();
		wp_desktop_chromeless_bridge_script();
		$output = ob_get_clean();

		$this->assertSame( '', $output );
	}

	/**
	 * @covers ::wp_desktop_chromeless_bridge_script
	 */
	public function test_bridge_script_emits_postmessage_glue_in_chromeless() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = '1';

		ob_start();
		wp_desktop_chromeless_bridge_script();
		$output = ob_get_clean();

		$this->assertStringContainsString( 'wp-desktop-screen-meta', $output );
		$this->assertStringContainsString( 'postMessage', $output );
	}

	/**
	 * @covers ::wp_desktop_chromeless_bridge_script
	 */
	public function test_chromeless_after_action_fires_in_iframes() {
		update_user_meta( self::$admin_id, 'wp_desktop_mode', '1' );
		$_GET['wp_desktop'] = '1';

		$fired = false;
		add_action(
			'wp_desktop_chromeless_after',
			function () use ( &$fired ) {
				$fired = true;
			}
		);

		ob_start();
		wp_desktop_chromeless_bridge_script();
		ob_end_clean();

		$this->assertTrue( $fired );
		remove_all_actions( 'wp_desktop_chromeless_after' );
	}
}
