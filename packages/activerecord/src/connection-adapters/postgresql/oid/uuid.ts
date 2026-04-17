/**
 * PostgreSQL UUID type support.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Uuid
 */

import { Type } from "@blazetrails/activemodel";

// Rails uses /\A(\{)?([a-fA-F0-9]{4}-?){8}(?(1)\}|)\z/ — a conditional
// pattern that enforces balanced braces. JS regex has no conditional, so
// express the same constraint via alternation (either both braces or neither).
export const ACCEPTABLE_UUID = /^(?:\{([a-fA-F0-9]{4}-?){8}\}|([a-fA-F0-9]{4}-?){8})$/;
export const CANONICAL_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

/**
 * Permissive legacy regex retained so `isValidUuid` / `normalizeUuid`
 * (used by the adapter-level uuid test suite) keep accepting compact
 * 32-char UUIDs and unbalanced braces. The OID::Uuid class uses the
 * strict ACCEPTABLE_UUID above.
 */
export const ACCEPTABLE_UUID_REGEX =
  /^\{?[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\}?$/i;

export class Uuid extends Type<string> {
  readonly name = "uuid";

  override type(): string {
    return "uuid";
  }

  cast(value: unknown): string | null {
    return this.castValue(value);
  }

  override deserialize(value: unknown): string | null {
    return this.castValue(value);
  }

  // Rails does `alias :serialize :deserialize` — serialize routes through
  // the same casting path as deserialize.
  override serialize(value: unknown): string | null {
    return this.castValue(value);
  }

  /**
   * Mirrors Rails' Uuid#changed? — compares by class and value.
   */
  override isChanged(
    oldValue: unknown,
    newValue: unknown,
    _newValueBeforeTypeCast?: unknown,
  ): boolean {
    return oldValue?.constructor !== newValue?.constructor || newValue !== oldValue;
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    return rawOldValue?.constructor !== newValue?.constructor || newValue !== rawOldValue;
  }

  private castValue(value: unknown): string | null {
    if (value == null) return null;
    const str = String(value);
    if (!ACCEPTABLE_UUID.test(str)) return null;
    return this.formatUuid(str);
  }

  private formatUuid(uuid: string): string {
    if (CANONICAL_UUID.test(uuid)) return uuid;
    const stripped = uuid.replace(/[{}-]/g, "").toLowerCase();
    return `${stripped.slice(0, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}-${stripped.slice(16, 20)}-${stripped.slice(20)}`;
  }
}

/**
 * Check if a string is a valid UUID in any accepted format. Back-compat
 * helper for the adapter-level uuid test suite — accepts compact 32-char
 * UUIDs (legacy behavior).
 */
export function isValidUuid(value: string): boolean {
  return ACCEPTABLE_UUID_REGEX.test(value.trim());
}

/**
 * Normalize a UUID to standard lowercase hyphenated format. Back-compat
 * helper; returns null for invalid or empty input.
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
