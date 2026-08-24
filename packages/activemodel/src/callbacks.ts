/**
 * Mirrors: ActiveModel::Callbacks (activemodel/lib/active_model/callbacks.rb)
 *
 * Ruby's `include ActiveSupport::Callbacks` (callbacks.rb:87) supplies
 * `set_callback` / `run_callbacks` and the whole chain engine; trails gets the
 * same members from `@blazetrails/activesupport`.
 */

import { NoMethodError } from "./attribute-assignment.js";
import {
  Value,
  kernelArray,
  type CallbackKind,
  assertValidKeys,
  extractOptionsBang,
  normalizeCallbackParams,
  type FilterListEntry,
  type DefineCallbacksOptions,
  defineCallbacks,
  setCallback,
} from "@blazetrails/activesupport";

/**
 * Creates beforeX(), afterX(), and/or aroundX() class methods for each event
 * name. Pass `{ only: ["before"] }` as the last argument to limit which
 * timing types are created (defaults to all three); every other option is
 * forwarded to `defineCallbacks`, as Rails does — including the default
 * `scope: [:kind, :name]` (callbacks.rb:113), which makes an object callback
 * registered by `beforeSave` dispatch to `beforeSave` rather than `before`.
 *
 * Mirrors: ActiveModel::Callbacks.define_model_callbacks
 * (activemodel/lib/active_model/callbacks.rb:109-127)
 */
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
    // `define_callbacks` registers on the prototype, where trails' instances
    // resolve the chain; Ruby's `self` here is the class itself.
    if (klass.prototype) defineCallbacks(klass.prototype, callback, options);

    for (const type of types) {
      const methodName = `_define_${String(type)}_model_callback`;
      const generator = _defineModelCallbackByType[methodName];
      // Ruby's `send` on an unknown name raises NoMethodError; a bare call of
      // the missing entry would surface a TypeError instead.
      if (!generator) {
        throw new NoMethodError(
          `undefined method '${methodName}' for class ${(this as { name?: string }).name}`,
        );
      }
      generator(this, callback);
    }
  }
}

/**
 * @noRailsEquivalent PERMANENT: stands in for `send("_define_#{type}_model_callback", ...)`
 *   (callbacks.rb:125) — TS has no `send`, and the three targets are
 *   module-private functions, not members of `this`. Keyed by the interpolated
 *   Ruby method name so an unknown `only:` entry misses exactly as `send` does.
 *   Not exported.
 */
const _defineModelCallbackByType: Record<string, (klass: CallbackHost, callback: string) => void> =
  {
    _define_before_model_callback: _defineBeforeModelCallback,
    _define_after_model_callback: _defineAfterModelCallback,
    _define_around_model_callback: _defineAroundModelCallback,
  };

/** Minimum shape required of a record object threaded through a callback chain. */
export type CallbackRecord = object;

export interface DefineModelCallbacksOptions extends DefineCallbacksOptions {
  only?: CallbackTiming | CallbackTiming[];
}

export interface CallbacksClassMethods {
  defineModelCallbacks(
    ...args: [string, ...string[]] | [string, ...string[], DefineModelCallbacksOptions]
  ): void;
}

export type Callbacks = CallbacksClassMethods;

export type CallbackTiming = CallbackKind;
export type CallbackFn = (record: CallbackRecord) => void | boolean | Promise<void | boolean>;
export type AroundCallbackFn = (
  record: CallbackRecord,
  proceed: () => void | Promise<void>,
) => void | Promise<void>;
/** Rails supports passing an object with callback-named methods. */
export type CallbackObject = object;
export interface RunCallbacksOptions {
  strict?: "sync";
}

/**
 * `if:` / `unless:` accept one filter or an array of them, and a filter is a
 * callable or a Symbol naming a method on the record — the shape Rails hands
 * straight to `set_callback` (validations.rb:160-185).
 *
 * The method-in-object indirection keeps `TRecord` bivariant, which the
 * `if?(record): boolean` method shorthand this replaced gave for free; a plain
 * function-property type makes every `CallbackConditions<Subclass>` unassignable
 * to `CallbackConditions<object>` under `strictFunctionTypes`.
 */
export type CallbackConditionFilter<TRecord = CallbackRecord> =
  | { _(record: TRecord, value?: unknown): boolean }["_"]
  | Value
  | string;

export interface CallbackConditions<TRecord = CallbackRecord> {
  if?: CallbackConditionFilter<TRecord> | Array<CallbackConditionFilter<TRecord>>;
  unless?: CallbackConditionFilter<TRecord> | Array<CallbackConditionFilter<TRecord>>;
  prepend?: boolean;
}

/** Extends CallbackConditions with the `on:` option available on commit/rollback callbacks. */
export interface TransactionalCallbackConditions<
  TRecord = CallbackRecord,
> extends CallbackConditions<TRecord> {
  on?: string | string[];
}

/**
 * Mirrors: ActiveModel::Callbacks#_define_before_model_callback (callbacks.rb:129-134)
 *
 * @internal Rails-private helper.
 */
export function _defineBeforeModelCallback(klass: CallbackHost, callback: string): void {
  Object.defineProperty(klass, `before${callback.charAt(0).toUpperCase()}${callback.slice(1)}`, {
    value: function (this: { prototype: object }, ...args: FilterListEntry[]) {
      const [, filters, options] = normalizeCallbackParams(["before", ...args], null);
      assertValidKeys(options as Record<string, unknown>, ["if", "unless", "prepend"]);
      setCallback(this.prototype, callback, "before", ...filters, options);
    },
    writable: true,
    configurable: true,
  });
}

type CallbackHost = object;

/**
 * Mirrors: ActiveModel::Callbacks#_define_around_model_callback (callbacks.rb:136-141)
 *
 * @internal Rails-private helper.
 */
export function _defineAroundModelCallback(klass: CallbackHost, callback: string): void {
  Object.defineProperty(klass, `around${callback.charAt(0).toUpperCase()}${callback.slice(1)}`, {
    value: function (this: { prototype: object }, ...args: FilterListEntry[]) {
      const [, filters, options] = normalizeCallbackParams(["around", ...args], null);
      assertValidKeys(options as Record<string, unknown>, ["if", "unless", "prepend"]);
      setCallback(this.prototype, callback, "around", ...filters, options);
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Mirrors: ActiveModel::Callbacks#_define_after_model_callback (callbacks.rb:143-153)
 *
 * @internal Rails-private helper.
 */
export function _defineAfterModelCallback(klass: CallbackHost, callback: string): void {
  Object.defineProperty(klass, `after${callback.charAt(0).toUpperCase()}${callback.slice(1)}`, {
    value: function (this: { prototype: object }, ...args: FilterListEntry[]) {
      const [, filters, options] = normalizeCallbackParams(["after", ...args], null);
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
