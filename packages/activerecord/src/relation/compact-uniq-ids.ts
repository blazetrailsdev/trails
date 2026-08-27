function dedupKey(value: unknown): unknown {
  return typeof value === "bigint" || typeof value === "number" ? String(value) : value;
}

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

export function compactUniqTuples(tuples: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const tuple of tuples) {
    if (tuple === null || tuple === undefined) continue;
    const key = Array.isArray(tuple)
      ? JSON.stringify(tuple.map(dedupKey))
      : JSON.stringify(dedupKey(tuple));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tuple);
  }
  return out;
}
