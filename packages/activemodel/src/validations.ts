import type { Errors } from "./errors.js";
import type { ConditionalOptions } from "./validator.js";

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
  validate(context?: string | ValidationContext): this;
  isInvalid(): boolean;
  validateBang(context?: string | ValidationContext): boolean;
  readonly validationContext: string | ValidationContext | null;
}

/**
 * Mirrors: ActiveModel::Validations::ClassMethods
 */
export interface ValidationsClassMethods {
  validates(attribute: string, rules: Record<string, unknown>): void;
  validate(methodOrFn: string | ((record: unknown) => void), options?: ConditionalOptions): void;
  validatesWith(
    validatorClass: {
      new (options?: Record<string, unknown>): { validate(record: unknown): void };
    },
    options?: Record<string, unknown>,
  ): void;
  validators(): unknown[];
  validatorsOn(attribute: string): unknown[];
}

/**
 * Raised by validateBang when validation fails.
 *
 * Mirrors: ActiveModel::ValidationError
 */
export class ValidationError extends globalThis.Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly model: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(model: any) {
    super(`Validation failed: ${model.errors.fullMessages.join(", ")}`);
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

  toString(): string {
    return this.name;
  }
}
