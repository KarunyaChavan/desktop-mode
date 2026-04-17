<?php
/**
 * Tests for the dock item builder that converts $menu / $submenu into
 * the JSON structure consumed by the desktop shell JavaScript.
 *
 * @package WordPress
 * @subpackage UnitTests
 *
 * @group desktop-mode
 *
 * @covers ::wp_desktop_build_dock_items
 */
class Tests_DesktopMode_WpDesktopBuildDockItems extends WP_UnitTestCase {

	protected static $admin_id;

	protected $original_menu;
	protected $original_submenu;

	public static function wpSetUpBeforeClass( WP_UnitTest_Factory $factory ) {
		self::$admin_id = $factory->user->create( array( 'role' => 'administrator' ) );
	}

	public function set_up() {
		parent::set_up();
		// Snapshot the menu globals so each test can mutate them safely.
		global $menu, $submenu;
		$this->original_menu    = $menu;
		$this->original_submenu = $submenu;
		$menu                   = array();
		$submenu                = array();
		wp_set_current_user( self::$admin_id );
	}

	public function tear_down() {
		global $menu, $submenu;
		$menu    = $this->original_menu;
		$submenu = $this->original_submenu;
		remove_all_filters( 'wp_desktop_dock_items' );
		remove_all_filters( 'wp_desktop_dock_item' );
		parent::tear_down();
	}

	/**
	 * Helper: build a $menu row in the canonical 7-element layout used
	 * throughout wp-admin/menu.php.
	 */
	private function make_menu_row( $title, $cap, $slug, $page_title = '', $classes = '', $hookname = '', $icon = 'dashicons-admin-post' ) {
		return array(
			$title,
			$cap,
			$slug,
			$page_title,
			$classes,
			$hookname ?: 'menu-' . sanitize_key( $slug ),
			$icon,
		);
	}

	public function test_returns_empty_array_when_menu_globals_are_empty() {
		global $menu;
		$menu = array();
		$this->assertSame( array(), wp_desktop_build_dock_items() );
	}

	public function test_skips_separators() {
		global $menu;
		$menu = array(
			array( '', 'read', 'separator1', '', 'wp-menu-separator' ),
			$this->make_menu_row( 'Posts', 'edit_posts', 'edit.php' ),
		);

		$items = wp_desktop_build_dock_items();

		$this->assertCount( 1, $items );
		$this->assertSame( 'Posts', $items[0]['title'] );
	}

	public function test_skips_items_with_empty_slug() {
		global $menu;
		$menu = array(
			array( 'No Slug', 'read', '', '', '', 'menu-noslug', '' ),
			$this->make_menu_row( 'Posts', 'edit_posts', 'edit.php' ),
		);

		$items = wp_desktop_build_dock_items();

		$this->assertCount( 1, $items );
		$this->assertSame( 'Posts', $items[0]['title'] );
	}

	public function test_filters_items_by_capability() {
		global $menu;
		// Use a logged-in user without the manage_options capability so
		// the second row should be filtered out.
		$subscriber_id = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( $subscriber_id );

		$menu = array(
			$this->make_menu_row( 'Read', 'read', 'index.php' ),
			$this->make_menu_row( 'Settings', 'manage_options', 'options-general.php' ),
		);

		$items = wp_desktop_build_dock_items();

		$titles = wp_list_pluck( $items, 'title' );
		$this->assertContains( 'Read', $titles );
		$this->assertNotContains( 'Settings', $titles );
	}

	/**
	 * Update badges live inside <span class="update-plugins count-N"> in
	 * the title HTML. The builder must extract the count and strip the
	 * span from the visible title.
	 */
	public function test_extracts_update_badge_and_strips_span_from_title() {
		global $menu;
		$menu = array(
			array(
				'Plugins <span class="update-plugins count-3"><span class="plugin-count">3</span></span>',
				'activate_plugins',
				'plugins.php',
				'',
				'',
				'menu-plugins',
				'dashicons-admin-plugins',
			),
		);

		$items = wp_desktop_build_dock_items();

		$this->assertSame( 'Plugins', $items[0]['title'] );
		$this->assertSame( 3, $items[0]['badge'] );
	}

