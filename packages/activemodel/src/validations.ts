import { Errors } from "./errors.js";
import type { ConditionalOptions } from "./validator.js";
import { I18n } from "./i18n.js";

import { raiseOnMissingTranslations as translationRaise } from "./translation.js";
import {
  _defineBeforeModelCallback as _defineBeforeModelCallbackImpl,
  _defineAroundModelCallback as _defineAroundModelCallbackImpl,
  _defineAfterModelCallback as _defineAfterModelCallbackImpl,
} from "./callbacks.js";

/**
 * Rails: ActiveModel::Validations does `extend ActiveModel::Callbacks`
 * (validations.rb:42), so the three private callback definers surface
 * on Validations as well. Re-expose them here so api-compare matches
 * the shape of `validations.rb` and so a host that mixes in only
 * Validations still has the helpers available.
 *
 * @internal Rails-private helper.
 */
export const _defineBeforeModelCallback = _defineBeforeModelCallbackImpl;

/**
 * @internal Rails-private helper.
 */
export const _defineAroundModelCallback = _defineAroundModelCallbackImpl;

/**
 * @internal Rails-private helper.
 */
export const _defineAfterModelCallback = _defineAfterModelCallbackImpl;

/**
 * Per-instance reset hook for validation state. Mirrors Rails
 * `ActiveModel::Validations#init_internals`
 * (activemodel/lib/active_model/validations.rb:467-471):
 *
 *   def init_internals
 *     super
 *     @errors = nil
 *     @context_for_validation = nil
 *   end
 *
 * Trails eagerly initializes `errors` (rather than Rails' lazy
 * `errors_or_create`), so this assigns a fresh `Errors` and clears
 * the active validation context. Called from the Model constructor.
 *
 * @internal Rails-private helper.
 */
export function initInternals(this: ValidationsInternalsHost): void {
  this.errors = new Errors(this);
  this._validationContext = null;
  this._contextForValidation = undefined;
}

/**
 * Host shape consumed by `initInternals`. Kept loose so any class with
 * the validation-related fields satisfies it without circular imports
 * back to `Model`.
 */
export interface ValidationsInternalsHost {
  errors: Errors;
  _validationContext: string | string[] | null;
  _contextForValidation?: ValidationContext;
}

/**
 * Rails: ActiveModel::Validations extends Translation (validations.rb:43),
 * so the singleton accessor surfaces on Validations directly. Mirror that
 * here so callers can read/write via `Validations.raiseOnMissingTranslations(...)`.
 */
export function raiseOnMissingTranslations(value?: boolean): boolean {
  return translationRaise(value);
}

/**
 * Validations mixin contract — provides the validation lifecycle.
 *
 * Mirrors: ActiveModel::Validations
 *
 * Model implements this interface: errors, isValid/isInvalid,
 * validate, validateBang, validationContext, validatesWith.
 */
export interface Validations {
  errors: Errors;
  isValid(context?: string | string[] | ValidationContext | null): boolean;
  /**
   * Run validations and return whether the record is valid.
   * Mirrors Rails `alias_method :validate, :valid?`
   * (activemodel/lib/active_model/validations.rb:370). Context may be a
   * single symbol or an array — Rails supports e.g.
   * `valid?([:create, :publish])` so a validator with `on: :publish`
   * fires alongside the usual `:create` context.
   */
  validate(context?: string | string[] | ValidationContext | null): boolean;
  /**
   * Opposite of `isValid`. Mirrors Rails `def invalid?(context = nil)`
   * (activemodel/lib/active_model/validations.rb:408-410).
   */
  isInvalid(context?: string | string[] | ValidationContext | null): boolean;
  /**
   * Run validations; return `true` or raise `ValidationError`. Mirrors Rails
   * `def validate!(context = nil); valid?(context) || raise_validation_error; end`
   * (activemodel/lib/active_model/validations.rb:417-419) — never returns false.
   */
  validateBang(context?: string | string[] | ValidationContext | null): true;
  /**
   * The active validation context — a single symbol, an array of
   * symbols, or `null`. Mirrors Rails `validations.rb:454-456` where
   * `validation_context` surfaces `context_for_validation.context`
   * directly (Symbol or Array of Symbols).
   */
  readonly validationContext: string | string[] | null;
}

/**
 * Mirrors: ActiveModel::Validations::ClassMethods
 */
