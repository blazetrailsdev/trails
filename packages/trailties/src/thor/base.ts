import { rbObjRespondTo } from "@blazetrails/ruby-compat";

export const TEMPLATE_EXTNAME = ".tt";

/** @internal */
export function fromSuperclass(
  this: object,
  method: string,
  defaultValue: unknown = null,
): unknown {
  const superclass = Object.getPrototypeOf(this) as Record<string, () => unknown>;
  if (!rbObjRespondTo(superclass, method, true)) {
    return defaultValue;
  } else {
    const value = superclass[method]();

    return Array.isArray(value) ? [...value] : value;
  }
}
