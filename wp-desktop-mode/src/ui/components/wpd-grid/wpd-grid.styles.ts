import { css } from '../../core';

export const styles = css`
	:host {
		display: grid;
		grid-template-columns: var( --wpd-grid-columns, 1fr );
		grid-template-rows: var( --wpd-grid-rows, auto );
		gap: var( --wpd-grid-gap, 8px );
		column-gap: var( --wpd-grid-column-gap, var( --wpd-grid-gap, 8px ) );
		row-gap: var( --wpd-grid-row-gap, var( --wpd-grid-gap, 8px ) );
	}
	:host( [ hidden ] ) {
		display: none;
	}
`;
