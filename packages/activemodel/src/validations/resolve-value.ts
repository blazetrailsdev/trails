/**
 * ResolveValue — resolves a validator option to its runtime value.
 *
 * Mirrors: ActiveModel::Validations::ResolveValue
 *
 * Rails accepts a Proc (callable) or a Symbol (method name on the record).
 * A Ruby Symbol reaches us as a colon-prefixed string (`":five"`); a bare
 * string is also taken as a method reference when the record responds to it,
 * and is otherwise returned as a literal value.
 */
export interface ResolveValue {
  resolveValue(record: unknown, value: unknown): unknown;
}

export function resolveValue(record: unknown, value: unknown): unknown {
  if (typeof value === "function") {
    // Rails distinguishes Proc#arity == 0 (call without record) from
    // arity > 0 (call with record). resolve_value.rb:9-13.
    return (value as (...args: unknown[]) => unknown).length === 0
      ? (value as () => unknown)()
      : (value as (r: unknown) => unknown)(record);
  }
  if (typeof value === "string" && record && typeof record === "object") {
    // A Ruby Symbol reaches us as a colon-prefixed string (`":five"`); the
    // colon is the discriminator Ruby gets from the type.
    const name = value.startsWith(":") ? value.slice(1) : value;
    if (!(name in record)) return value;
    const method = (record as Record<string, unknown>)[name];
    if (typeof method === "function") {
      return (method as () => unknown).call(record);
    }
    return method;
  }
  return value;
}
