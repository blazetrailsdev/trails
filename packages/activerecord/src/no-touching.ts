import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { Module, rbClassInheritedP } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";

export const NoTouching = new Module();

/** @internal */
function klasses(): Array<typeof Base> {
  return (
    IsolatedExecutionState.get<Array<typeof Base>>("active_record_no_touching_classes") ??
    IsolatedExecutionState.set("active_record_no_touching_classes", [])
  );
}

export function noTouching<R>(modelClass: typeof Base, fn: () => R | Promise<R>): Promise<R> {
  return applyTo(modelClass, fn);
}

export function isAppliedTo(klass: typeof Base): boolean {
  return klasses().some((k) => rbClassInheritedP(klass, k));
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

export async function applyTo<R>(klass: typeof Base, fn: () => R | Promise<R>): Promise<R> {
  klasses().push(klass);
  try {
    return await fn();
  } finally {
    klasses().pop();
  }
}

NoTouching.defineMethod("touchLater", touchLater);
NoTouching.defineMethod("touch", touch);
