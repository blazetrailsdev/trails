import type { Errors } from "./errors.js";
import type { ConditionalOptions } from "./validator.js";
import { I18n } from "./i18n.js";

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
  isValid(context?: string | ValidationContext): boolean;
  /**
   * Run validations and return whether the record is valid.
   * Mirrors Rails `alias_method :validate, :valid?`
   * (activemodel/lib/active_model/validations.rb:370).
   */
  validate(context?: string | ValidationContext): boolean;
  /**
   * Opposite of `isValid`. Mirrors Rails `def invalid?(context = nil)`
   * (activemodel/lib/active_model/validations.rb:408-410).
   */
  isInvalid(context?: string | ValidationContext): boolean;
  /**
   * Run validations; return `true` or raise `ValidationError`. Mirrors Rails
   * `def validate!(context = nil); valid?(context) || raise_validation_error; end`
   * (activemodel/lib/active_model/validations.rb:417-419) — never returns false.
   */
  validateBang(context?: string | ValidationContext): true;
  readonly validationContext: string | ValidationContext | null;
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
 * Represents a named validation context (e.g., :create, :update).
 *
 * Mirrors: ActiveModel::ValidationContext
 */
export class ValidationContext {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }

  get context(): string {
    return this.name;
  }

  toString(): string {
    return this.name;
  }
}
