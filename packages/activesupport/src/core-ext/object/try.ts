export interface Tryable {
  try(method: string, ...args: unknown[]): unknown;
  tryBang(method: string, ...args: unknown[]): unknown;
}

export const Tryable = {
  try(obj: unknown, method: string, ...args: unknown[]): unknown {
    if (obj == null) return undefined;
    const target = obj as Record<string, unknown>;
    const fn = target[method];
    if (typeof fn === "function") {
      return fn.apply(obj, args);
    }
    if (args.length === 0) return fn;
    return undefined;
  },

  tryBang(obj: unknown, method: string, ...args: unknown[]): unknown {
    if (obj == null) return undefined;
    const target = obj as Record<string, unknown>;
    const fn = target[method];
    if (typeof fn !== "function") {
      if (args.length === 0 && method in Object(obj)) return fn;
      throw new TypeError(
        `undefined method '${method}' for ${obj === null ? "nil:NilClass" : String(obj)}`,
      );
    }
    return fn.apply(obj, args);
  },
};

export class Delegator implements Tryable {
  private _delegate: unknown;

  constructor(delegate: unknown) {
    this._delegate = delegate;
  }

  try(method: string, ...args: unknown[]): unknown {
    return Tryable.try(method in this ? this : this._delegate, method, ...args);
  }

  tryBang(method: string, ...args: unknown[]): unknown {
    return Tryable.tryBang(method in this ? this : this._delegate, method, ...args);
  }
}
