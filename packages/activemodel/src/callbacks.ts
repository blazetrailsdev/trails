import { NoMethodError } from "./attribute-assignment.js";
import {
  Value,
  kernelArray,
  type CallbackKind,
  assertValidKeys,
  extractOptionsBang,
  type CallbackOptions,
  type FilterListEntry,
  type DefineCallbacksOptions,
  defineCallbacks,
  setCallback,
  Callbacks as ASCallbacks,
  extend,
  include,
  extended,
} from "@blazetrails/activesupport";

type AnyClass = new (...args: never[]) => object;

export class Callbacks {
  static [extended](base: AnyClass): void {
    include(base, ASCallbacks.InstanceMethods);
    extend(base, ASCallbacks.ClassMethods);
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
  const [callbacks, extracted] = extractOptionsBang(args);
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
      const methodName = `_define_${String(type)}_model_callback`;
      const generator = _defineModelCallbackByType[methodName];
      if (!generator) {
        throw new NoMethodError(
          `undefined method '${methodName}' for class ${(this as { name?: string }).name}`,
        );
      }
      generator(this, callback);
    }
  }
}

/** @noRailsEquivalent PERMANENT */
const _defineModelCallbackByType: Record<string, (klass: CallbackHost, callback: string) => void> =
  {
    _define_before_model_callback: _defineBeforeModelCallback,
    _define_after_model_callback: _defineAfterModelCallback,
    _define_around_model_callback: _defineAroundModelCallback,
  };

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
      const [filters, options] = extractMacroOptions(args);
      assertValidKeys(options as Record<string, unknown>, ["if", "unless", "prepend"]);
      setCallback(this.prototype, callback, "before", ...filters, options);
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
      const [filters, options] = extractMacroOptions(args);
      assertValidKeys(options as Record<string, unknown>, ["if", "unless", "prepend"]);
      setCallback(this.prototype, callback, "around", ...filters, options);
    },
    writable: true,
    configurable: true,
  });
}

/** @internal */
export function _defineAfterModelCallback(klass: CallbackHost, callback: string): void {
  Object.defineProperty(klass, `after${callback.charAt(0).toUpperCase()}${callback.slice(1)}`, {
    value: function (this: { prototype: object }, ...args: FilterListEntry[]) {
      const [filters, options] = extractMacroOptions(args);
      assertValidKeys(options as Record<string, unknown>, ["if", "unless", "prepend"]);
      options.prepend = true;
      const conditional = new Value((v) => v !== false);
      options.if = [...kernelArray(options.if), conditional];
      setCallback(this.prototype, callback, "after", ...filters, options);
    },
    writable: true,
    configurable: true,
  });
}

/** @noRailsEquivalent PERMANENT */
function extractMacroOptions(
  args: FilterListEntry[],
): [FilterListEntry[], CallbackOptions & CallbackConditions] {
  const last = args[args.length - 1];
  if (
    typeof last === "object" &&
    last !== null &&
    (Object.getPrototypeOf(last) === Object.prototype || Object.getPrototypeOf(last) === null) &&
    !Object.entries(last).some(([k, v]) => typeof v === "function" && k !== "if" && k !== "unless")
  ) {
    return [args.slice(0, -1), { ...(last as CallbackConditions) }];
  }
  return [args, {}];
}
