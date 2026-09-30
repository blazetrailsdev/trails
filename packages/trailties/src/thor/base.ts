import { dup, Hash, rbObjRespondTo } from "@blazetrails/ruby-compat";

export const TEMPLATE_EXTNAME = ".tt";

/** @internal */
export function fromSuperclass(
  this: { baseclass(): unknown },
  method: string,
  defaultValue: unknown = null,
): unknown {
  const superclass = Object.getPrototypeOf(this) as Record<string, () => unknown>;
  if (this === this.baseclass() || !rbObjRespondTo(superclass, method, true)) {
    return defaultValue;
  } else {
    const value = superclass[method]();

    if (Array.isArray(value)) return [...value];
    if (value instanceof Hash) return dup(value);
    if (
      value !== null &&
      typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      return dup(value as Record<string, unknown>);
    }
    return value;
  }
}
