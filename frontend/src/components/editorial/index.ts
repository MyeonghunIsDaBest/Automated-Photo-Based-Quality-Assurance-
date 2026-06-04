// Editorial primitives barrel — Phase B.
// Components compose `lib/editorial.ts` className recipes; consumers should
// only ever import from this barrel so primitives stay swappable.
export { default as CameraCaptureButton } from './CameraCaptureButton';
export { default as EditorialButton } from './EditorialButton';
export { default as EditorialModal } from './EditorialModal';
export { default as EyebrowLabel } from './EyebrowLabel';
export { default as ResponsiveDataTable } from './ResponsiveDataTable';
export { default as SectionHeader } from './SectionHeader';
export { default as StatCell } from './StatCell';
export { default as AccentBar } from './AccentBar';
export { default as EditorialPageHeader } from './EditorialPageHeader';
export { default as PageContainer } from './PageContainer';
export { default as StatStrip } from './StatStrip';
export type { ColumnDef } from './ResponsiveDataTable';
