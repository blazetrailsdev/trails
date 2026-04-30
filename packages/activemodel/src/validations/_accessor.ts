/**
 * Shared internal helper for the validator setupBang ports
 * (acceptance.ts, confirmation.ts). TS-only plumbing — no Rails
 * counterpart. Walks the prototype chain to capture the first-found
 * accessor shape for `name` so callers can install only the missing
 * half of a getter/setter pair without shadowing inherited accessors.
 */

export interface InheritedAccessor {
  hasGetter: boolean;
  hasSetter: boolean;
  getter?: (this: object) => unknown;
  setter?: (this: object, value: unknown) => void;
}

/**
 * Distinguishes accessor descriptors (`get`/`set`) from data
 * descriptors (`"value" in desc` — handles the `value: undefined`
 * case correctly). For data properties, synthesizes a getter that
 * reads through the captured prototype via `Reflect.get` (avoids
 * recursing into the accessor the caller is about to install), and a
 * setter that writes via own-property `defineProperty`.
 */
export function inspectAccessor(prototype: object, name: string): InheritedAccessor {
  let proto: object | null = prototype;
  while (proto && proto !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (desc) {
      if ("value" in desc || "writable" in desc) {
        const inheritedProto = proto;
        const enumerable = desc.enumerable ?? true;
        const configurable = desc.configurable ?? true;
        return {
          hasGetter: true,
          hasSetter: desc.writable !== false,
          getter() {
            return Reflect.get(inheritedProto, name, this);
          },
          setter:
            desc.writable !== false
              ? function (this: object, v: unknown) {
                  Object.defineProperty(this, name, {
                    value: v,
                    writable: true,
                    enumerable,
                    configurable,
                  });
                }
              : undefined,
        };
      }
      return {
        hasGetter: typeof desc.get === "function",
        hasSetter: typeof desc.set === "function",
        getter: desc.get as ((this: object) => unknown) | undefined,
        setter: desc.set as ((this: object, v: unknown) => void) | undefined,
      };
    }
    proto = Object.getPrototypeOf(proto);
  }
  return { hasGetter: false, hasSetter: false };
}
