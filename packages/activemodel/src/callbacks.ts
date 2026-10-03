import { rbFSend } from "@blazetrails/ruby-compat";
import {
  Value,
  kernelArray,
  type CallbackKind,
  assertValidKeys,
  camelize,
  extractOptionsBang,
  type CallbackOptions,
  type FilterListEntry,
  type DefineCallbacksOptions,
  defineCallbacks,
  setCallback,
  Callbacks as ASCallbacks,
  include,
  extended,
} from "@blazetrails/activesupport";

type AnyClass = new (...args: never[]) => object;

export class Callbacks {
  static [extended](base: AnyClass): void {
    include(base, ASCallbacks);
  }

  static defineModelCallbacks = defineModelCallbacks;
  /** @internal */
  static _defineBeforeModelCallback = _defineBeforeModelCallback;
  /** @internal */
  static _defineAroundModelCallback = _defineAroundModelCallback;
  /** @internal */
  static _defineAfterModelCallback = _defineAfterModelCallback;
}

export function defineModelCallbacks(this: object, event: string, ...rest: string[]): void;
export function defineModelCallbacks(
  this: object,
  event: string,
  ...rest: [...string[], DefineModelCallbacksOptions]
): void;
export function defineModelCallbacks(this: object, ...args: unknown[]): void {
  const extracted = extractOptionsBang(args);
  const callbacks = args;
  let options = extracted as DefineModelCallbacksOptions;
  options = {
    skipAfterCallbacksIfTerminated: true,
    scope: ["kind", "name"],
    only: ["before", "around", "after"],
    ...options,
  };

  const types = kernelArray(options.only);
  delete options.only;

  const klass = this as { prototype?: object };

  for (const callback of callbacks as string[]) {
    if (klass.prototype) defineCallbacks(klass.prototype, callback, options);

    for (const type of types) {
      rbFSend(this, `_${camelize(`define_${type}_model_callback`, false)}`, this, callback);
    }
  }
}

export type CallbackRecord = object;

export interface DefineModelCallbacksOptions extends DefineCallbacksOptions {
  only?: CallbackTiming | CallbackTiming[];
}

export interface CallbacksClassMethods {
  defineModelCallbacks(
    ...args: [string, ...string[]] | [string, ...string[], DefineModelCallbacksOptions]
  ): void;
}

export type CallbackTiming = CallbackKind;
export type CallbackFn = (record: CallbackRecord) => void | boolean | Promise<void | boolean>;
export type AroundCallbackFn = (
  record: CallbackRecord,
  proceed: () => void | Promise<void>,
) => void | Promise<void>;
export type CallbackObject = object;
export interface RunCallbacksOptions {
  strict?: "sync";
}

export type CallbackConditionFilter<TRecord = CallbackRecord> =
  | { _(record: TRecord, value?: unknown): boolean }["_"]
  | Value
  | string;

export interface CallbackConditions<TRecord = CallbackRecord> {
  if?: CallbackConditionFilter<TRecord> | Array<CallbackConditionFilter<TRecord>>;
  unless?: CallbackConditionFilter<TRecord> | Array<CallbackConditionFilter<TRecord>>;
  prepend?: boolean;
}

export interface TransactionalCallbackConditions<
  TRecord = CallbackRecord,
> extends CallbackConditions<TRecord> {
  on?: string | string[];
}

/** @internal */
export function _defineBeforeModelCallback(klass: CallbackHost, callback: string): void {
  Object.defineProperty(klass, `before${callback.charAt(0).toUpperCase()}${callback.slice(1)}`, {
    value: function (this: { prototype: object }, ...args: FilterListEntry[]) {
      const options: CallbackOptions & CallbackConditions = { ...extractOptionsBang(args) };
      assertValidKeys(options as Record<string, unknown>, ["if", "unless", "prepend"]);
      setCallback(this.prototype, callback, "before", ...args, options);
    },
    writable: true,
    configurable: true,
  });
}

type CallbackHost = object;

/** @internal */
export function _defineAroundModelCallback(klass: CallbackHost, callback: string): void {
  Object.defineProperty(klass, `around${callback.charAt(0).toUpperCase()}${callback.slice(1)}`, {
    value: function (this: { prototype: object }, ...args: FilterListEntry[]) {
      const options: CallbackOptions & CallbackConditions = { ...extractOptionsBang(args) };
      assertValidKeys(options as Record<string, unknown>, ["if", "unless", "prepend"]);
      setCallback(this.prototype, callback, "around", ...args, options);
    },
    writable: true,
    configurable: true,
  });
}

/** @internal */
export function _defineAfterModelCallback(klass: CallbackHost, callback: string): void {
  Object.defineProperty(klass, `after${callback.charAt(0).toUpperCase()}${callback.slice(1)}`, {
    value: function (this: { prototype: object }, ...args: FilterListEntry[]) {
      const options: CallbackOptions & CallbackConditions = { ...extractOptionsBang(args) };
      assertValidKeys(options as Record<string, unknown>, ["if", "unless", "prepend"]);
      options.prepend = true;
      const conditional = new Value((v) => v !== false);
      options.if = [...kernelArray(options.if), conditional];
      setCallback(this.prototype, callback, "after", ...args, options);
    },
    writable: true,
    configurable: true,
  });
}
