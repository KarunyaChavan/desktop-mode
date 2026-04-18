<?php
/**
 * Plugin Name:       WP Desktop Mode
 * Plugin URI:        https://wordpress.org/plugins/wp-desktop-mode/
 * Description:       Renders the WordPress admin as a desktop OS. Admin screens become draggable, resizable, minimizable windows floating on a desktop with a dock. Purely opt-in per user.
 * Version:           0.4.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            The WordPress Contributors
 * Author URI:        https://wordpress.org/
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wp-desktop-mode
 *
 * @package WPDesktopMode
 */

defined( 'ABSPATH' ) || exit;

define( 'WPDM_VERSION', '0.4.0' );
define( 'WPDM_FILE', __FILE__ );
define( 'WPDM_DIR', plugin_dir_path( __FILE__ ) );
define( 'WPDM_URL', plugin_dir_url( __FILE__ ) );

require_once WPDM_DIR . 'includes/helpers.php';
require_once WPDM_DIR . 'includes/ajax.php';
require_once WPDM_DIR . 'includes/assets.php';
require_once WPDM_DIR . 'includes/admin-bar.php';
require_once WPDM_DIR . 'includes/session.php';
require_once WPDM_DIR . 'includes/portal.php';
require_once WPDM_DIR . 'includes/media-query.php';
require_once WPDM_DIR . 'includes/render.php';
