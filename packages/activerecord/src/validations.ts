/**
 * Mirrors: ActiveRecord::Validations
 *
 * AR-specific validation module. Extends ActiveModel validations with
 * database-aware validators (uniqueness, association validity, etc.)
 * and overrides save/valid? to run validations with context awareness.
 */
import type { ValidationContext } from "@blazetrails/activemodel";
import { I18n } from "@blazetrails/activemodel";
import { ActiveRecordError } from "./errors.js";

/**
 * Anything Rails' `valid?(context = nil)` accepts — shared between
 * AM's `Model.isValid` and AR's `valid?` override so the signatures
 * stay substitutable.
 */
export type ValidationContextArg = string | string[] | ValidationContext | null;
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
    let message: string;
    if (record) {
      const errors = (record.errors?.fullMessages as string[] | undefined)?.join(", ") ?? "";
      message = I18n.t("activerecord.errors.messages.record_invalid", {
        errors,
        defaults: [{ key: "errors.messages.record_invalid" }],
        defaultValue: "Validation failed: %{errors}",
      });
    } else {
      message = "Record invalid";
    }
    super(message);
    this.name = "RecordInvalid";
    this.record = record;
  }
}

/**
 * Mirrors: ActiveRecord::Validations (module instance methods)
 */
export interface Validations {
  /**
   * Run validations and return whether the record is valid. AR inherits
   * AM's alias `validate → valid?`
   * (activemodel/lib/active_model/validations.rb:370).
   */
  validate(context?: ValidationContextArg): boolean;
  isValid(context?: ValidationContextArg): boolean;
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

/** Minimal instance-side surface used by Validations instance helpers. */
interface ValidationsHost {
  _validationContext?: ValidationContextArg;
  isNewRecord?(): boolean;
  _newRecord?: boolean;
  errors: { any: boolean };
  isValid(context?: ValidationContextArg): boolean;
  _associationCache?(name: string): { target?: unknown } | undefined;
  _preloadedAssociations?: { get?(name: string): unknown };
  _collectionProxies?: { get?(name: string): unknown };
  association?(name: string): { loaded?: boolean; target?: unknown } | undefined;
  readAttribute(name: string): unknown;
}

// Reference to the parent class's isValid (Model.prototype.isValid).
// Set by Base at module load via _setSuperIsValid to avoid circular imports.
let _superIsValid: ((context?: ValidationContextArg) => boolean) | null = null;

/** @internal Called by Base to register the super isValid for delegation. */
export function _setSuperIsValid(fn: (context?: ValidationContextArg) => boolean): void {
  _superIsValid = fn;
}

/**
 * Mirrors: ActiveRecord::Validations#valid?
 *
 * Runs validations with automatic context (:create for new records,
 * :update for persisted). Sets _validationContext for the duration
 * matching Rails' with_validation_context.
 */
export function isValid(this: ValidationsHost, context?: ValidationContextArg): boolean {
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
 * Mirrors: ActiveRecord::Validations#validate — inherited alias of `valid?`
 * (activemodel/lib/active_model/validations.rb:370).
 */
export function validate(this: ValidationsHost, context?: ValidationContextArg): boolean {
  return isValid.call(this, context);
}

/**
 * Mirrors: ActiveRecord::Validations#custom_validation_context?
 */
export function customValidationContext(this: ValidationsHost): boolean {
  const ctx = this._validationContext;
  return ctx != null && ctx !== "create" && ctx !== "update";
}

/**
 * Mirrors: ActiveRecord::Validations (private) #default_validation_context
 *
 * @internal
 */
export function defaultValidationContext(this: ValidationsHost): string {
  return this.isNewRecord?.() || this._newRecord ? "create" : "update";
}

/**
 * Mirrors: ActiveRecord::Validations (private) #perform_validations
 *
 * @internal
 */
export function performValidations(
  this: ValidationsHost,
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
export function readAttributeForValidation(this: ValidationsHost, attribute: string): unknown {
  // A loaded collection proxy (incl. in-memory built records on an unloaded
  // proxy) is the canonical has_many target; check it before the holder so an
  // unsaved `record.collection << x` is seen.
  const proxy = this._collectionProxies?.get?.(attribute) as
    | { loaded?: boolean; target?: unknown[] }
    | undefined;
  if (
    proxy &&
    (proxy.loaded === true || (Array.isArray(proxy.target) && proxy.target.length > 0))
  ) {
    return proxy.target;
  }
  // RFC 0022: a loaded singular target lives on the SingularAssociation
  // holder; `association(name)` hydrates it from any loaded proxy / preload,
  // so the loaded target is read through the holder.
  if (typeof this.association === "function") {
    try {
      const assoc = this.association(attribute);
      if (assoc && (assoc.loaded === true || assoc.target != null)) return assoc.target;
    } catch {
      // Not a declared association — fall through.
    }
  }
  // Undeclared in-memory seeds (FakeTopic/FakeReply test fixtures) live on the
  // association cache (`_associationCache`, Rails' `@association_cache`), keyed
  // by the undeclared name and surfaced through `.target`.
  const cached = this._associationCache?.(attribute)?.target;
  if (cached !== undefined) return cached;
  const preloaded = this._preloadedAssociations?.get?.(attribute);
  if (preloaded !== undefined) return preloaded;
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

/**
 * Throws `RecordInvalid` for the given record. Used by `save!` / `create!`
 * to convert a failed validation into an exception.
 *
 * Mirrors: ActiveRecord::Validations#raise_validation_error
 *
 * @internal
 */
export function raiseValidationError(record: unknown): never {
  throw new RecordInvalid(record);
}
