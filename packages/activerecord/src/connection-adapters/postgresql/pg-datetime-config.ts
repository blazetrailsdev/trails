/** @noRailsEquivalent PERMANENT */

/** @internal */
export const pgDatetimeConfig = {
  datetimeType: "timestamp" as string,
  nativeDatabaseTypesOverrides: {} as Record<string, string | { name?: string; limit?: number }>,
};

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function pgRealTypeUnlessAliased(physicalType: string): string {
  return pgDatetimeConfig.datetimeType === physicalType ? "datetime" : physicalType;
}
