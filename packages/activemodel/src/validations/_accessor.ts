/** @noRailsEquivalent PERMANENT */
export interface InheritedAccessor {
  hasGetter: boolean;
  hasSetter: boolean;
  getter?: (this: object) => unknown;
  setter?: (this: object, value: unknown) => void;
}

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
