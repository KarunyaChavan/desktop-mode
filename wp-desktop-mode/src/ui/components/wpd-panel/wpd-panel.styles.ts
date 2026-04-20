import { css } from '../../core';

export const styles = css`
	:host {
		display: flex;
		flex-direction: column;
		gap: var( --wpd-panel-gap, 12px );
		padding: var( --wpd-panel-padding, 16px );
		box-sizing: border-box;
	}
	:host( [ hidden ] ) {
		display: none;
	}
`;
