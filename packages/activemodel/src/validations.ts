import type { Errors } from "./errors.js";
import type { ConditionalOptions } from "./validator.js";
import { I18n } from "./i18n.js";

import { raiseOnMissingTranslations as translationRaise } from "./translation.js";

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