export interface ValidationsClassMethods {
  validates(attribute: string, rules: Record<string, unknown>): void;
  validatesBang(attribute: string, rules: Record<string, unknown>): void;
  validate(methodOrFn: string | ((record: unknown) => void), options?: ConditionalOptions): void;
  validatesWith(
    validatorClass: {
      new (options?: Record<string, unknown>): { validate(record: unknown): void };
    },
    options?: Record<string, unknown>,
  ): void;
  validators(): unknown[];
  validatorsOn(attribute: string): unknown[];
  clearValidatorsBang(): void;
  isAttributeMethod(attribute: string): boolean;
  inherited(subclass: unknown): void;
}

/**
 * Raised by validateBang when validation fails.
 *
 * Mirrors: ActiveModel::ValidationError
 */
export class ValidationError extends globalThis.Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly model: any;

  // Mirrors Rails `ActiveModel::ValidationError#initialize`
  // (activemodel/lib/active_model/validations.rb:496-500):
  //
  //   def initialize(model)
  //     @model = model
  //     errors = @model.errors.full_messages.join(", ")
  //     super(I18n.t(:"#{@model.class.i18n_scope}.errors.messages.model_invalid",
  //                  errors: errors, default: :"errors.messages.model_invalid"))
  //   end
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(model: any) {
    const errors = model.errors.fullMessages.join(", ");
    // Match the guard used by `error.ts`'s I18n lookups — only treat
    // `i18nScope` as a scope when the class actually exposes a string.
    const rawScope = model.constructor?.i18nScope;
    const scope = typeof rawScope === "string" ? rawScope : "activemodel";
    const message = I18n.t(`${scope}.errors.messages.model_invalid`, {
      errors,
      defaults: [{ key: "errors.messages.model_invalid" }],
    });
    super(message);
    this.name = "ValidationError";
    this.model = model;
  }
}

/**
 * Holds the active validation context for a model. Mirrors Rails
 * `class ValidationContext; attr_accessor :context; end`
 * (activemodel/lib/active_model/validations.rb:503-505) — a thin
 * mutable holder whose `context` can be a single symbol or an Array
 * of symbols (see `predicate_for_validation_context`, :294-306).
 *
 * Kept backward-compatible: the old `new ValidationContext("create")`
 * still works and `.name` + `.toString()` continue to return the first
 * segment as a string. `.context` is now `string | string[] | null`.
 */
export class ValidationContext {
  private _context: string | string[] | null;

  constructor(context: string | string[] | null = null) {
    this._context = context;
  }

  get context(): string | string[] | null {
    return this._context;
  }

  set context(value: string | string[] | null) {
    this._context = value;
  }

  /**
   * First-segment string form of the current context — live getter so it
   * stays consistent with `.context` after mutation via the setter.
   * `""` when the context is null.
   */
  get name(): string {
    const c = this._context;
    return Array.isArray(c) ? (c[0] ?? "") : (c ?? "");
  }

  toString(): string {
    return this.name;
  }
}

/**
 * Module-level cache for predicate functions keyed by sorted context
 * arrays. Mirrors Rails `@@predicates_for_validation_contexts = {}`
 * (activemodel/lib/active_model/validations.rb:294) — a class variable
 * shared across all hosts that include Validations.
 *
 * @internal Rails-private state.
 */
const _predicatesForValidationContexts = new Map<
  string,
  (model: ValidationsContextHost) => boolean
>();

/**
 * Build a predicate that returns whether a model's
 * `validationContext` matches one of the supplied contexts. Used by
 * `validates(..., on: :create)` to gate a validator on the active
 * context. Mirrors Rails
 * `predicate_for_validation_context(context)`
 * (activemodel/lib/active_model/validations.rb:296-306).
 *
 * @internal Rails-private helper.
 */
export function predicateForValidationContext(
  context: string | string[],
): (model: ValidationsContextHost) => boolean {
  const arr = Array.isArray(context) ? [...context].sort() : [context];
  const key = JSON.stringify(arr);
  let cached = _predicatesForValidationContexts.get(key);
  if (!cached) {
    cached = (model: ValidationsContextHost): boolean => {
      const mc = model.validationContext;
      if (Array.isArray(mc)) {
        return mc.some((c) => arr.includes(c));
      }
      return mc !== null && mc !== undefined && arr.includes(mc);
    };
    _predicatesForValidationContexts.set(key, cached);
  }
  return cached;
}

/**
 * Host shape consumed by `predicateForValidationContext`.
 */
export interface ValidationsContextHost {
  readonly validationContext: string | string[] | null;
}

