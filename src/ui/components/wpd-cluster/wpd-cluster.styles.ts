import { css } from '../../core';

export const styles = css`
	:host {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var( --wpd-cluster-gap, 8px );
		justify-content: var( --wpd-cluster-justify, flex-start );
		align-items: var( --wpd-cluster-align, center );
	}
	:host( [ hidden ] ) {
		display: none;
	}
`;
