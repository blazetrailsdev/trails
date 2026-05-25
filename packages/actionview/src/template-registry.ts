/**
 * Open interface — augment via `declare module "@blazetrails/actionview"`
 * to register partial-name → locals-type mappings. `trails-tsc-views build`
 * writes the augmentation automatically.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TemplateRegistry {}

/**
 * Extracts the locals type for a known partial from the registry.
 * Exists so declaration-merging can narrow the type per partial key.
 */
export type TemplateLocals<T> = T;
