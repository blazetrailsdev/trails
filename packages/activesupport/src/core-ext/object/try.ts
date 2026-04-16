/**
 * Tryable — safe method invocation on objects that may be nil.
 * Mirrors ActiveSupport's Object#try, Object#try!, and Delegator#try.
 */

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
    return undefined;
  },

  tryBang(obj: unknown, method: string, ...args: unknown[]): unknown {
    if (obj == null) return undefined;
    const target = obj as Record<string, unknown>;
    const fn = target[method];
    if (typeof fn !== "function") {
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
    return Tryable.try(this._delegate, method, ...args);
  }

  tryBang(method: string, ...args: unknown[]): unknown {
    return Tryable.tryBang(this._delegate, method, ...args);
  }
}
