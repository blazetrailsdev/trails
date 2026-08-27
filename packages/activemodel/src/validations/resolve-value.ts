import { NoMethodError } from "../attribute-assignment.js";

export interface ResolveValue {
  resolveValue(record: unknown, value: unknown): unknown;
}

export function resolveValue(record: unknown, value: unknown): unknown {
  if (typeof value === "function") {
    return (value as (...args: unknown[]) => unknown).length === 0
      ? (value as () => unknown)()
      : (value as (r: unknown) => unknown)(record);
  }
  if (typeof value === "string" && record && typeof record === "object") {
    if (value.startsWith(":")) {
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
