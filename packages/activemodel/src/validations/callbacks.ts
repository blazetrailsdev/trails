import {
  Callbacks as ASCallbacks,
  defineCallbacks,
  extend,
  include,
  included,
  prepend,
  runCallbacks,
} from "@blazetrails/activesupport";
import type { CallbackConditions, CallbackObject } from "../callbacks.js";

export const ClassMethods = {
  beforeValidation<T extends ValidationCallbacksHost>(
    this: T,
    fn: ValidationCallbackFilter<T>,
    options: ValidationCallbackOptions = {},
  ): void {
    setOptionsForCallback(options);

    this.setCallback("validation", "before", fn, options as CallbackConditions);
  },

  afterValidation<T extends ValidationCallbacksHost>(
    this: T,
    fn: ValidationCallbackFilter<T>,
    options: ValidationCallbackOptions = {},
  ): void {
    options = { ...options };
    options.prepend = true;

    setOptionsForCallback(options);

    this.setCallback("validation", "after", fn, options as CallbackConditions);
  },
};

/** @internal */
export interface ValidationCallbacksHost {
  prototype: object;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors ASCallbacks.ClassMethods#setCallback's filter splat.
  setCallback(name: string, ...filterList: any[]): void;
}

export type ValidationCallbackFilter<T extends ValidationCallbacksHost> =
  | ((record: T["prototype"]) => void | boolean | Promise<void | boolean>)
  | CallbackObject
  | string;

export interface CallbacksInstanceMethods {
  /** @internal */
  runValidationsBang(): Promise<boolean>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `include()`'s own AnyClass shape.
type AnyClass = (new (...args: any[]) => any) & { prototype: object };

export const Callbacks = {
  ClassMethods,
  [included](base: AnyClass): void {
    extend(base, ClassMethods);

    include(base, ASCallbacks.InstanceMethods);
    include(base, { _runValidationCallbacks });
    extend(base, ASCallbacks.ClassMethods);
    defineCallbacks(base.prototype, "validation", {
      skipAfterCallbacksIfTerminated: true,
      scope: ["kind", "name"],
    });
    prepend(base.prototype, { runValidationsBang });
  },
};

type Conditional = ((record: unknown) => boolean) | string;

interface CallbackOptions {
  on?: string | string[] | null;
  if?: Conditional | Conditional[];
  unless?: Conditional | Conditional[];
}

export type ValidationCallbackOptions = CallbackOptions & { prepend?: boolean };

interface CallbackHostRecord {
  validationContext?: string | string[] | null;
}

/** @internal */
export interface RunValidationsBangHost {
  _runValidationCallbacks(block: () => Promise<boolean>): Promise<boolean>;
}

/** @internal */
export async function runValidationsBang(
  this: RunValidationsBangHost,
  super_: (...args: unknown[]) => unknown,
): Promise<boolean> {
  return this._runValidationCallbacks(async () => (await super_()) as boolean);
}

/** @internal */
export function setOptionsForCallback(options: CallbackOptions): void {
  if (!Object.prototype.hasOwnProperty.call(options, "on")) return;
  const onArr = Array.isArray(options.on) ? options.on : options.on == null ? [] : [options.on];
  options.on = onArr;
  const contextGuard = (o: unknown) => {
    const ctx = (o as CallbackHostRecord).validationContext;
    const ctxArr = Array.isArray(ctx) ? ctx : ctx == null ? [] : [ctx];
    return onArr.some((on) => ctxArr.includes(on));
  };
  const existingIf = options.if;
  const existingArr =
    existingIf == null ? [] : Array.isArray(existingIf) ? existingIf : [existingIf];
  options.if = [contextGuard, ...existingArr];
}

/** @internal */
export async function _runValidationCallbacks(
  this: object,
  block: () => Promise<boolean>,
): Promise<boolean> {
  return (await runCallbacks(this, "validation", block)) as boolean;
}
