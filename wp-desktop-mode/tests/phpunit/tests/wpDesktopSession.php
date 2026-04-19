<?php
/**
 * Tests for the Desktop Mode session persistence layer.
 *
 * Covers the user-meta helpers (empty/get/save/clear), the session
 * sanitizer (URL validation, dimension clamping, state enum, windows
 * cap), and the REST endpoints (permission gate, GET/POST/DELETE).
 *
 * @package WordPress
 * @subpackage UnitTests
 *
 * @group desktop-mode
 * @group desktop-mode-session
 */
class Tests_DesktopMode_WpDesktopSession extends WP_UnitTestCase {

	protected static $admin_id;

	public static function wpSetUpBeforeClass( WP_UnitTest_Factory $factory ) {
		self::$admin_id = $factory->user->create( array( 'role' => 'administrator' ) );
	}

	public function tear_down() {
		delete_user_meta( self::$admin_id, WPDM_SESSION_META_KEY );
		parent::tear_down();
	}

	/**
	 * Helper: build a minimal valid session window payload using a
	 * same-origin admin URL so the sanitizer accepts it.
	 */
	private function make_window( array $overrides = array() ) {
		return array_merge(
			array(
				'id'     => 'wp-window-edit-php',
				'url'    => admin_url( 'edit.php' ),
				'title'  => 'Posts',
				'icon'   => 'dashicons-admin-post',
				'state'  => 'normal',
				'x'      => 100,
				'y'      => 80,
				'width'  => 800,
				'height' => 600,
			),
			$overrides
		);
	}

