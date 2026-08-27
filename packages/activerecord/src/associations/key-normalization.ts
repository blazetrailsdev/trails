/** @noRailsEquivalent PERMANENT */

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function normalizeAssociationKey(key: unknown): unknown {
  if (typeof key === "bigint") {
    return key >= MIN_SAFE_BIGINT && key <= MAX_SAFE_BIGINT ? Number(key) : key.toString();
  }
  return key;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function associationKeysEqual(a: unknown, b: unknown): boolean {
  return normalizeAssociationKey(a) === normalizeAssociationKey(b);
}
