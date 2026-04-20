/**
 * Styles for `<wpd-tabs>` + `<wpd-tab>`. Two exported stylesheets
 * because each element adopts its own. Keeping them in one file
 * makes the visual decisions (underline accent, tight spacing)
 * side-by-side.
 */
import { css } from '../../core';

export const tabsStyles = css`
	:host {
		display: flex;
		gap: 4px;
		margin-bottom: 10px;
		border-bottom: 1px solid var( --wp-desktop-border, #dcdcde );
	}
`;

export const tabStyles = css`
	:host {
		display: inline-block;
	}
	button {
		appearance: none;
		padding: 6px 10px;
		border: none;
		background: transparent;
		color: var( --wp-desktop-muted, #50575e );
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: color 0.15s ease, border-color 0.15s ease;
	}
	button:hover {
		color: var( --wp-admin-theme-color, #2271b1 );
	}
	button:focus-visible {
		outline: 2px solid var( --wp-admin-theme-color, #2271b1 );
		outline-offset: 2px;
	}
	:host( [ aria-selected='true' ] ) button {
		color: var( --wp-admin-theme-color, #2271b1 );
		border-bottom-color: var( --wp-admin-theme-color, #2271b1 );
	}
`;
