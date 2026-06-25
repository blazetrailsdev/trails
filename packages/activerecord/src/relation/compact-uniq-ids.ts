/**
 * Rails `find_with_ids` collapses the id list with `ids = ids.compact.uniq`
 * before its `case ids.size` dispatch. Both finder paths (`Core#find` and
 * the relation's `normalizeFindArgs`) share this single implementation so
 * they dedupe identically — `find([1n, 1])` folds to one id on either path.
 */

/**
 * Normalize an id to a dedup key. A BigInt and the value-equal number/string
 * id fold together, matching the lookup's value-equality (a raw `Set` would
 * miss `1n` vs `1` and treat them as distinct ids).
 */
function dedupKey(value: unknown): unknown {
  return typeof value === "bigint" || typeof value === "number" ? String(value) : value;
}

/** Drop nil entries, then dedupe by {@link dedupKey} (Rails `compact.uniq`). */
export function compactUniqIds(ids: unknown[]): unknown[] {
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  for (const id of ids) {
    if (id === null || id === undefined) continue;
    const key = dedupKey(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}
