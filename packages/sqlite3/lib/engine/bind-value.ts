import type { SqliteBindValue } from "../driver.js";

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function bindValue(value: SqliteBindValue): SqliteBindValue {
  if ((value as unknown) instanceof Number) return (value as unknown as number).valueOf();
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  return value === undefined ? null : value;
}
