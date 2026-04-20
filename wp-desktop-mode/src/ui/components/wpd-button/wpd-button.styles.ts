/**
 * `<wpd-button>` — shadow-DOM styles. Variants are selected via
 * host-attribute selectors (`:host([variant='primary'])`).
 */
import { css } from '../../core';

export const styles = css`
	:host {
		display: inline-flex;
	}
	button {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 6px;
		font: inherit;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.12s ease, color 0.12s ease,
			border-color 0.12s ease;
		/* Ghost (default) */
		background: transparent;
		color: var( --wp-desktop-text, #1d2327 );
		border: 1px solid var( --wp-desktop-border, #c3c4c7 );
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button:hover:not( :disabled ) {
		background: rgba( 0, 0, 0, 0.04 );
	}
	/* Primary */
	:host( [ variant='primary' ] ) button {
		background: var( --wp-admin-theme-color, #2271b1 );
		color: #fff;
		border: 1px solid transparent;
	}
	:host( [ variant='primary' ] ) button:hover:not( :disabled ) {
		filter: brightness( 1.06 );
		background: var( --wp-admin-theme-color, #2271b1 );
	}
	/* Danger */
	:host( [ variant='danger' ] ) button {
		background: transparent;
		color: #d63638;
		border: 1px solid currentColor;
	}
	:host( [ variant='danger' ] ) button:hover:not( :disabled ) {
		background: #d63638;
		color: #fff;
	}
	/* Link */
	:host( [ variant='link' ] ) button {
		background: transparent;
		color: var( --wp-admin-theme-color, #2271b1 );
		border: 0;
		padding: 0;
		text-decoration: underline;
	}
	:host( [ busy ] ) button {
		pointer-events: none;
		opacity: 0.75;
	}
`;
