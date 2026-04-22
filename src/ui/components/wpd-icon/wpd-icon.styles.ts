import { css } from '../../core';

export const styles = css`
	:host {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var( --wpd-icon-size, 16px );
		height: var( --wpd-icon-size, 16px );
		color: inherit;
		line-height: 1;
	}
	:host( [ hidden ] ) {
		display: none;
	}
	.wpd-icon__glyph {
		font-size: var( --wpd-icon-size, 16px );
		width: var( --wpd-icon-size, 16px );
		height: var( --wpd-icon-size, 16px );
		line-height: 1;
		color: inherit;
	}
`;
