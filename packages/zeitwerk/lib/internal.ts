export const Internal = {
  internal(this: object, methodName: string): void {
    const mangled = `__${methodName}`;
    const table: object =
      typeof this === "function" ? (this as { prototype: object }).prototype : this;
    let descriptor: PropertyDescriptor | undefined;
    for (let owner: object | null = table; owner !== null; owner = Object.getPrototypeOf(owner)) {
      descriptor = Object.getOwnPropertyDescriptor(owner, methodName);
      if (descriptor !== undefined) break;
    }
    Object.defineProperty(table, mangled, {
      ...(descriptor ?? {
        get(this: Record<string, unknown>) {
          return this[methodName];
        },
      }),
      enumerable: typeof this !== "function",
      configurable: true,
    });
  },
};
