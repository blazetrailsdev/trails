import { NoMethodError } from "@blazetrails/ruby-compat";

export class ArrayInquirer<T extends string | symbol> extends Array<T> {
  constructor(...items: T[]) {
    super(...items);
    return new Proxy(this, {
      get(target, prop: string | symbol, receiver) {
        if (typeof prop === "symbol" || Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        if (prop.endsWith("?")) {
          const methodName = prop;
          return () => target.any(methodName.slice(0, -1));
        }
        return () => {
          throw new NoMethodError(
            `undefined method '${prop}' for an instance of ${target.constructor.name}`,
          );
        };
      },
      has(target, prop) {
        return (typeof prop === "string" && prop.endsWith("?")) || Reflect.has(target, prop);
      },
    });
  }

  any(...candidates: (string | ((element: T) => boolean))[]): boolean {
    const block = typeof candidates[0] === "function" ? candidates[0] : undefined;
    if (block !== undefined) candidates = [];

    if (candidates.length === 0) {
      const elements = this as unknown as T[];
      return block !== undefined ? elements.some(block) : elements.length > 0;
    }
    return (candidates as string[]).some((candidate) =>
      (this as unknown as T[]).includes(candidate as T),
    );
  }
}

export function inquiry<T extends string | symbol>(
  this: T[],
): ArrayInquirer<T> & Record<string, () => boolean> {
  return new ArrayInquirer<T>(...this) as any;
}
