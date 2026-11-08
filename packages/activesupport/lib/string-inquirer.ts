import { KERNEL_METHODS, PROTOCOL_PROBES, rbMethodName } from "@blazetrails/ruby-compat";

function isPredicateSpelling(prop: string): boolean {
  return /^is[A-Z]/.test(prop) && !KERNEL_METHODS.has(prop) && !PROTOCOL_PROBES.has(prop);
}

export class StringInquirer extends String {
  static toString(): string {
    return "ActiveSupport::StringInquirer";
  }
}

Object.setPrototypeOf(
  StringInquirer.prototype,
  new Proxy(Object.create(Object.getPrototypeOf(StringInquirer.prototype)) as object, {
    get(target, prop: string | symbol, receiver) {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
      if (typeof prop === "symbol") return undefined;
      const methodName = isPredicateSpelling(prop) ? rbMethodName(prop) : prop;
      if (methodName.endsWith("?")) {
        const expected = methodName.slice(0, -1);
        return function (this: unknown): boolean {
          return String.prototype.valueOf.call(this) === expected;
        };
      }
      return undefined;
    },
    has(target, prop) {
      if (typeof prop === "string" && (prop.endsWith("?") || isPredicateSpelling(prop)))
        return true;
      return Reflect.has(target, prop);
    },
  }),
);

export function inquiry(this: string): StringInquirer & Record<string, () => boolean> {
  return new StringInquirer(this) as any;
}
