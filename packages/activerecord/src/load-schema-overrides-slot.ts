/** @noRailsEquivalent PERMANENT */

export type LoadSchemaOverride = (this: unknown, superFn: () => void) => void;

/** @noRailsEquivalent PERMANENT */
export const loadSchemaOverrides: Array<{
  includeOrder: number;
  override: LoadSchemaOverride;
}> = [];

/** @noRailsEquivalent PERMANENT */
export function registerLoadSchemaOverride(
  includeOrder: number,
  override: LoadSchemaOverride,
): void {
  if (loadSchemaOverrides.some((entry) => entry.override === override)) return;
  loadSchemaOverrides.push({ includeOrder, override });
  loadSchemaOverrides.sort((a, b) => a.includeOrder - b.includeOrder);
}
