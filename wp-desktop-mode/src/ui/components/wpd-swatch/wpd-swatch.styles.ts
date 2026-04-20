import { css } from '../../core';

/**
 * Two size variants:
 *
 *   - default  — fills the parent cell with a 4:3 rectangle.
 *                Used by the wallpaper grid, where each swatch
 *                mirrors the desktop's aspect at a smaller scale.
 *   - small    — fixed 32×32 circle.
 *                Used by the accent-color row. A fixed chip size
 *                works better with `mode="row"` on the grid (flex-
 *                wrap) and avoids the overflow you get from a 1fr
 *                column becoming ~120 px wide on an 820 px panel.
 *
 * Both variants respect the same selection + hover styling — only
 * the outer shape changes.
 */
export const styles = css`
	:host {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
	}
	:host( [ size='small' ] ) {
		display: inline-block;
		width: 32px;
		height: 32px;
		aspect-ratio: 1 / 1;
		flex: 0 0 auto;
	}
	button {
		appearance: none;
		width: 100%;
		height: 100%;
		padding: 0;
		border-radius: 10px;
		border: 2px solid transparent;
		cursor: pointer;
		background-color: #eee;
		background-size: cover;
		background-position: center;
		transition: transform 0.15s ease, border-color 0.15s ease,
			box-shadow 0.15s ease;
	}
	:host( [ size='small' ] ) button {
		border-radius: 50%;
	}
	button:hover {
		transform: scale( 1.04 );
	}
	button[ aria-pressed='true' ] {
		border-color: var( --wp-admin-theme-color, #2271b1 );
		box-shadow: 0 0 0 2px var( --wp-admin-theme-color, #2271b1 );
	}
`;
