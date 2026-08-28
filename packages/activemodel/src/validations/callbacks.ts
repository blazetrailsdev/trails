import {
  Callbacks as ASCallbacks,
  defineCallbacks,
  extend,
  include,
  included,
} from "@blazetrails/activesupport";
import type { CallbackConditions, CallbackObject } from "../callbacks.js";
import type { Model } from "../model.js";

export const ClassMethods = {
  beforeValidation<T extends typeof Model>(
    this: T,
    fn: ValidationCallbackFilter<T>,
    options: ValidationCallbackOptions = {},
  ): void {
    setOptionsForCallback(options);

    this.setCallback("validation", "before", fn, options as CallbackConditions);
  },

  afterValidation<T extends typeof Model>(
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

export type ValidationCallbackFilter<T extends typeof Model> =
  | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
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
    defineCallbacks(base.prototype, "validation", {
      skipAfterCallbacksIfTerminated: true,
      scope: ["kind", "name"],
    });
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
  _runValidationCallbacks?: (block: () => boolean | Promise<boolean>) => boolean | Promise<boolean>;
  runValidations?: () => boolean | Promise<boolean>;
}

/** @internal */
export async function runValidationsBang(this: RunValidationsBangHost): Promise<boolean> {
  const block = (): boolean | Promise<boolean> => {
    if (typeof this.runValidations === "function") return this.runValidations();
    return true;
  };
  if (typeof this._runValidationCallbacks === "function") {
    return this._runValidationCallbacks(block);
  }
  return block();
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
