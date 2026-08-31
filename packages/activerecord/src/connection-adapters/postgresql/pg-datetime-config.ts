/** @internal */
export const pgDatetimeConfig = {
  datetimeType: "timestamp" as string,
  nativeDatabaseTypesOverrides: {} as Record<string, string | { name?: string; limit?: number }>,
};
