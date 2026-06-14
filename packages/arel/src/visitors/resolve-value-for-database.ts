/**
 * Resolve a bind's database value. QueryAttribute exposes
 * `valueForDatabase` as a method; ActiveModel::Attribute (TS port)
 * exposes it as a getter. A normal property read handles both shapes —
 * the getter evaluates to its value, a method reference yields a
 * function that we then invoke.
 */
export function resolveValueForDatabase(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("valueForDatabase" in value)) return value;
  const v = (value as Record<string, unknown>).valueForDatabase;
  return typeof v === "function" ? (v as () => unknown).call(value) : v;
}