	public function test_no_badge_when_count_class_missing() {
		global $menu;
		$menu = array( $this->make_menu_row( 'Posts', 'edit_posts', 'edit.php' ) );

		$items = wp_desktop_build_dock_items();
		$this->assertSame( 0, $items[0]['badge'] );
	}

	public function test_falls_back_to_generic_icon_when_unset() {
		global $menu;
		$menu = array(
			// Index 6 (icon) is empty.
			array( 'Custom', 'read', 'custom.php', '', '', 'menu-custom', '' ),
		);

		$items = wp_desktop_build_dock_items();
		$this->assertSame( 'dashicons-admin-generic', $items[0]['icon'] );
	}

	public function test_includes_submenu_items_user_can_access() {
		global $menu, $submenu;
		$menu               = array( $this->make_menu_row( 'Posts', 'edit_posts', 'edit.php' ) );
		$submenu['edit.php'] = array(
			array( 'All Posts', 'edit_posts', 'edit.php' ),
			array( 'Add New', 'edit_posts', 'post-new.php' ),
		);

		$items = wp_desktop_build_dock_items();

		$this->assertCount( 2, $items[0]['submenu'] );
		$this->assertSame( 'All Posts', $items[0]['submenu'][0]['title'] );
		$this->assertSame( 'Add New', $items[0]['submenu'][1]['title'] );
	}

	public function test_filters_submenu_by_capability() {
		global $menu, $submenu;
		$subscriber_id = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( $subscriber_id );

		$menu                = array( $this->make_menu_row( 'Posts', 'read', 'edit.php' ) );
		$submenu['edit.php'] = array(
			array( 'All Posts', 'read', 'edit.php' ),
			array( 'Add New', 'edit_posts', 'post-new.php' ),
		);

		$items = wp_desktop_build_dock_items();

		$this->assertCount( 1, $items[0]['submenu'] );
		$this->assertSame( 'All Posts', $items[0]['submenu'][0]['title'] );
	}

	public function test_skips_hide_if_no_customize_submenu_items() {
		global $menu, $submenu;
		$menu                  = array( $this->make_menu_row( 'Themes', 'edit_theme_options', 'themes.php' ) );
		$submenu['themes.php'] = array(
			array( 'Themes', 'edit_theme_options', 'themes.php' ),
			array( 'Customize', 'customize', 'customize.php', '', 'hide-if-no-customize' ),
		);

		$items = wp_desktop_build_dock_items();

		$titles = wp_list_pluck( $items[0]['submenu'], 'title' );
		$this->assertContains( 'Themes', $titles );
		$this->assertNotContains( 'Customize', $titles );
	}

	public function test_wp_desktop_dock_item_filter_can_modify_each_entry() {
		global $menu;
		$menu = array( $this->make_menu_row( 'Posts', 'edit_posts', 'edit.php' ) );

		add_filter(
			'wp_desktop_dock_item',
			function ( $item, $slug ) {
				$item['title'] = strtoupper( $item['title'] );
				$item['slug']  = $slug;
				return $item;
			},
			10,
			2
		);

		$items = wp_desktop_build_dock_items();
		$this->assertSame( 'POSTS', $items[0]['title'] );
		$this->assertSame( 'edit.php', $items[0]['slug'] );
	}

	public function test_wp_desktop_dock_items_filter_can_replace_full_list() {
		global $menu;
		$menu = array( $this->make_menu_row( 'Posts', 'edit_posts', 'edit.php' ) );

		add_filter(
			'wp_desktop_dock_items',
			function () {
				return array( array( 'id' => 'replaced', 'title' => 'Replaced' ) );
			}
		);

		$items = wp_desktop_build_dock_items();
		$this->assertCount( 1, $items );
		$this->assertSame( 'replaced', $items[0]['id'] );
	}
}
