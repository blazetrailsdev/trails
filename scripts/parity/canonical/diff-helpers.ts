/**
 * Shared utilities used by both scripts/parity/schema/diff.ts and
 * scripts/parity/query/diff.ts. Keeping them here prevents the two
 * diff scripts from drifting on how JSON is normalized before comparison.
 */

/** Recursively sort object keys so JSON string comparison is order-independent. */
export function sortedKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortedKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sortedKeys((obj as Record<string, unknown>)[k])]),
    );
  }
  return obj;
}

/** Stable stringification used as the canonical form for line-diffing. */
export function stableJson(obj: unknown): string {
  return JSON.stringify(sortedKeys(obj), null, 2) + "\n";
}
