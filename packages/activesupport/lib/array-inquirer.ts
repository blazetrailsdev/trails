export class ArrayInquirer<T extends string | symbol> extends Array<T> {
  static toString(): string {
    return "ActiveSupport::ArrayInquirer";
  }

  constructor(...items: T[]) {
    super(...items);
  }

  any(...candidates: (string | ((element: T) => boolean))[]): boolean {
    const block = typeof candidates[0] === "function" ? candidates[0] : undefined;
    if (block !== undefined) candidates = [];

    const elements = this as unknown as T[];
    if (candidates.length === 0) {
      return block !== undefined ? elements.some(block) : elements.length > 0;
    }
    return (candidates as string[]).some((candidate) => {
      const name = candidate.startsWith(":") ? candidate.slice(1) : candidate;
      return elements.includes(`:${name}` as T) || elements.includes(name as T);
    });
  }
}

Object.setPrototypeOf(
  ArrayInquirer.prototype,
  new Proxy(Object.create(Array.prototype) as object, {
    get(target, prop: string | symbol, receiver: ArrayInquirer<string>) {
      if (
        typeof prop === "symbol" ||
        Reflect.has(target, prop) ||
        receiver === ArrayInquirer.prototype
      ) {
        return Reflect.get(target, prop, receiver);
      }
      if (prop.endsWith("?")) {
        const methodName = prop;
        return () => receiver.any(methodName.slice(0, -1));
      }
      return undefined;
    },
    has(target, prop) {
      return (typeof prop === "string" && prop.endsWith("?")) || Reflect.has(target, prop);
    },
  }),
);

export function inquiry<T extends string | symbol>(
  this: T[],
): ArrayInquirer<T> & Record<string, () => boolean> {
  return new ArrayInquirer<T>(...this) as any;
}
