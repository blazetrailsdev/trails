export function tryCall<T extends object>(
  obj: T | null | undefined,
  method: string,
  ...args: unknown[]
): unknown {
  if (obj == null) return undefined;
  const val = (obj as any)[method];
  if (typeof val === "function") return val.apply(obj, args);
  if (val !== undefined && args.length === 0) return val;
  if (args.length === 0 && typeof obj === "object" && method in obj) return val;
  return undefined;
}

export function tryWith<T, R>(obj: T | null | undefined, fn: (obj: T) => R): R | undefined {
  if (obj == null) return undefined;
  return fn(obj);
}

export function tryBang<T extends object>(
  obj: T | null | undefined,
  method: string,
  ...args: unknown[]
): unknown {
  if (obj == null) return undefined;
  const fn = (obj as any)[method];
  if (typeof fn !== "function") {
    throw new TypeError(`undefined method '${method}' for ${String(obj)}`);
  }
  return fn.apply(obj, args);
}
