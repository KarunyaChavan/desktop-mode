/**
 * Desktop Mode — Widget type definitions.
 *
 * Widgets live in a right-side column that paints above the wallpaper
 * but beneath every window. They're small persistent chrome for
 * passive content — clock, pending-comments count, a Marvel quote —
 * not launchers, not interactive tools. Think macOS Notification
 * Center widgets.
 *
 * Lifecycle mirrors the canvas-wallpaper contract: `mount(container)`
 * returns a teardown function the layer calls when the widget is
 * removed, the user re-orders, or the shell is torn down.
 *
 * @since 0.7.0
 */

/** Teardown callback returned by `mount`. */
export type WidgetTeardown = () => void;

/**
 * Execution context passed to `mount`. Kept intentionally minimal:
 * most widgets only need the plugin URL to locate their own asset
 * bundle. Extensions go behind feature flags, not fields.
 */
export interface WidgetContext {
	/** The widget's own id — handy for data-attribute scoping. */
	id: string;
	/** Absolute URL of the wp-desktop-mode plugin (no trailing slash). */
	pluginUrl: string;
}

/**
 * A registered widget definition.
 *
 * `mount` receives the card body (already styled with the glass
 * backdrop, rounded corners, 12 px inner padding) and paints its own
 * contents. It must return a teardown that reverses every side effect
 * — event listeners, intervals, observers, subscriptions.
 */
export interface WidgetDef {
	/**
	 * Unique identifier. Used both as the localStorage key for
	 * enabled widgets and as the default HTML id suffix.
	 * Plugin-namespacing is on the author (e.g. `jorvy/quote`).
	 */
	id: string;
	/** Human-readable label shown in the picker + used for a11y. */
	label: string;
	/** One-line description shown in the picker beneath the label. */
	description: string;
	/** Dashicons class name (e.g., `dashicons-clock`). */
	icon: string;
	/**
	 * Paint the widget into `container`. Return a teardown. May be
	 * sync or async — async mounts are awaited and race-checked
	 * against a generation counter so a rapid add/remove doesn't
	 * leak a pending mount.
	 */
	mount: (
		container: HTMLElement,
		ctx: WidgetContext,
	) => WidgetTeardown | Promise<WidgetTeardown>;
}
