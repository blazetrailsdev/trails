import type { CallbackFn, CallbackConditions } from "../callbacks.js";

/**
 * Validation callbacks — before_validation / after_validation hooks.
 *
 * Mirrors: ActiveModel::Validations::Callbacks
 *
 * In Rails this module adds before_validation and after_validation
 * class methods. Model already implements these via beforeValidation()
 * and afterValidation() which delegate to CallbackChain.
 */
export interface CallbacksClassMethods {
  beforeValidation(fn: CallbackFn, conditions?: CallbackConditions): void;
  afterValidation(fn: CallbackFn, conditions?: CallbackConditions): void;
}

export interface CallbacksInstanceMethods {
  /** @internal Rails-private helper. */
  runValidationsBang(): boolean;
}

export type Callbacks = CallbacksClassMethods & CallbacksInstanceMethods;

type Conditional = ((record: unknown) => boolean) | string;

interface CallbackOptions {
  on?: string | string[] | null;
  if?: Conditional | Conditional[];
  unless?: Conditional | Conditional[];
}

interface CallbackHostRecord {
  validationContext?: string | string[] | null;
}

/**
 * Mirrors: callbacks.rb:99-110
 *   def set_options_for_callback(options)
 *     if options.key?(:on)
 *       options[:on] = Array(options[:on])
 *       options[:if] = [
 *         ->(o) { options[:on].intersect?(Array(o.validation_context)) },
 *         *options[:if]
 *       ]
 *     end
 *   end
 *
 * When `on:` is supplied, normalize it to an array and prepend a
 * context-intersection guard to `if:` so the callback only runs in
 * the requested validation context(s). Mutates the options hash in
 * place to match Rails.
 *
 * @internal Rails-private helper.
 */
export function setOptionsForCallback(options: CallbackOptions): void {
  if (!Object.prototype.hasOwnProperty.call(options, "on")) return;
  // Ruby `Array(nil)` produces `[]` — treat both undefined and null
  // the same, so `on: null` doesn't accidentally match a `null`
  // validation context.
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

/**
 * Mirrors: callbacks.rb:113-115
 *   def run_validations!
 *     _run_validation_callbacks { super }
 *   end
 *
 * The interface declaration above adds `runValidationsBang()` to the
 * Callbacks contract — host classes that want before/after validation
 * dispatch implement the method to wrap their underlying validation
 * pass in the callback chain. This export documents the Rails surface
 * and gives downstream hosts a typed reference for that
 * callback-wrapping behavior.
 *
 * @internal Rails-private helper.
 */
export function runValidationsBang(this: {
  _runValidationCallbacks?: (block: () => boolean) => boolean;
  runValidations?: () => boolean;
}): boolean {
  const block = (): boolean => {
    if (typeof this.runValidations === "function") return this.runValidations();
    return true;
  };
  if (typeof this._runValidationCallbacks === "function") {
    return this._runValidationCallbacks(block);
  }
  return block();
}
