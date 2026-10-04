import {
  Callbacks as ASCallbacks,
  extend,
  include,
  included,
  kernelArray as array,
  type Extended,
} from "@blazetrails/activesupport";
import { hasKey, isIntersect, Module } from "@blazetrails/ruby-compat";
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

    include(base, ASCallbacks);
    (base as AnyClass & Extended<typeof ASCallbacks.ClassMethods>).defineCallbacks("validation", {
      skipAfterCallbacksIfTerminated: true,
      scope: ["kind", "name"],
    });
    include(base, SuperMethods);
  },
};

type Conditional = ((record: unknown) => boolean) | string;

interface CallbackOptions {
  on?: string | string[] | null;
  if?: Conditional | Conditional[];
}

export type ValidationCallbackOptions = CallbackOptions & {
  unless?: Conditional | Conditional[];
  prepend?: boolean;
};

interface CallbackHostRecord {
  validationContext?: string | string[] | null;
}

/** @internal */
export interface RunValidationsBangHost {
  _runValidationCallbacks(block: () => unknown): unknown;
}

/** @internal */
export async function runValidationsBang(this: RunValidationsBangHost): Promise<boolean> {
  return (await this._runValidationCallbacks(() =>
    SuperMethods.superMethod(this, "runValidationsBang")!(),
  )) as boolean;
}

const SuperMethods = new Module((mod) =>
  mod.defineMethod("runValidationsBang", runValidationsBang),
);

/** @internal */
export function setOptionsForCallback(options: CallbackOptions): void {
  if (hasKey(options, "on")) {
    options.on = array(options.on);
    options.if = [
      (o: unknown) =>
        isIntersect(options.on as string[], array((o as CallbackHostRecord).validationContext)),
      ...array(options.if),
    ];
  }
}
