import type { Base } from "./base.js";

const _klasses: Array<typeof Base> = [];

function klasses(): Array<typeof Base> {
  return _klasses;
}

export function noTouching<R>(modelClass: typeof Base, fn: () => R | Promise<R>): R | Promise<R> {
  return applyTo(modelClass, fn);
}

export function isAppliedTo(klass: typeof Base): boolean {
  return klasses().some((k) => {
    let current: unknown = klass;
    while (typeof current === "function") {
      if (current === k) return true;
      current = Object.getPrototypeOf(current);
    }
    return false;
  });
}

export function isNoTouching(this: Base): boolean {
  return isAppliedTo(this.constructor as typeof Base);
}

export function applyTo<R>(klass: typeof Base, fn: () => R | Promise<R>): R | Promise<R> {
  klasses().push(klass);

  try {
    const result = fn();
    if (result && typeof (result as any).then === "function") {
      return Promise.resolve(result).finally(() => {
        klasses().pop();
      }) as Promise<R>;
    }
    klasses().pop();
    return result;
  } catch (error) {
    klasses().pop();
    throw error;
  }
}
