/**
 * PostgreSQL UUID type support.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Uuid
 */

/**
 * Regex matching all acceptable UUID formats:
 * - Standard: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * - Braced:   {xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}
 * - Compact:  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 */
export const ACCEPTABLE_UUID_REGEX =
  /^\{?[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\}?$/i;

/**
 * Check if a string is a valid UUID in any accepted format.
 */
export function isValidUuid(value: string): boolean {
  return ACCEPTABLE_UUID_REGEX.test(value.trim());
}

/**
 * Normalize a UUID to standard lowercase hyphenated format.
 * Returns null if the input is not a valid UUID.
 */
export function normalizeUuid(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!isValidUuid(trimmed)) return null;

  const hex = trimmed.replace(/[{}-]/g, "").toLowerCase();
  if (hex.length !== 32) return null;

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
