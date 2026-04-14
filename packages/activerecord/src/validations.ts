/**
 * Mirrors: ActiveRecord::Validations
 *
 * AR-specific validation module. Extends ActiveModel validations with
 * database-aware validators (uniqueness, association validity, etc.)
 * and overrides save/valid? to run validations with context awareness.
 */
import { ActiveRecordError } from "./errors.js";

// Re-export all validators matching Rails' require at bottom of validations.rb
export { AbsenceValidator } from "./validations/absence.js";
export { AssociatedValidator } from "./validations/associated.js";
export { LengthValidator } from "./validations/length.js";
export { NumericalityValidator } from "./validations/numericality.js";
export { PresenceValidator } from "./validations/presence.js";
export { UniquenessValidator } from "./validations/uniqueness.js";

/**
 * Mirrors: ActiveRecord::RecordInvalid
 *
 * Raised by save! and create! when the record is invalid.
 * Defined here matching Rails where it lives in validations.rb.
 */
export class RecordInvalid extends ActiveRecordError {
  readonly record: any;

  constructor(record: any) {
    const fullMessages = record.errors?.fullMessages;
    const message =
      Array.isArray(fullMessages) && fullMessages.length > 0
        ? `Validation failed: ${fullMessages.join(", ")}`
        : "Validation failed";
    super(message);
    this.name = "RecordInvalid";
    this.record = record;
  }
}

/**
 * Mirrors: ActiveRecord::Validations (module instance methods)
 */
export interface Validations {
  validate(context?: string): this;
  isValid(context?: string): boolean;
}

/**
 * Mirrors: ActiveRecord::Validations::ClassMethods
 */
export interface ValidationsClassMethods {
  validatesAbsenceOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesAssociated(...args: (string | Record<string, unknown>)[]): void;
  validatesLengthOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesSizeOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesNumericalityOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesPresenceOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesUniquenessOf(...attrNames: (string | Record<string, unknown>)[]): void;
}

// Reference to the parent class's isValid (Model.prototype.isValid).
// Set by Base at module load via _setSuperIsValid to avoid circular imports.
let _superIsValid: ((context?: string) => boolean) | null = null;

/** @internal Called by Base to register the super isValid for delegation. */
export function _setSuperIsValid(fn: (context?: string) => boolean): void {
  _superIsValid = fn;
}

/**
 * Mirrors: ActiveRecord::Validations#valid?
 *
 * Runs validations with automatic context (:create for new records,
 * :update for persisted). Sets _validationContext for the duration
 * matching Rails' with_validation_context.
 */
export function isValid(this: any, context?: string): boolean {
  const effectiveContext =
    context ?? this._validationContext ?? defaultValidationContext.call(this);
  if (_superIsValid == null) {
    throw new ActiveRecordError(
      "ActiveRecord::Validations#isValid called before Base registered the super isValid",
    );
  }
  const previousContext = this._validationContext;
  this._validationContext = effectiveContext;
  try {
    const result = _superIsValid.call(this, effectiveContext);
    return result && !this.errors.any;
  } finally {
    this._validationContext = previousContext;
  }
}

/**
 * Mirrors: ActiveRecord::Validations#validate (alias of valid?)
 */
export function validate(this: any, context?: string): any {
  isValid.call(this, context);
  return this;
}

/**
 * Mirrors: ActiveRecord::Validations#custom_validation_context?
 */
export function customValidationContext(this: any): boolean {
  const ctx = this._validationContext;
  return ctx != null && ctx !== "create" && ctx !== "update";
}

/**
 * Mirrors: ActiveRecord::Validations (private) #default_validation_context
 */
export function defaultValidationContext(this: any): string {
  return this.isNewRecord?.() || this._newRecord ? "create" : "update";
}

/**
 * Mirrors: ActiveRecord::Validations (private) #perform_validations
 */
export function performValidations(
  this: any,
  options?: { validate?: boolean; context?: string },
): boolean {
  if (options?.validate === false) return true;
  return this.isValid(options?.context);
}
