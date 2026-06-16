/**
 * Shared mutable reference to PostgreSQLAdapter.datetimeType.
 * Mirrors: PostgreSQLAdapter.datetime_type class_attribute (default: :timestamp).
 * Stored here to break the circular import that would arise if OID::DateTime
 * imported PostgreSQLAdapter directly.
 *
 * @internal
 */
export const pgDatetimeConfig = {
  datetimeType: "timestamp" as string,
  nativeDatabaseTypesOverrides: {} as Record<string, string | { name?: string; limit?: number }>,
};

/**
 * Mirrors: PostgreSQL::OID::DateTime#real_type_unless_aliased — given a
 * physical storage type ("timestamp" / "timestamptz"), report "datetime"
 * when the adapter's datetime_type is currently aliased to it, else the
 * physical type unchanged. Used by the schema dumper to rewrite
 * timestamp/timestamptz columns based on the live datetime_type, matching
 * what re-introspecting the column would yield.
 *
 * @internal
 */
export function pgRealTypeUnlessAliased(physicalType: string): string {
  return pgDatetimeConfig.datetimeType === physicalType ? "datetime" : physicalType;
}
