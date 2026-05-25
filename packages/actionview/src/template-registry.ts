/**
 * Open interface — augment via `declare module "@blazetrails/actionview"`
 * to register partial-name → locals-type mappings. `trails-tsc-views build`
 * writes the augmentation automatically.
 *
 * Each key is a formatless partial name (e.g. `"users/user"`, matching
 * `render partial: "users/user"` in Rails); each value is the locals object
 * type for that partial (e.g. `NoExtraKeys<{ user?: unknown }>`).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TemplateRegistry {}

/**
 * Extracts the locals type for a known partial from its registry entry.
 * Registry values are already locals object types (emitted by
 * `trails-tsc-views build`), so this is an identity alias that ensures
 * unregistered keys fall back to `Record<string, unknown>`.
 */
export type TemplateLocals<T> = [T] extends [never] ? Record<string, unknown> : T;
