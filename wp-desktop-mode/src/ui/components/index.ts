/**
 * wpd-ui components barrel.
 *
 * Importing this file side-effect-registers every component in the
 * first batch with `customElements.define()`. After this import,
 * any `<wpd-*>` tag in the DOM upgrades automatically.
 *
 * Each component lives in its own folder with co-located styles
 * (`*.styles.ts`) and tests (`*.test.ts`), so a future refactor of
 * one component doesn't require touching any shared file.
 */

export { WpdSection } from './wpd-section/wpd-section';
export { WpdButton } from './wpd-button/wpd-button';
export { WpdSwatch } from './wpd-swatch/wpd-swatch';
export { WpdSwatchGrid } from './wpd-swatch-grid/wpd-swatch-grid';
export { WpdSegmented, WpdSegment } from './wpd-segmented/wpd-segmented';
export { WpdColorField } from './wpd-color-field/wpd-color-field';
export { WpdRangeField } from './wpd-range-field/wpd-range-field';
export { WpdCheckboxLabel } from './wpd-checkbox-label/wpd-checkbox-label';
export { WpdToast, WpdToastContainer } from './wpd-toast/wpd-toast';
export { WpdTabs, WpdTab } from './wpd-tabs/wpd-tabs';
