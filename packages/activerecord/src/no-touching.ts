import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { Module } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";

export const NoTouching = new Module();

/** @internal */
function klasses(): Array<typeof Base> {
  return (
    IsolatedExecutionState.get<Array<typeof Base>>("active_record_no_touching_classes") ??
    IsolatedExecutionState.set("active_record_no_touching_classes", [])
  );
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

/** @missingRailsName class — PERMANENT */
export function isNoTouching(this: Base): boolean {
  return isAppliedTo(this.constructor as typeof Base);
}

export function touchLater(this: Base, ...args: unknown[]): Promise<void> | undefined {
  if (!isNoTouching.call(this)) {
    return NoTouching.superMethod(this, "touchLater")!(...args) as Promise<void>;
  }
}

export function touch(this: Base, ...args: unknown[]): Promise<boolean> | undefined {
  if (!isNoTouching.call(this)) {
    return NoTouching.superMethod(this, "touch")!(...args) as Promise<boolean>;
  }
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

NoTouching.defineMethod("touchLater", touchLater);
NoTouching.defineMethod("touch", touch);