	/**
	 * @covers ::wpdm_empty_session
	 */
	public function test_empty_session_shape() {
		$empty = wpdm_empty_session();

		$this->assertSame( array(), $empty['windows'] );
		$this->assertSame( '', $empty['focused'] );
		$this->assertSame( 0, $empty['updated'] );
		// Empty sessions still ship with one default desktop — the
		// shell can't function with zero, so the bootstrap shape
		// must always include `Desktop 1` and a matching active id.
		$this->assertCount( 1, $empty['desktops'] );
		$this->assertSame( 'desktop-1', $empty['desktops'][0]['id'] );
		$this->assertSame( 'Desktop 1', $empty['desktops'][0]['label'] );
		$this->assertSame( 'desktop-1', $empty['activeDesktop'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitize_persists_desktop_list_with_label_trim() {
		$session = array(
			'desktops' => array(
				array( 'id' => 'desktop-1', 'label' => 'Work' ),
				array( 'id' => 'desktop-2', 'label' => str_repeat( 'X', 100 ) ),
			),
			'activeDesktop' => 'desktop-2',
			'windows'       => array(),
		);

		$clean = wpdm_sanitize_session( $session );

		$this->assertCount( 2, $clean['desktops'] );
		$this->assertSame( 'desktop-1', $clean['desktops'][0]['id'] );
		$this->assertSame( 'Work', $clean['desktops'][0]['label'] );
		$this->assertSame( 'desktop-2', $clean['desktops'][1]['id'] );
		// 64-char cap on labels.
		$this->assertSame( 64, strlen( $clean['desktops'][1]['label'] ) );
		$this->assertSame( 'desktop-2', $clean['activeDesktop'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitize_falls_back_to_default_desktop_when_list_empty() {
		$clean = wpdm_sanitize_session( array( 'desktops' => array() ) );

		$this->assertCount( 1, $clean['desktops'] );
		$this->assertSame( 'desktop-1', $clean['desktops'][0]['id'] );
		$this->assertSame( 'desktop-1', $clean['activeDesktop'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitize_active_desktop_must_reference_real_desktop() {
		// `activeDesktop` points at a desktop that wasn't in the
		// `desktops` list — sanitizer should fall back to the first
		// real one rather than persist a dangling reference.
		$session = array(
			'desktops'      => array( array( 'id' => 'desktop-1', 'label' => 'A' ) ),
			'activeDesktop' => 'desktop-99',
		);

		$clean = wpdm_sanitize_session( $session );

		$this->assertSame( 'desktop-1', $clean['activeDesktop'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitize_window_with_known_desktop_id_persists_it() {
		$session = array(
			'desktops' => array(
				array( 'id' => 'desktop-1', 'label' => 'A' ),
				array( 'id' => 'desktop-2', 'label' => 'B' ),
			),
			'activeDesktop' => 'desktop-1',
			'windows'       => array(
				$this->make_window( array(
					'id'        => 'edit-php',
					'desktopId' => 'desktop-2',
				) ),
			),
		);

		$clean = wpdm_sanitize_session( $session );

		$this->assertCount( 1, $clean['windows'] );
		$this->assertSame( 'desktop-2', $clean['windows'][0]['desktopId'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitize_window_with_unknown_desktop_id_remaps_to_active() {
		// A window claiming a desktop id that doesn't exist (race
		// with a desktop close, or a malformed payload) should be
		// remapped to the active desktop so it remains visible after
		// restore — losing the window would be the worse UX.
		$session = array(
			'desktops'      => array( array( 'id' => 'desktop-1', 'label' => 'A' ) ),
			'activeDesktop' => 'desktop-1',
			'windows'       => array(
				$this->make_window( array(
					'id'        => 'edit-php',
					'desktopId' => 'desktop-77',
				) ),
			),
		);

		$clean = wpdm_sanitize_session( $session );

		$this->assertSame( 'desktop-1', $clean['windows'][0]['desktopId'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitize_caps_desktops_at_max() {
		$desktops = array();
		for ( $i = 1; $i <= ( WPDM_SESSION_MAX_DESKTOPS + 5 ); $i++ ) {
			$desktops[] = array(
				'id'    => "desktop-{$i}",
				'label' => "Desktop {$i}",
			);
		}

		$clean = wpdm_sanitize_session( array( 'desktops' => $desktops ) );

		$this->assertCount( WPDM_SESSION_MAX_DESKTOPS, $clean['desktops'] );
	}

	/**
	 * @covers ::wpdm_get_session
	 */
	public function test_get_session_returns_empty_when_meta_missing() {
		$session = wpdm_get_session( self::$admin_id );

		$this->assertSame( array(), $session['windows'] );
		$this->assertSame( '', $session['focused'] );
	}

	/**
	 * @covers ::wpdm_get_session
	 */
	public function test_get_session_returns_empty_for_invalid_user() {
		$this->assertSame( wpdm_empty_session(), wpdm_get_session( 0 ) );
		$this->assertSame( wpdm_empty_session(), wpdm_get_session( -5 ) );
	}

	/**
	 * @covers ::wpdm_get_session
	 */
	public function test_get_session_normalizes_corrupt_meta() {
		// Scalar instead of array — must degrade gracefully.
		update_user_meta( self::$admin_id, WPDM_SESSION_META_KEY, 'not-an-array' );

		$session = wpdm_get_session( self::$admin_id );
		$this->assertSame( array(), $session['windows'] );
	}

	/**
	 * @covers ::wpdm_save_session
	 * @covers ::wpdm_get_session
	 */
	public function test_save_and_get_session_roundtrip() {
		$payload = array(
			'windows' => array( $this->make_window() ),
			'focused' => 'wp-window-edit-php',
		);

		$this->assertTrue( wpdm_save_session( self::$admin_id, $payload ) );

		$stored = wpdm_get_session( self::$admin_id );
		$this->assertCount( 1, $stored['windows'] );
		$this->assertSame( 'wp-window-edit-php', $stored['focused'] );
		$this->assertGreaterThan( 0, $stored['updated'] );
		$this->assertSame( admin_url( 'edit.php' ), $stored['windows'][0]['url'] );
	}

	/**
	 * @covers ::wpdm_save_session
	 */
	public function test_save_session_rejects_invalid_user() {
		$this->assertFalse( wpdm_save_session( 0, array() ) );
	}

	/**
	 * @covers ::wpdm_clear_session
	 */
	public function test_clear_session_removes_meta() {
		update_user_meta( self::$admin_id, WPDM_SESSION_META_KEY, array( 'windows' => array() ) );

		$this->assertTrue( wpdm_clear_session( self::$admin_id ) );
		$this->assertSame( '', get_user_meta( self::$admin_id, WPDM_SESSION_META_KEY, true ) );
	}

	/**
	 * @covers ::wpdm_clear_session
	 */
	public function test_clear_session_rejects_invalid_user() {
		$this->assertFalse( wpdm_clear_session( 0 ) );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_drops_windows_with_cross_origin_url() {
		$clean = wpdm_sanitize_session(
			array(
				'windows' => array(
					$this->make_window( array( 'url' => 'https://evil.example.com/wp-admin/edit.php' ) ),
				),
			)
		);

		$this->assertSame( array(), $clean['windows'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_drops_windows_outside_admin_url() {
		$clean = wpdm_sanitize_session(
			array(
				'windows' => array(
					$this->make_window( array( 'url' => home_url( '/' ) ) ),
				),
			)
		);

		$this->assertSame( array(), $clean['windows'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_drops_windows_with_empty_id() {
		$clean = wpdm_sanitize_session(
			array(
				'windows' => array(
					$this->make_window( array( 'id' => '' ) ),
				),
			)
		);

		$this->assertSame( array(), $clean['windows'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_normalizes_invalid_state() {
		$clean = wpdm_sanitize_session(
			array(
				'windows' => array(
					$this->make_window( array( 'state' => 'floating-around' ) ),
				),
			)
		);

		$this->assertSame( 'normal', $clean['windows'][0]['state'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_preserves_valid_states() {
		foreach ( WPDM_SESSION_STATES as $state ) {
			$clean = wpdm_sanitize_session(
				array(
					'windows' => array( $this->make_window( array( 'state' => $state ) ) ),
				)
			);
			$this->assertSame( $state, $clean['windows'][0]['state'] );
		}
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 * @covers ::wpdm_sanitize_session_dimension
	 */
	public function test_sanitizer_clamps_out_of_range_dimensions() {
		$clean = wpdm_sanitize_session(
			array(
				'windows' => array(
					$this->make_window(
						array(
							'x'      => -999999,
							'y'      => 999999,
							'width'  => -50,
							'height' => 999999,
						)
					),
				),
			)
		);

		$win = $clean['windows'][0];
		$this->assertSame( -10000, $win['x'] );
		$this->assertSame( 10000, $win['y'] );
		$this->assertSame( 0, $win['width'] );
		$this->assertSame( 20000, $win['height'] );
	}

	/**
	 * The chromeless `wp_desktop` flag is an iframe-scoped concern. Persisting
	 * it into a session URL sets up a lockout: the portal's entry URL forwards
	 * the TOP window to a chromeless page (no admin bar → no toggle → no
	 * escape). Sanitizer must scrub it on save.
	 *
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_strips_chromeless_flag_from_window_urls() {
		$clean = wpdm_sanitize_session(
			array(
				'windows' => array(
					$this->make_window(
						array(
							'url' => admin_url( 'plugins.php?wp_desktop=1&paged=2' ),
						)
					),
				),
			)
		);

		$this->assertStringNotContainsString( 'wp_desktop=1', $clean['windows'][0]['url'] );
		$this->assertStringContainsString( 'paged=2', $clean['windows'][0]['url'] );
	}

	/**
	 * The "detach to new tab" flag is also request-scoped and must not
	 * survive into stored window URLs.
	 *
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_strips_classic_flag_from_window_urls() {
		$clean = wpdm_sanitize_session(
			array(
				'windows' => array(
					$this->make_window(
						array(
							'url' => admin_url( 'options-general.php?' . WPDM_CLASSIC_FLAG . '=1' ),
						)
					),
				),
			)
		);

		$this->assertStringNotContainsString( WPDM_CLASSIC_FLAG, $clean['windows'][0]['url'] );
	}

	/**
	 * The portal flag is a transient redirect marker, not something that
	 * should persist into user meta.
	 *
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_strips_portal_flag_from_window_urls() {
		$clean = wpdm_sanitize_session(
			array(
				'windows' => array(
					$this->make_window(
						array(
							'url' => admin_url( 'edit.php?' . WPDM_PORTAL_FLAG . '=1' ),
						)
					),
				),
			)
		);

		$this->assertStringNotContainsString( WPDM_PORTAL_FLAG, $clean['windows'][0]['url'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_strips_html_from_title() {
		$clean = wpdm_sanitize_session(
			array(
				'windows' => array(
					$this->make_window( array( 'title' => 'Posts <script>alert(1)</script>' ) ),
				),
			)
		);

		$this->assertStringNotContainsString( '<script>', $clean['windows'][0]['title'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_caps_windows_at_max() {
		$too_many = array();
		for ( $i = 0; $i < WPDM_SESSION_MAX_WINDOWS + 10; $i++ ) {
			$too_many[] = $this->make_window( array( 'id' => 'wp-window-' . $i ) );
		}

		$clean = wpdm_sanitize_session( array( 'windows' => $too_many ) );

		$this->assertCount( WPDM_SESSION_MAX_WINDOWS, $clean['windows'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_returns_empty_for_non_array_input() {
		$clean = wpdm_sanitize_session( 'not-a-session' );

		$this->assertSame( array(), $clean['windows'] );
		$this->assertSame( '', $clean['focused'] );
		$this->assertGreaterThan( 0, $clean['updated'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session
	 */
	public function test_sanitizer_sanitizes_focused_id() {
		$clean = wpdm_sanitize_session(
			array(
				'focused' => 'wp-window-<svg>EDIT</svg>',
				'windows' => array(),
			)
		);

		$this->assertSame( 'wp-window-svgeditsvg', $clean['focused'] );
	}

	/**
	 * @covers ::wpdm_sanitize_session_dimension
	 */
	public function test_dimension_clamping() {
		$this->assertSame( 10, wpdm_sanitize_session_dimension( '10', 0, 100 ) );
		$this->assertSame( 0, wpdm_sanitize_session_dimension( -5, 0, 100 ) );
		$this->assertSame( 100, wpdm_sanitize_session_dimension( 5000, 0, 100 ) );
		$this->assertSame( 42, wpdm_sanitize_session_dimension( 42.9, 0, 100 ) );
	}

	/**
	 * @covers ::wpdm_rest_session_permission
	 */
	public function test_rest_permission_denies_logged_out() {
		wp_set_current_user( 0 );
		$this->assertFalse( wpdm_rest_session_permission() );
	}

	/**
	 * @covers ::wpdm_rest_session_permission
	 */
	public function test_rest_permission_allows_logged_in_user_with_read_cap() {
		wp_set_current_user( self::$admin_id );
		$this->assertTrue( wpdm_rest_session_permission() );
	}

	/**
	 * @covers ::wpdm_register_session_rest_routes
	 */
	public function test_rest_routes_registered() {
		// Force REST server init so register_rest_route hooks fire.
		rest_get_server();

		$routes = rest_get_server()->get_routes();
		$this->assertArrayHasKey( '/wp-desktop/v1/session', $routes );
	}

	/**
	 * @covers ::wpdm_rest_get_session
	 */
	public function test_rest_get_session_returns_current_user_session() {
		wp_set_current_user( self::$admin_id );
		wpdm_save_session(
			self::$admin_id,
			array(
				'windows' => array( $this->make_window() ),
				'focused' => 'wp-window-edit-php',
			)
		);

		rest_get_server();
		$request  = new WP_REST_Request( 'GET', '/wp-desktop/v1/session' );
		$response = rest_do_request( $request );

		$this->assertSame( 200, $response->get_status() );
		$data = $response->get_data();
		$this->assertSame( 'wp-window-edit-php', $data['focused'] );
		$this->assertCount( 1, $data['windows'] );
	}

	/**
	 * @covers ::wpdm_rest_save_session
	 */
	public function test_rest_save_session_persists_payload() {
		wp_set_current_user( self::$admin_id );
		rest_get_server();

		$request = new WP_REST_Request( 'POST', '/wp-desktop/v1/session' );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body(
			wp_json_encode(
				array(
					'session' => array(
						'windows' => array( $this->make_window() ),
						'focused' => 'wp-window-edit-php',
					),
				)
			)
		);

		$response = rest_do_request( $request );
		$this->assertSame( 200, $response->get_status() );

		$stored = wpdm_get_session( self::$admin_id );
		$this->assertCount( 1, $stored['windows'] );
		$this->assertSame( 'wp-window-edit-php', $stored['focused'] );
	}

	/**
	 * @covers ::wpdm_rest_clear_session
	 */
	public function test_rest_clear_session_removes_meta() {
		wp_set_current_user( self::$admin_id );
		wpdm_save_session(
			self::$admin_id,
			array( 'windows' => array( $this->make_window() ) )
		);

		rest_get_server();
		$request  = new WP_REST_Request( 'DELETE', '/wp-desktop/v1/session' );
		$response = rest_do_request( $request );

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( array(), wpdm_get_session( self::$admin_id )['windows'] );
	}

	/**
	 * @covers ::wpdm_rest_save_session
	 */
	public function test_rest_save_session_denies_logged_out() {
		wp_set_current_user( 0 );
		rest_get_server();

		$request = new WP_REST_Request( 'POST', '/wp-desktop/v1/session' );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( wp_json_encode( array( 'session' => array( 'windows' => array() ) ) ) );

		$response = rest_do_request( $request );
		$this->assertSame( 401, $response->get_status() );
	}
}
