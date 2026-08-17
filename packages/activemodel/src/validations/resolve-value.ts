import { NoMethodError } from "../attribute-assignment.js";

/**
 * ResolveValue — resolves a validator option to its runtime value.
 *
 * Mirrors: ActiveModel::Validations::ResolveValue
 *
 * Rails' three `case value` branches are a Proc, a Symbol (a method to `send`
 * to the record) and everything else, returned literally unless it responds to
 * `call` (resolve_value.rb:7-22). A Ruby Symbol reaches us as a colon-prefixed
 * string (`":five"`); a bare string is a String, so it takes the `else` branch
 * and stays a literal, and a JS callable is already the Proc branch — which
 * leaves nothing for the `respond_to?(:call)` arm to match.
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
    if (value.startsWith(":")) {
      // resolve_value.rb:14-15 — `record.send(value)`, unguarded, so a Symbol
      // naming a missing method raises rather than falling through.
      const name = value.slice(1);
      if (!(name in record)) {
        throw new NoMethodError(
          `undefined method '${name}' for an instance of ${record.constructor.name}`,
        );
      }
      const method = (record as Record<string, unknown>)[name];
      return typeof method === "function" ? (method as () => unknown).call(record) : method;
    }
  }
  return value;
}