/**
 * Lazy per-instance accessor for the active `ValidationContext`.
 * Mirrors Rails
 * `def context_for_validation; @context_for_validation ||= ValidationContext.new; end`
 * (activemodel/lib/active_model/validations.rb:463-465). Trails stores
 * the active context as `_validationContext: string | string[] | null`
 * directly; this helper returns a `ValidationContext` whose
 * `.context` property is a live view of that field, so Rails' pattern
 * `context_for_validation.context = ctx` still works.
 *
 * @internal Rails-private helper.
 */
export function contextForValidation(this: ContextForValidationHost): ValidationContext {
  if (this._contextForValidation) return this._contextForValidation;
  const vc = Object.create(ValidationContext.prototype) as ValidationContext;
  // Override `context` and the underlying `_context` slot the
  // prototype's `name` getter reads. Both must be aliased so
  // `vc.name` / `vc.toString()` stay consistent with the live field.
  const accessor: PropertyDescriptor = {
    get: (): string | string[] | null => this._validationContext,
    set: (value: string | string[] | null): void => {
      this._validationContext = value;
    },
    configurable: true,
    enumerable: true,
  };
  Object.defineProperty(vc, "context", accessor);
  Object.defineProperty(vc, "_context", accessor);
  this._contextForValidation = vc;
  return vc;
}

/**
 * Host shape consumed by `contextForValidation`.
 */
export interface ContextForValidationHost {
  _validationContext: string | string[] | null;
  _contextForValidation?: ValidationContext;
}

/**
 * Run the `:validate` callbacks and report whether the model has no
 * errors. Mirrors Rails
 * `def run_validations!; _run_validate_callbacks; errors.empty?; end`
 * (activemodel/lib/active_model/validations.rb:473-476).
 *
 * @internal Rails-private helper.
 */
export function runValidationsBang(this: RunValidationsHost): boolean {
  this._runValidateCallbacks();
  return this.errors.empty;
}

/**
 * Host shape consumed by `runValidationsBang`.
 */
export interface RunValidationsHost {
  errors: Errors;
  _runValidateCallbacks(): void;
}

/**
 * Throw `ValidationError` for the current model. Mirrors Rails
 * `def raise_validation_error; raise(ValidationError.new(self)); end`
 * (activemodel/lib/active_model/validations.rb:478-480).
 *
 * @internal Rails-private helper.
 */
export function raiseValidationError(this: object): never {
  throw new ValidationError(this);
}

/**
 * Normalize the `validates_each` argument list, splitting attribute
 * names from the trailing options hash and stamping the merged
 * options with `attributes:`. Mirrors Rails
 * `Validations::HelperMethods#_merge_attributes`
 * (activemodel/lib/active_model/validations/helper_methods.rb:7-11).
 *
 * @internal Rails-private helper.
 */
export function _mergeAttributes(attrNames: unknown[]): Record<string, unknown> {
  const last = attrNames[attrNames.length - 1];
  const options: Record<string, unknown> =
    last !== null && typeof last === "object" && !Array.isArray(last) && last.constructor === Object
      ? { ...(attrNames.pop() as Record<string, unknown>) }
      : {};
  const flat = (attrNames as unknown[]).flat(Infinity).map((n) => String(n));
  options.attributes = flat;
  return options;
}

/**
 * The default option keys recognized by `validates(...)`. Subclasses
 * override to add custom keys. Mirrors Rails
 * `_validates_default_keys`
 * (activemodel/lib/active_model/validations/validates.rb:162-164).
 *
 * @internal Rails-private helper.
 */
export function _validatesDefaultKeys(): string[] {
  return ["if", "unless", "on", "allowBlank", "allowNil", "strict", "exceptOn"];
}

/**
 * Normalize a validator option value into the option hash the
 * validator constructor expects. Mirrors Rails
 * `_parse_validates_options(options)`
 * (activemodel/lib/active_model/validations/validates.rb:166-177):
 * `true` → `{}`, plain hash → unchanged, Range/Array → `{ in: options }`,
 * anything else → `{ with: options }`.
 *
 * @internal Rails-private helper.
 */
export function _parseValidatesOptions(options: unknown): Record<string, unknown> {
  if (options === true) return {};
  if (Array.isArray(options)) return { in: options };
  if (options !== null && typeof options === "object" && options.constructor === Object) {
    return options as Record<string, unknown>;
  }
  return { with: options };
}
