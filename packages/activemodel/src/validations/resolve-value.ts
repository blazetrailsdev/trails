/**
 * ResolveValue — resolves a validator option to its runtime value.
 *
 * Mirrors: ActiveModel::Validations::ResolveValue
 *
 * In Rails, this module provides resolve_value which handles the
 * pattern where a validator option can be a literal, a Proc, or
 * a string (method name on the record).
 */
export interface ResolveValue {
  resolveValue(record: unknown, value: unknown): unknown;
}

export function resolveValue(record: unknown, value: unknown): unknown {
  if (typeof value === "function") {
    return (value as (record: unknown) => unknown)(record);
  }
  if (typeof value === "string" && record && typeof record === "object") {
    const method = (record as Record<string, unknown>)[value];
    if (typeof method === "function") {
      return (method as () => unknown).call(record);
    }
    return method;
  }
  return value;
}
