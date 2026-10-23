import { NoMethodError, rbMethodName } from "@blazetrails/ruby-compat";

export class StringInquirer extends String {
  static toString(): string {
    return "ActiveSupport::StringInquirer";
  }

  constructor(value: string) {
    super(value);
    return new Proxy(this, {
      get(target, prop: string | symbol, receiver) {
        if (Reflect.has(target, prop)) {
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" &&
            value === (String.prototype as unknown as Record<string | symbol, unknown>)[prop]
            ? value.bind(target)
            : value;
        }
        if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
        const methodName = /^is[A-Z]/.test(prop) ? rbMethodName(prop) : prop;
        if (methodName.endsWith("?")) {
          return () => target.valueOf() === methodName.slice(0, -1);
        }
        return () => {
          throw new NoMethodError(
            `undefined method '${prop}' for an instance of ${target.constructor.name}`,
          );
        };
      },
      has(target, prop) {
        if (typeof prop === "string" && (prop.endsWith("?") || /^is[A-Z]/.test(prop))) return true;
        return Reflect.has(target, prop);
      },
    });
  }
}

export function inquiry(this: string): StringInquirer & Record<string, () => boolean> {
  return new StringInquirer(this) as any;
}
