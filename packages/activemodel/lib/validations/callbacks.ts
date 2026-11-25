import {
  Callbacks as ASCallbacks,
  extend,
  include,
  included,
  kernelArray as array,
  type Extended,
} from "@blazetrails/activesupport";
import { isIntersect } from "@blazetrails/ruby-compat/array";
import { rbCallSuper } from "@blazetrails/ruby-compat/include";
import type { CallbackObject } from "../callbacks.js";

export const ClassMethods = {
  beforeValidation<T extends ValidationCallbacksHost>(
    this: T,
    fn: ValidationCallbackFilter<T>,
    options: ValidationCallbackOptions = {},
  ): void {
    setOptionsForCallback(options);

    this.setCallback("validation", "before", fn, options);
  },

  afterValidation<T extends ValidationCallbacksHost>(
    this: T,
    fn: ValidationCallbackFilter<T>,
    options: ValidationCallbackOptions = {},
  ): void {
    options = { ...options };
    options.prepend = true;

    setOptionsForCallback(options);

    this.setCallback("validation", "after", fn, options);
  },
};

/** @internal */
export interface ValidationCallbacksHost {
  prototype: object;
  setCallback(name: string, ...filterList: unknown[]): void;
}

export type ValidationCallbackFilter<T extends ValidationCallbacksHost> =
  | ((record: T["prototype"]) => void | boolean | Promise<void | boolean>)
  | CallbackObject
  | string;

export interface CallbacksInstanceMethods {
  /** @internal */
  runValidationsBang(): Promise<boolean>;
}

type AnyClass = (new (...args: never[]) => unknown) & { prototype: object };

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
    rbCallSuper(this, runValidationsBang),
  )) as boolean;
}

const SuperMethods = { runValidationsBang };

/** @internal */
export function setOptionsForCallback(options: CallbackOptions): void {
  if ("on" in options) {
    options.on = array(options.on);
    options.if = [
      (o: unknown) =>
        isIntersect(options.on as string[], array((o as CallbackHostRecord).validationContext)),
      ...array(options.if),
    ];
  }
}
