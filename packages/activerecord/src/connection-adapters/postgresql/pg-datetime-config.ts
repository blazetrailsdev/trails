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
