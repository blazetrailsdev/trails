import { ColumnSerializer } from "./column-serializer.js";
import { JSON as CodersJSON } from "./json.js";

type CoderLike = { dump(v: unknown): string; load(v: unknown): unknown };

/**
 * Builds the inner coder for a store column given raw options.
 * If coder responds to both load and dump, uses it directly.
 * If coder is a constructor (responds to new but not load), instantiates it.
 * Falls back to returning coder as-is when type is Object or unspecified.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ClassMethods#build_column_serializer
 *
 * @internal
 */
export function buildColumnSerializer(
  attrName: string,
  coder: unknown,
  type: unknown,
  _yaml?: Record<string, unknown>,
): unknown {
  const resolvedCoder = coder === globalThis.JSON ? CodersJSON : coder;

  // coder.respond_to?(:new) && !coder.respond_to?(:load) → instantiate as constructor
  if (typeof resolvedCoder === "function" && !("load" in resolvedCoder)) {
    return new (resolvedCoder as any)(attrName, type);
  }

  if (type && type !== Object) {
    return new ColumnSerializer(attrName, resolvedCoder as CoderLike, type as any);
  }

  return resolvedCoder;
}
