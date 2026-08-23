import type { CallbackConditions, CallbackObject } from "../callbacks.js";
import type { Model } from "../model.js";

/**
 * Validation callbacks — before_validation / after_validation hooks.
 *
 * Mirrors: ActiveModel::Validations::Callbacks
 *
 * The module's `ClassMethods` half below carries `before_validation` /
 * `after_validation`; `Model` picks both up through the `extend(Model, …)` at
 * the bottom of model.ts.
 */
/**
 * The class-method half of `ActiveModel::Validations::Callbacks`
 * (callbacks.rb:32-110), mixed onto the host with `extend()`. Ruby's
 * `args.extract_options!` (callbacks.rb:56, :89) is the splat mechanics of a
 * trailing options Hash; TypeScript spells that as the trailing `options`
 * parameter every other trails callback macro takes.
 */
export const ClassMethods = {
  /** Mirrors: ActiveModel::Validations::Callbacks::ClassMethods#before_validation (callbacks.rb:55-61). */
  beforeValidation<T extends typeof Model>(
    this: T,
    fn: ValidationCallbackFilter<T>,
    options: ValidationCallbackOptions = {},
  ): void {
    setOptionsForCallback(options);

    this.setCallback("validation", "before", fn, options as CallbackConditions);
  },

  /** Mirrors: ActiveModel::Validations::Callbacks::ClassMethods#after_validation (callbacks.rb:88-96). */
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

/**
 * What the two macros take as a filter. Rails' `*args` reaches `set_callback`,
 * so a Symbol method name is accepted alongside a block (callbacks.rb:43, :73)
 * — and a Ruby Symbol is a colon-prefixed string in trails.
 */
export type ValidationCallbackFilter<T extends typeof Model> =
  | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
  | CallbackObject
  | string;

export interface CallbacksInstanceMethods {
  /** @internal Rails-private helper. */
  runValidationsBang(): Promise<boolean>;
}

export type Callbacks = typeof ClassMethods & CallbacksInstanceMethods;

type Conditional = ((record: unknown) => boolean) | string;

interface CallbackOptions {
  on?: string | string[] | null;
  if?: Conditional | Conditional[];
  unless?: Conditional | Conditional[];
}

/**
 * The options `before_validation` / `after_validation` accept. Unlike the
 * generic callback options these also take `on:`, which
 * {@link setOptionsForCallback} converts into an `:if` over the record's
 * current `validation_context` (callbacks.rb:99-109).
 */
export type ValidationCallbackOptions = CallbackOptions & { prepend?: boolean };

interface CallbackHostRecord {
  validationContext?: string | string[] | null;
}

/** @internal Host shape for the callbacks-wrapping `runValidationsBang` override. */
export interface RunValidationsBangHost {
  _runValidationCallbacks?: (block: () => boolean | Promise<boolean>) => boolean | Promise<boolean>;
  runValidations?: () => boolean | Promise<boolean>;
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
