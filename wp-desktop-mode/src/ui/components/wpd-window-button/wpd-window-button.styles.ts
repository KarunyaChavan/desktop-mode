import { css } from '../../core';

/**
 * Button colors flip between "focused" and "unfocused" window
 * title bars. Shadow DOM can't reach the parent window's focus
 * class directly (no cross-boundary selectors in widely-shipped
 * browsers), so the OUTER `.wp-desktop-window[--focused]` CSS
 * sets these custom properties; the shadow DOM reads them via
 * `var()` with sensible fallbacks.
 *
 * Plugins that want custom buttons can override these on the
 * `<wpd-window-button>` element itself or on a parent selector.
 */
export const styles = css`
	:host {
		display: inline-flex;
	}
	button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: none;
		border-radius: 5px;
		background: transparent;
		color: var( --wpd-btn-color, currentColor );
		cursor: pointer;
		transition: background-color 0.15s ease, color 0.15s ease;
	}
	button:hover {
		color: var( --wpd-btn-color-hover, currentColor );
		background: var( --wpd-btn-bg-hover, rgba( 0, 0, 0, 0.06 ) );
	}
	button:focus-visible {
		color: var( --wpd-btn-color-hover, currentColor );
		background: var( --wpd-btn-bg-hover, rgba( 0, 0, 0, 0.06 ) );
		outline: 2px solid var( --wpd-btn-outline, currentColor );
		outline-offset: 1px;
	}
	:host( [ active ] ) button {
		color: var( --wpd-btn-color-hover, currentColor );
		background: var( --wpd-btn-bg-active, rgba( 0, 0, 0, 0.08 ) );
	}
	:host( [ danger ] ) button:hover {
		color: #fff;
		background: var( --wpd-btn-danger-hover, #d63638 );
	}
	svg {
		display: block;
		pointer-events: none;
		flex-shrink: 0;
	}
`;
