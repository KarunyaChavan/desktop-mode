/**
 * Desktop Mode — Toast.
 *
 * Transient top-of-shell notification for shell-level events that
 * don't warrant a full dialog but should register with the user.
 * Used today when an external-link sub-tab's iframe is blocked by
 * `X-Frame-Options` / CSP and the shell has to fall back to opening
 * the URL in a real browser tab. Expected to pick up more callers
 * over time (save failures, shortcut reminders, etc.).
 *
 * Single shared container lives under `<body>`; each toast is an
 * absolutely-positioned card that fades in, sits for its duration,
 * then fades out and removes itself. No persistent queue — if two
 * toasts fire in quick succession, both show stacked.
 *
 * @since 0.7.0
 */

/** Class on the shared container; also the CSS anchor for stacking. */
const CONTAINER_CLASS = 'wp-desktop-toast-container';

/** Default how-long-it-stays duration in ms. */
const DEFAULT_DURATION_MS = 4000;

/** Fade-out transition duration in ms — keeps JS + CSS in sync. */
const FADE_OUT_MS = 200;

export interface ToastOptions {
	/** Short human-readable message. */
	message: string;
	/**
	 * Optional secondary action — when set, renders a clickable link
	 * at the toast's right edge. Great for "Retry", "Open in new tab",
	 * "Undo" affordances. Clicking fires the callback and dismisses
	 * the toast.
	 */
	action?: {
		label: string;
		onClick: () => void;
	};
	/** How long the toast stays visible, in milliseconds. */
	duration?: number;
}

/**
 * Show a toast. Returns a dismiss callback the caller can invoke
 * early (e.g., when the state the toast was reporting changes).
 */
export function showToast( options: ToastOptions ): () => void {
	const container = ensureContainer();
	const toast = document.createElement( 'div' );
	toast.className = 'wp-desktop-toast';
	toast.setAttribute( 'role', 'status' );

	const label = document.createElement( 'span' );
	label.className = 'wp-desktop-toast__label';
	label.textContent = options.message;
	toast.appendChild( label );

	if ( options.action ) {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'wp-desktop-toast__action';
		btn.textContent = options.action.label;
		btn.addEventListener( 'click', () => {
			options.action?.onClick();
			dismiss();
		} );
		toast.appendChild( btn );
	}

	container.appendChild( toast );

	let dismissed = false;
	let dismissTimer: number | null = null;
	const dismiss = (): void => {
		if ( dismissed ) {
			return;
		}
		dismissed = true;
		if ( dismissTimer !== null ) {
			window.clearTimeout( dismissTimer );
			dismissTimer = null;
		}
		toast.classList.add( 'wp-desktop-toast--out' );
		window.setTimeout( () => {
			toast.remove();
		}, FADE_OUT_MS );
	};

	// Enter animation — add the class on the next frame so the browser
	// has painted the initial (hidden) state, guaranteeing a transition.
	requestAnimationFrame( () => {
		toast.classList.add( 'wp-desktop-toast--in' );
	} );

	dismissTimer = window.setTimeout(
		dismiss,
		options.duration ?? DEFAULT_DURATION_MS,
	) as unknown as number;

	return dismiss;
}

function ensureContainer(): HTMLElement {
	const existing = document.querySelector<HTMLElement>(
		`.${ CONTAINER_CLASS }`,
	);
	if ( existing ) {
		return existing;
	}
	const el = document.createElement( 'div' );
	el.className = CONTAINER_CLASS;
	el.setAttribute( 'aria-live', 'polite' );
	document.body.appendChild( el );
	return el;
}
