/**
 * Mirrors: ActiveRecord::Validations
 *
 * AR-specific validation module. Extends ActiveModel validations with
 * database-aware validators (uniqueness, association validity, etc.)
 * and overrides save/valid? to run validations with context awareness.
 */
import { ActiveRecordError } from "./errors.js";
import { AbsenceValidator } from "./validations/absence.js";
import { AssociatedValidator, validatesAssociated } from "./validations/associated.js";
import { LengthValidator } from "./validations/length.js";
import { NumericalityValidator } from "./validations/numericality.js";
import { PresenceValidator } from "./validations/presence.js";
import { UniquenessValidator, validatesUniqueness } from "./validations/uniqueness.js";

// Re-export validators (matching Rails' requires at the bottom of validations.rb)
// plus the validator-adjacent ClassMethods registrars that Rails colocates
// with each validator (validates_associated / validates_uniqueness_of).
export {
  AbsenceValidator,
  AssociatedValidator,
  LengthValidator,
  NumericalityValidator,
  PresenceValidator,
  UniquenessValidator,
  validatesAssociated,
  validatesUniqueness,
};

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

/**
 * Mirrors: ActiveModel::Validations#read_attribute_for_validation
 *
 * Rails aliases this to `send`, so calling it with an association name
 * returns the association target (loaded records). We resolve from
 * association caches first, falling back to readAttribute for regular
 * columns.
 */
export function readAttributeForValidation(this: any, attribute: string): unknown {
  const cached = this._cachedAssociations?.get?.(attribute);
  if (cached !== undefined) return cached;
  const preloaded = this._preloadedAssociations?.get?.(attribute);
  if (preloaded !== undefined) return preloaded;
  const proxy = this._collectionProxies?.get?.(attribute);
  if (
    proxy &&
    (proxy.loaded === true || (Array.isArray(proxy.target) && proxy.target.length > 0))
  ) {
    return proxy.target;
  }
  if (typeof this.association === "function") {
    try {
      const assoc = this.association(attribute);
      if (assoc?.loaded === true && assoc.target !== undefined) return assoc.target;
    } catch {
      // Not an association — fall through
    }
  }
  return this.readAttribute(attribute);
}

// ---------------------------------------------------------------------------
// Class methods — Mirrors ActiveRecord::Validations::ClassMethods.
// Wired onto Base via extend(Base, Validations.ClassMethods) in base.ts.
// ---------------------------------------------------------------------------

// Options passed alongside any validator: on/if/unless/strict plus
// allowNil/allowBlank that are shared across all validators.
function extractShared(rules: Record<string, unknown>): Record<string, unknown> {
  const shared: Record<string, unknown> = {};
  if (rules.on !== undefined) shared.on = rules.on;
  if (rules.if !== undefined) shared.if = rules.if;
  if (rules.unless !== undefined) shared.unless = rules.unless;
  if (rules.strict) shared.strict = rules.strict;
  if (rules.allowNil !== undefined) shared.allowNil = rules.allowNil;
  if (rules.allowBlank !== undefined) shared.allowBlank = rules.allowBlank;
  return shared;
}

/**
 * Route AR-specific rules (presence/absence/length/numericality) through AR
 * validator classes that add association/column awareness, and delegate the
 * rest (inclusion/exclusion/format/...) to ActiveModel's `validates`.
 *
 * Mirrors: ActiveRecord::Validations::ClassMethods#validates (the override
 * over ActiveModel::Validations::ClassMethods#validates).
 */
export function validates(
  this: {
    validatesWith(validatorClass: unknown, opts: Record<string, unknown>): void;
    // The Model.validates class method is reached via _parentValidates,
    // registered by Base at module load via _setSuperValidates.
  },
  attribute: string,
  rules: Record<string, unknown>,
): void {
  const arRules = { ...rules };
  const shared = extractShared(arRules);
  const { allowNil: sharedAllowNil, allowBlank: sharedAllowBlank, ...sharedRest } = shared;

  const buildOpts = (opts: Record<string, unknown>) => ({
    ...opts,
    attributes: [attribute],
    ...sharedRest,
    ...(opts.allowNil === undefined && sharedAllowNil !== undefined
      ? { allowNil: sharedAllowNil }
      : {}),
    ...(opts.allowBlank === undefined && sharedAllowBlank !== undefined
      ? { allowBlank: sharedAllowBlank }
      : {}),
  });

  if (arRules.presence) {
    const opts = arRules.presence === true ? {} : (arRules.presence as Record<string, unknown>);
    delete arRules.presence;
    this.validatesWith(PresenceValidator, buildOpts(opts));
  }
  if (arRules.absence) {
    const opts = arRules.absence === true ? {} : (arRules.absence as Record<string, unknown>);
    delete arRules.absence;
    this.validatesWith(AbsenceValidator, buildOpts(opts));
  }
  if (arRules.length) {
    const opts = arRules.length as Record<string, unknown>;
    delete arRules.length;
    this.validatesWith(LengthValidator, buildOpts(opts));
  }
  if (arRules.numericality) {
    const opts =
      arRules.numericality === true ? {} : (arRules.numericality as Record<string, unknown>);
    delete arRules.numericality;
    this.validatesWith(NumericalityValidator, buildOpts(opts));
  }
  // Delegate remaining rules (inclusion/exclusion/format/...) to ActiveModel's validates.
  const hasRemaining = Object.keys(arRules).some(
    (k) => !["on", "if", "unless", "strict", "allowNil", "allowBlank"].includes(k),
  );
  if (hasRemaining) {
    if (_parentValidates == null) {
      throw new ActiveRecordError(
        "ActiveRecord::Validations#validates called before Base registered the super validates",
      );
    }
    // `super.validates` — delegate to Model's `validates` class method.
    _parentValidates.call(this, attribute, arRules);
  }
}

// Late-bound reference to Model's `validates` class method — registered by
// Base to break the circular-import chain.
let _parentValidates:
  | ((this: unknown, attribute: string, rules: Record<string, unknown>) => void)
  | null = null;

/** @internal Called by Base to register Model's validates as the super. */
export function _setSuperValidates(
  fn: (this: unknown, attribute: string, rules: Record<string, unknown>) => void,
): void {
  _parentValidates = fn;
}

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 * Mirrors Rails' `ActiveRecord::Validations::ClassMethods` / `ActiveSupport::Concern#ClassMethods`.
 * `validatesAssociated` and `validatesUniqueness` live next to their
 * validator classes in validations/associated.ts and validations/uniqueness.ts
 * matching Rails' file layout.
 */
export const ClassMethods = {
  validates,
  validatesAssociated,
  validatesUniqueness,
};
