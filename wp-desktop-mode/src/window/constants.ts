/**
 * Desktop Mode — Window constants.
 *
 * Shared between the `Window` class and its sibling helper modules
 * (drag, resize, tabs, menus, iframe-bridge).
 *
 * @since 0.8.1
 */

/** Minimum distance from viewport edges when dragging. */
export const EDGE_MARGIN = 8;

/**
 * How long an external sub-tab's iframe gets to fire its initial
 * `load` event before we assume the request failed and fall back to
 * opening the URL in a real browser tab.
 */
export const EXTERNAL_IFRAME_READY_TIMEOUT_MS = 3000;
