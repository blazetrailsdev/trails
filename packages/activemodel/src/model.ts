import { Errors, StrictValidationFailed } from "./errors.js";
import { ValidationError, ValidationContext } from "./validations.js";
import { humanize, underscore, dasherize, htmlEscape } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { I18n } from "./i18n.js";
import { Type } from "./type/value.js";
import { AttributeSet } from "./attribute-set.js";
import { ModelName } from "./naming.js";
import { DirtyTracker } from "./dirty.js";
import {
  CallbackChain,
  CallbackFn,
  AroundCallbackFn,
  type CallbackObject,
  CallbackConditions,
  type RunCallbacksOptions,
  defineModelCallbacks,
} from "./callbacks.js";
import { serializableHash, SerializeOptions, coerceForJson } from "./serialization.js";
import { BlockValidator, EachValidator, Validator as ValidatorBase } from "./validator.js";

/**
 * Anything `validates_with` accepts: a full `Validator`/`EachValidator`
 * subclass, or any class that just implements `validate(record)`. Used by
 * `_validators` / `validators()` / `validatorsOn()` so the stored value
 * type matches what we actually accept at registration.
 */
type ValidatorLike = ValidatorBase | EachValidator | { validate(record: AnyRecord): void };
import {
  AttributeMethodPattern,
  attributeMethodPrefix,
  attributeMethodSuffix,
  attributeMethodAffix,
  aliasAttribute,
  resolveAliasName,
  undefineAttributeMethods,
  attributeMissing,
} from "./attribute-methods.js";
import {
  assignAttributes as assignAttrs,
  attributeWriterMissing as defaultAttributeWriterMissing,
  ArgumentError,
} from "./attribute-assignment.js";
import type { ConditionalOptions, ConditionFn, AnyRecord } from "./validator.js";
import { evaluateCondition } from "./validator.js";
import { PresenceValidator } from "./validations/presence.js";
import { AbsenceValidator } from "./validations/absence.js";
import { LengthValidator } from "./validations/length.js";
import { NumericalityValidator } from "./validations/numericality.js";
import { InclusionValidator } from "./validations/inclusion.js";
import { ExclusionValidator } from "./validations/exclusion.js";
import { FormatValidator } from "./validations/format.js";
import { AcceptanceValidator } from "./validations/acceptance.js";
import { ConfirmationValidator } from "./validations/confirmation.js";
import { ComparisonValidator } from "./validations/comparison.js";
import { type AttributeDefinition, attribute } from "./attributes.js";
import {
  _defaultAttributes,
  attributeTypes,
  typeForAttribute as staticTypeForAttribute,
  decorateAttributes,
} from "./attribute-registration.js";
import { _toPartialPath } from "./conversion.js";

/**
 * Model — the base class that bundles Attributes, Validations, Callbacks,
 * Dirty tracking, Serialization, and Naming.
 *
 * Mirrors: ActiveModel::Model (with all the included modules)
 */
export class Model {
  // Allow dynamic attribute access (e.g., record.title) for properties
  // defined at runtime via Model.attribute().
  [key: string]: unknown;

  // -- Class-level registries --
  static includeRootInJson: boolean | string = false;
  // Rails: class_attribute :param_delimiter, instance_reader: false, default: "-"
  // (activemodel/lib/active_model/conversion.rb:32)
  static paramDelimiter: string = "-";
  static _attributeDefinitions: Map<string, AttributeDefinition> = new Map();
  static _attributeMethodPatterns: AttributeMethodPattern[] = [];
  static _attributeAliases: Record<string, string> = {};
  static _aliasesByAttributeName: Map<string, string[]> = new Map();
  static _generatedMethods: Set<string> = new Set();
  // Rails: `class_attribute :_validators, … default: Hash.new { |h, k| h[k] = [] }`
  // (activemodel/lib/active_model/validations.rb:50). Map keyed by attribute
  // name (or `null` for validators registered without `attributes:`); O(1)
  // `validatorsOn(attr)` via direct bucket lookup.
  //
  // Subclass isolation is copy-on-first-write rather than Rails'
  // eager-on-`inherited`. JS has no `inherited` hook that fires when a
  // subclass is defined, so we defer the dup until the subclass first
  // writes (see `_ensureOwnValidators`). Behavioral consequence: if a
  // subclass never registers its own validator, it keeps reading through
  // the prototype chain and will see validators the parent adds *after*
  // the subclass was defined. Identical in all cases where a subclass
  // registers at least one validator (the standard pattern for
  // `static { this.validates(...) }` blocks at class-definition time);
  // only the "defined but never written to" window diverges from Rails.
  static _validators: Map<string | null, Array<ValidatorLike>> = new Map();
  static _callbackChain: CallbackChain = new CallbackChain();
  private static _modelName: ModelName | null = null;

  // -- Attributes (Phase 1000) --

  static attribute = attribute;
  static _defaultAttributes = _defaultAttributes;
  static decorateAttributes = decorateAttributes;
  static attributeTypes = attributeTypes;
  static typeForAttribute = staticTypeForAttribute;
  static _toPartialPath = _toPartialPath;

  static attributeNames(): string[] {
    return Array.from(this._attributeDefinitions.entries())
      .filter(([, def]) => !def.virtual)
      .map(([name]) => name);
  }

  /**
   * Create an alias for an existing attribute.
   *
   * Mirrors: ActiveModel::AttributeMethods.alias_attribute
   */
  static aliasAttribute = aliasAttribute;

  // -- Normalizations --
  static _normalizations: Map<
    string,
    { fns: Array<(value: unknown) => unknown>; applyToNil: boolean }
  > = new Map();

  /**
   * Register a normalization function for one or more attributes.
   * The function is called before validation on every write.
   *
   * Mirrors: ActiveRecord::Base.normalizes (Rails 7.1+)
   *
   * Example:
   *   User.normalizes("email", (v) => typeof v === "string" ? v.trim().toLowerCase() : v);
   */
  static normalizes(
    ...args: [...string[], ((value: unknown) => unknown) | Record<string, unknown>]
  ): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_normalizations")) {
      // Deep copy parent normalizations for stacking
      this._normalizations = new Map();
      const parent = Object.getPrototypeOf(this) as typeof Model;
      if (parent._normalizations) {
        for (const [k, v] of parent._normalizations) {
          this._normalizations.set(k, { fns: [...v.fns], applyToNil: v.applyToNil });
        }
      }
    }

    // Parse args: attributes..., fn, [options]
    let options: Record<string, unknown> = {};
    let fn: (value: unknown) => unknown;
    const lastArg = args[args.length - 1];
    if (typeof lastArg === "object" && lastArg !== null && !Array.isArray(lastArg)) {
      options = lastArg as Record<string, unknown>;
      fn = args[args.length - 2] as (value: unknown) => unknown;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args = args.slice(0, -2) as any;
    } else {
      fn = lastArg as (value: unknown) => unknown;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args = args.slice(0, -1) as any;
    }
    const attributes = args as unknown as string[];
    const applyToNil = !!options.applyToNil;

    for (const attr of attributes) {
      const existing = this._normalizations.get(attr);
      if (existing) {
        // Stack: add new normalizer after existing ones
        existing.fns.push(fn);
        if (applyToNil) existing.applyToNil = true;
      } else {
        this._normalizations.set(attr, { fns: [fn], applyToNil });
      }
    }
  }

  /**
   * Apply the normalization for a single attribute (re-normalize in place).
   * Mirrors: ActiveRecord::Base#normalize_attribute
   */
  normalizeAttribute(name: string): void {
    const ctor = this.constructor as typeof Model;
    const current = this.readAttribute(name);
    const normalized = ctor._applyNormalization(name, current);
    if (normalized !== current) {
      this._attributes.writeCastValue(name, normalized);
    }
  }

  /**
   * Normalize a value for a given attribute without a record.
   * Mirrors: ActiveRecord::Base.normalize_value_for
   */
  static normalizeValueFor(name: string, value: unknown): unknown {
    const def = this._attributeDefinitions.get(name);
    const result = def ? def.type.cast(value) : value;
    return this._applyNormalization(name, result);
  }

  /**
   * Apply all normalizations for the given attribute.
   */
  static _applyNormalization(name: string, value: unknown): unknown {
    const norm = this._normalizations.get(name);
    if (!norm) return value;
    if (value == null && !norm.applyToNil) return value;
    let result = value;
    for (const fn of norm.fns) {
      result = fn(result);
    }
    return result;
  }

  /**
   * Auto-nullify blank string values for specified attributes (or all string attributes).
   * A blank value is an empty string or whitespace-only string.
   *
   * Mirrors: Rails pattern of normalizing blank strings to nil
   *
   * Usage:
   *   User.nullifyBlanks("name", "email")  // specific attributes
   *   User.nullifyBlanks()                 // all string attributes
   */
  static nullifyBlanks(...attributes: string[]): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_nullifyBlanks")) {
      this._nullifyBlanks = attributes.length > 0 ? [...attributes] : true;
    } else {
      if (attributes.length > 0) {
        if (Array.isArray(this._nullifyBlanks)) {
          this._nullifyBlanks.push(...attributes);
        } else {
          this._nullifyBlanks = [...attributes];
        }
      } else {
        this._nullifyBlanks = true;
      }
    }
  }
  static _nullifyBlanks: string[] | true | false = false;

  /**
   * Apply common options to multiple validation/callback calls.
   *
   * Mirrors: ActiveSupport::OptionMerger / with_options
   *
   * Usage:
   *   User.withOptions({ if: (r) => r.readAttribute("active") }, (m) => {
   *     m.validates("name", { presence: true });
   *     m.validates("email", { presence: true });
   *   });
   */
  static withOptions(defaults: Record<string, unknown>, fn: (model: typeof Model) => void): void {
    // Create a proxy that merges defaults into validates() calls
    const proxy = new Proxy(this, {
      get(target: AnyRecord, prop: string | symbol) {
        if (prop === "validates") {
          return (attr: string, rules: Record<string, unknown>) => {
            target.validates(attr, { ...defaults, ...rules });
          };
        }
        return target[prop];
      },
    });
    fn(proxy);
  }

  // -- Validations (Phase 1100) --

  static validates(attribute: string, rules: Record<string, unknown>): void {
    const onContext = rules.on as string | undefined;
    const ifCond = rules.if as ConditionFn | ConditionFn[] | undefined;
    const unlessCond = rules.unless as ConditionFn | ConditionFn[] | undefined;
    const isStrict = rules.strict as boolean | undefined;
    const sharedAllowNil = rules.allowNil as boolean | undefined;
    const sharedAllowBlank = rules.allowBlank as boolean | undefined;

    const shared: Record<string, unknown> = {};
    if (onContext !== undefined) shared.on = onContext;
    if (ifCond !== undefined) shared.if = ifCond;
    if (unlessCond !== undefined) shared.unless = unlessCond;
    if (isStrict) shared.strict = true;

    const validatorSpecs: Array<{
      klass: new (options: Record<string, unknown>) => ValidatorBase;
      opts: Record<string, unknown>;
    }> = [];

    if (rules.presence) {
      const opts = rules.presence === true ? {} : (rules.presence as AnyRecord);
      validatorSpecs.push({ klass: PresenceValidator, opts });
    }

    if (rules.absence) {
      const opts = rules.absence === true ? {} : (rules.absence as AnyRecord);
      validatorSpecs.push({ klass: AbsenceValidator, opts });
    }

    if (rules.length) {
      const opts = { ...(rules.length as AnyRecord) };
      if (sharedAllowNil !== undefined && opts.allowNil === undefined)
        opts.allowNil = sharedAllowNil;
      if (sharedAllowBlank !== undefined && opts.allowBlank === undefined)
        opts.allowBlank = sharedAllowBlank;
      validatorSpecs.push({ klass: LengthValidator, opts });
    }

    if (rules.numericality) {
      const opts = rules.numericality === true ? {} : { ...(rules.numericality as AnyRecord) };
      if (sharedAllowNil !== undefined && opts.allowNil === undefined)
        opts.allowNil = sharedAllowNil;
      if (sharedAllowBlank !== undefined && opts.allowBlank === undefined)
        opts.allowBlank = sharedAllowBlank;
      validatorSpecs.push({ klass: NumericalityValidator, opts });
    }

    if (rules.inclusion) {
      const opts = { ...(rules.inclusion as AnyRecord) };
      if (sharedAllowNil !== undefined && opts.allowNil === undefined)
        opts.allowNil = sharedAllowNil;
      if (sharedAllowBlank !== undefined && opts.allowBlank === undefined)
        opts.allowBlank = sharedAllowBlank;
      validatorSpecs.push({ klass: InclusionValidator, opts });
    }

    if (rules.exclusion) {
      const opts = { ...(rules.exclusion as AnyRecord) };
      if (sharedAllowNil !== undefined && opts.allowNil === undefined)
        opts.allowNil = sharedAllowNil;
      if (sharedAllowBlank !== undefined && opts.allowBlank === undefined)
        opts.allowBlank = sharedAllowBlank;
      validatorSpecs.push({ klass: ExclusionValidator, opts });
    }

    if (rules.format) {
      const opts = { ...(rules.format as AnyRecord) };
      if (sharedAllowNil !== undefined && opts.allowNil === undefined)
        opts.allowNil = sharedAllowNil;
      if (sharedAllowBlank !== undefined && opts.allowBlank === undefined)
        opts.allowBlank = sharedAllowBlank;
      validatorSpecs.push({ klass: FormatValidator, opts });
    }

    if (rules.acceptance) {
      const opts = rules.acceptance === true ? {} : (rules.acceptance as AnyRecord);
      if (!this._attributeDefinitions.has(attribute)) {
        this.attribute(attribute, "string", { virtual: true });
      }
      validatorSpecs.push({ klass: AcceptanceValidator, opts });
    }

    if (rules.confirmation) {
      const opts = rules.confirmation === true ? {} : (rules.confirmation as AnyRecord);
      const confirmationAttr = `${attribute}Confirmation`;
      if (!this._attributeDefinitions.has(confirmationAttr)) {
        this.attribute(confirmationAttr, "string", { virtual: true });
      }
      validatorSpecs.push({ klass: ConfirmationValidator, opts });
    }

    if (rules.comparison) {
      validatorSpecs.push({ klass: ComparisonValidator, opts: rules.comparison as AnyRecord });
    }

    for (const { klass, opts } of validatorSpecs) {
      this.validatesWith(klass, { ...opts, attributes: [attribute], ...shared });
    }
  }

  static validatesBang(attribute: string, rules: Record<string, unknown>): void {
    this.validates(attribute, { ...rules, strict: true });
  }

  static clearValidatorsBang(): void {
    // Rails: `_validators.clear` (activemodel/lib/active_model/validations.rb:248).
    this._validators = new Map();
    this._ensureOwnCallbacks();
    this._callbackChain.clearEvent("validate");
  }

  static isAttributeMethod(attribute: string): boolean {
    return this._attributeDefinitions.has(attribute);
  }

  static validate(
    methodOrFn: string | ((record: AnyRecord) => unknown),
    options: ConditionalOptions = {},
  ): void {
    const fn: CallbackFn = (record: AnyRecord) => {
      // Return the underlying result so an `async` validator's Promise flows
      // into the callback runner, where strict-sync mode (on the `validate`
      // event) will throw instead of dropping it as an unhandled rejection.
      if (typeof methodOrFn === "function") {
        return methodOrFn(record) as void;
      } else if (typeof record[methodOrFn] === "function") {
        return record[methodOrFn]() as void;
      }
    };
    this._ensureOwnCallbacks();
    this._callbackChain.register("before", "validate", fn, this._buildValidateConditions(options));
  }

  /**
   * Validates each of the specified attributes with a block.
   *
   * Mirrors: ActiveModel::Validations.validates_each
   */
  static validatesEach(
    attributes: string[],
    fn: (record: AnyRecord, attribute: string, value: unknown) => void,
    options: ConditionalOptions = {},
  ): void {
    const validator = new BlockValidator({ attributes, ...options }, fn);
    this._registerValidator(validator);
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      "before",
      "validate",
      (record: AnyRecord) => validator.validate(record) as unknown as void,
      this._buildValidateConditions(options),
    );
  }

  /**
   * Validates using a custom validator class instance.
   * The validator must implement validate(record).
   *
   * Mirrors: ActiveModel::Validations.validates_with
   */
  static validatesWith(
    ...args: Array<
      | {
          new (
            options: Record<string, unknown>,
          ): ValidatorBase | { validate(record: AnyRecord): void };
        }
      | (ConditionalOptions & { strict?: boolean; [key: string]: unknown })
    >
  ): void {
    const last = args[args.length - 1];
    const options: ConditionalOptions & { strict?: boolean; [key: string]: unknown } =
      typeof last === "function"
        ? {}
        : ((args.pop() as ConditionalOptions & { strict?: boolean; [key: string]: unknown }) ?? {});

    const { if: ifOpt, unless: unlessOpt, on: onOpt, strict: isStrict, ...rest } = options;
    const conditions = this._buildValidateConditions({ if: ifOpt, unless: unlessOpt, on: onOpt });

    // Extract the explicit `attributes:` option so we can route the validator
    // into the right bucket even when the validator class doesn't expose
    // `attributes` on the instance or in `options` (e.g. plain classes that
    // only implement `validate()`).
    const rawExplicit = (rest as { attributes?: unknown }).attributes;
    const explicitAttributes: string[] | null = Array.isArray(rawExplicit)
      ? rawExplicit.map(String)
      : typeof rawExplicit === "string"
        ? [rawExplicit]
        : null;

    for (const klass of args as Array<{
      new (options: Record<string, unknown>): ValidatorBase | { validate(record: AnyRecord): void };
    }>) {
      const validator = new klass(rest);
      if (!(validator instanceof EachValidator)) {
        if (typeof (validator as AnyRecord).checkValidity === "function") {
          (validator as AnyRecord).checkValidity();
        } else if (typeof (validator as AnyRecord).checkValidityBang === "function") {
          (validator as AnyRecord).checkValidityBang();
        }
      }
      this._registerValidator(validator, explicitAttributes);

      let callbackFn: CallbackFn;
      if (isStrict) {
        callbackFn = (record: AnyRecord) => {
          const origErrors = record.errors;
          const tempErrors = new Errors(record);
          record.errors = tempErrors;
          let validateResult: unknown;
          try {
            validateResult = validator.validate(record);
          } finally {
            record.errors = origErrors;
          }
          if (tempErrors.any) {
            throw new StrictValidationFailed(tempErrors.fullMessages.join(", "));
          }
          return validateResult as void;
        };
      } else {
        callbackFn = (record: AnyRecord) => validator.validate(record) as unknown as void;
      }

      this._ensureOwnCallbacks();
      this._callbackChain.register("before", "validate", callbackFn, conditions);
    }
  }

  /**
   * Return all validators registered on this model.
   *
   * Mirrors: ActiveModel::Validations.validators
   */
  static validators(): Array<ValidatorLike> {
    // Rails: `_validators.values.flatten.uniq`
    // (activemodel/lib/active_model/validations.rb:204-206).
    const seen = new Set<ValidatorLike>();
    const out: Array<ValidatorLike> = [];
    for (const bucket of this._validators.values()) {
      for (const v of bucket) {
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
      }
    }
    return out;
  }

  /**
   * Return validators registered for a specific attribute. O(1) bucket
   * lookup — Rails `_validators[attribute.to_sym]`
   * (activemodel/lib/active_model/validations.rb:266-270).
   *
   * Returns a detached copy each call (same shape whether the bucket is
   * populated or empty). Deliberately does NOT mirror Rails' default-proc
   * auto-vivification (`Hash.new { |h,k| h[k] = [] }`) — that's a Ruby
   * hash artifact that would turn reads into state mutations, and on a
   * subclass it would also require eagerly invoking
   * `_ensureOwnValidators()` just to avoid polluting the parent's map.
   * The detached copy keeps both concerns away from the reader (caller
   * mutation can't leak into internals; consecutive calls return
   * independent arrays).
   */
  static validatorsOn(attribute: string): Array<ValidatorLike> {
    const bucket = this._validators.get(attribute);
    return bucket ? [...bucket] : [];
  }

  // -- Individual validator helper methods --
  // These mirror the Rails validates_*_of shorthand methods

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_presence_of
   */
  static validatesPresenceOf(...args: (string | Record<string, unknown>)[]): void {
    const last = args[args.length - 1];
    const opts =
      typeof last === "object" && last !== null ? (args.pop() as Record<string, unknown>) : {};
    const { message, ...rest } = opts;
    const presenceValue = message != null ? { message } : true;
    for (const attr of args as string[]) this.validates(attr, { presence: presenceValue, ...rest });
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_absence_of
   */
  static validatesAbsenceOf(...args: (string | Record<string, unknown>)[]): void {
    const last = args[args.length - 1];
    const opts =
      typeof last === "object" && last !== null ? (args.pop() as Record<string, unknown>) : {};
    const { message, ...rest } = opts;
    const absenceValue = message != null ? { message } : true;
    for (const attr of args as string[]) this.validates(attr, { absence: absenceValue, ...rest });
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_length_of
   */
  static validatesLengthOf(attribute: string, options: Record<string, unknown>): void {
    this.validates(attribute, { length: options });
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_numericality_of
   */
  static validatesNumericalityOf(
    attribute: string,
    options: Record<string, unknown> | boolean = {},
  ): void {
    this.validates(attribute, { numericality: options === true ? {} : options });
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_inclusion_of
   */
  static validatesInclusionOf(attribute: string, options: Record<string, unknown>): void {
    this.validates(attribute, { inclusion: options });
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_exclusion_of
   */
  static validatesExclusionOf(attribute: string, options: Record<string, unknown>): void {
    this.validates(attribute, { exclusion: options });
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_format_of
   */
  static validatesFormatOf(attribute: string, options: Record<string, unknown>): void {
    this.validates(attribute, { format: options });
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_acceptance_of
   */
  static validatesAcceptanceOf(...attributes: string[]): void {
    for (const attr of attributes) this.validates(attr, { acceptance: true });
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_confirmation_of
   */
  static validatesConfirmationOf(...attributes: string[]): void {
    for (const attr of attributes) this.validates(attr, { confirmation: true });
  }

  static validatesComparisonOf(attribute: string, options: Record<string, unknown>): void {
    this.validates(attribute, { comparison: options });
  }

  static validatesSizeOf(attribute: string, options: Record<string, unknown>): void {
    this.validates(attribute, { length: options });
  }

  // -- Callbacks (Phase 1200) --

  static beforeValidation<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      "before",
      "validation",
      fn as CallbackFn | CallbackObject,
      conditions,
    );
  }

  static afterValidation<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      "after",
      "validation",
      fn as CallbackFn | CallbackObject,
      conditions,
    );
  }

  static beforeSave<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("before", "save", fn as CallbackFn | CallbackObject, conditions);
  }

  static afterSave<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "save", fn as CallbackFn | CallbackObject, conditions);
  }

  static beforeCreate<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("before", "create", fn as CallbackFn | CallbackObject, conditions);
  }

  static afterCreate<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "create", fn as CallbackFn | CallbackObject, conditions);
  }

  static beforeUpdate<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("before", "update", fn as CallbackFn | CallbackObject, conditions);
  }

  static afterUpdate<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "update", fn as CallbackFn | CallbackObject, conditions);
  }

  static beforeDestroy<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      "before",
      "destroy",
      fn as CallbackFn | CallbackObject,
      conditions,
    );
  }

  static afterDestroy<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "destroy", fn as CallbackFn | CallbackObject, conditions);
  }

  static aroundSave<T extends typeof Model>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      "around",
      "save",
      fn as AroundCallbackFn | CallbackObject,
      conditions,
    );
  }

  static aroundCreate<T extends typeof Model>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      "around",
      "create",
      fn as AroundCallbackFn | CallbackObject,
      conditions,
    );
  }

  static aroundUpdate<T extends typeof Model>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      "around",
      "update",
      fn as AroundCallbackFn | CallbackObject,
      conditions,
    );
  }

  static aroundDestroy<T extends typeof Model>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      "around",
      "destroy",
      fn as AroundCallbackFn | CallbackObject,
      conditions,
    );
  }

  static afterCommit<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    if (conditions?.on !== undefined) {
      _validateOnCondition(conditions.on);
    }
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "commit", fn as CallbackFn | CallbackObject, conditions);
  }

  static afterSaveCommit<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    this.afterCommit(fn, { ...conditions, on: ["create", "update"] });
  }

  static afterCreateCommit<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    this.afterCommit(fn, { ...conditions, on: "create" });
  }

  static afterUpdateCommit<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    this.afterCommit(fn, { ...conditions, on: "update" });
  }

  static afterDestroyCommit<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    this.afterCommit(fn, { ...conditions, on: "destroy" });
  }

  static afterRollback<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    if (conditions?.on !== undefined) {
      _validateOnCondition(conditions.on);
    }
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      "after",
      "rollback",
      fn as CallbackFn | CallbackObject,
      conditions,
    );
  }

  static afterInitialize<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      "after",
      "initialize",
      fn as CallbackFn | CallbackObject,
      conditions,
    );
  }

  static afterFind<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "find", fn as CallbackFn | CallbackObject, conditions);
  }

  static afterTouch<T extends typeof Model>(
    this: T,
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    conditions?: CallbackConditions<InstanceType<T>>,
  ): void {
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "touch", fn as CallbackFn | CallbackObject, conditions);
  }

  private static _ensureOwnCallbacks(): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
      this._callbackChain = this._callbackChain.clone();
    }
  }

  // ---------------------------------------------------------------------------
  // Generic callback registration — Rails `set_callback` / `skip_callback` /
  // `reset_callbacks` from `ActiveSupport::Callbacks::ClassMethods`
  // (activesupport/lib/active_support/callbacks.rb:737-820). Exposes the
  // canonical event-agnostic form so plugin authors can register callbacks
  // for any event without needing a per-event convenience helper (beforeSave,
  // afterCreate, etc.).
  // ---------------------------------------------------------------------------

  /**
   * Register a callback for `event` with `timing` (`"before" | "after" |
   * "around"`). Mirrors Rails `set_callback(event, timing, filter, options)`
   * (activesupport/lib/active_support/callbacks.rb:737-749). `filter` may be
   * a function (most common in TS) or a method-object that our existing
   * `CallbackChain.register` accepts; `options` covers the usual Rails
   * conditionals (`if`, `unless`, `prepend`). `on` is only valid for
   * transactional callbacks (`commit` / `rollback`) — any other event
   * raises if `on` is set, matching the existing per-event helpers.
   */
  static setCallback<T extends typeof Model>(
    this: T,
    event: string,
    timing: "before" | "after",
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
    options?: CallbackConditions<InstanceType<T>>,
  ): void;
  static setCallback<T extends typeof Model>(
    this: T,
    event: string,
    timing: "around",
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject,
    options?: CallbackConditions<InstanceType<T>>,
  ): void;
  static setCallback<T extends typeof Model>(
    this: T,
    event: string,
    timing: "before" | "after" | "around",
    fn: CallbackFn | AroundCallbackFn | CallbackObject,
    options?: CallbackConditions<InstanceType<T>>,
  ): void {
    // `CallbackChain.register` below enforces both `on:` applicability
    // (only commit/rollback) and value validity
    // (:create/:update/:destroy) using key-presence checks, so every
    // entry point — setCallback, defineModelCallbacks helpers, direct
    // chain.register — shares the same gate. No extra guard needed
    // here.
    this._ensureOwnCallbacks();
    this._callbackChain.register(
      timing,
      event,
      fn as CallbackFn | AroundCallbackFn | CallbackObject,
      options as CallbackConditions | undefined,
    );
  }

  /**
   * Remove a previously-registered callback. Mirrors Rails
   * `skip_callback(event, timing, filter)`
   * (activesupport/lib/active_support/callbacks.rb:786-808). Identity
   * comparison on `fn` — callers pass the same reference they registered.
   * Returns `true` if a matching entry was removed; Rails raises when no
   * match unless `raise: false`, we return boolean so the caller can
   * decide.
   *
   * Note: Rails also lets `skip_callback(..., if: cond)` *conditionally*
   * skip at run time (it rewrites the chain entry rather than deleting
   * it). Ours only supports unconditional removal; for conditional
   * skipping, re-`setCallback` the same filter wrapped in your own
   * condition check.
   */
  static skipCallback<T extends typeof Model>(
    this: T,
    event: string,
    timing: "before" | "after",
    fn: ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>) | CallbackObject,
  ): boolean;
  static skipCallback<T extends typeof Model>(
    this: T,
    event: string,
    timing: "around",
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject,
  ): boolean;
  static skipCallback<T extends typeof Model>(
    this: T,
    event: string,
    timing: "before" | "after" | "around",
    fn: CallbackFn | AroundCallbackFn | CallbackObject,
  ): boolean {
    // Don't force copy-on-first-write on a miss — if there's nothing
    // matching, we shouldn't clone and trap the subclass in a snapshot
    // that will never see future parent registrations. Check via the
    // inherited chain first; only clone when we're actually going to
    // mutate (match found).
    if (!this._callbackChain.has(event, timing, fn)) return false;
    this._ensureOwnCallbacks();
    return this._callbackChain.skip(event, timing, fn);
  }

  /**
   * Clear every callback registered for `event` on this class. Mirrors
   * Rails `reset_callbacks(name)`
   * (activesupport/lib/active_support/callbacks.rb:811-821).
   */
  static resetCallbacks<T extends typeof Model>(this: T, event: string): void {
    this._ensureOwnCallbacks();
    this._callbackChain.clearEvent(event);
  }

  private static _ensureOwnValidators(): void {
    // Copy-on-first-write dup. Rails' `inherited(base)` hook
    // (activemodel/lib/active_model/validations.rb:287-291) does this
    // eagerly at class-definition time; JS has no such hook, so we defer
    // the dup until the first write on the subclass. Produces an
    // independent top-level Map whose per-attribute arrays are also fresh,
    // matching Rails' `dup.each { |k, v| dup[k] = v.dup }` — downward
    // writes from the subclass never leak up to the parent.
    if (!Object.prototype.hasOwnProperty.call(this, "_validators")) {
      const cloned = new Map<string | null, Array<ValidatorLike>>();
      for (const [k, arr] of this._validators) cloned.set(k, [...arr]);
      this._validators = cloned;
    }
  }

  /**
   * Register `validator` under each of its declared attributes (or under
   * the `null` key when none are declared — Rails matches this in
   * `validates_with` via `_validators[nil] << validator`).
   *
   * `explicitAttributes` wins when the caller already parsed attributes
   * from options (e.g. `validates_with MyValidator, attributes: [...]`
   * with a validator class that doesn't store them on the instance).
   * Otherwise fall back to `validator.attributes` (set by `EachValidator`)
   * or `validator.options.attributes` (set by plain `Validator`
   * subclasses). This three-tier lookup covers all three validator
   * shapes `validates_with` accepts:
   *   - `EachValidator` subclass (attributes on instance),
   *   - `Validator` subclass (attributes in `options`),
   *   - arbitrary class that just implements `validate()` (neither —
   *     caller must pass attributes explicitly).
   */
  private static _registerValidator(
    validator: ValidatorLike,
    explicitAttributes?: readonly string[] | null,
  ): void {
    this._ensureOwnValidators();
    const fromInstance = (validator as AnyRecord).attributes;
    const fromOptions = (validator as AnyRecord).options?.attributes;
    const rawAttrs =
      explicitAttributes && explicitAttributes.length > 0
        ? explicitAttributes
        : Array.isArray(fromInstance) && fromInstance.length > 0
          ? fromInstance
          : Array.isArray(fromOptions) && fromOptions.length > 0
            ? fromOptions
            : typeof fromOptions === "string"
              ? [fromOptions]
              : null;
    const keys: Array<string | null> = rawAttrs ? rawAttrs.map(String) : [null];
    for (const key of keys) {
      let bucket = this._validators.get(key);
      if (!bucket) {
        bucket = [];
        this._validators.set(key, bucket);
      }
      bucket.push(validator);
    }
  }

  private static _buildValidateConditions(
    options: ConditionalOptions,
  ): CallbackConditions | undefined {
    const parts: Array<(record: AnyRecord) => boolean> = [];

    if (options.on !== undefined) {
      // Rails `predicate_for_validation_context` (validations.rb:294-306):
      // both the registered `on:` and the model's current
      // `validation_context` may be Symbols or Arrays of Symbols. A
      // validator with `on: [:create, :publish]` fires when the model's
      // context is `:create`, `[:create]`, `[:publish, :foo]`, etc. —
      // intersection, not equality.
      const registered = Array.isArray(options.on) ? options.on : [options.on];
      const registeredSet = new Set(registered);
      parts.push((record: AnyRecord) => {
        const ctx = record._validationContext;
        if (ctx == null) return false;
        const current = Array.isArray(ctx) ? ctx : [ctx];
        return current.some((c: unknown) => registeredSet.has(c as string));
      });
    }

    if (options.if !== undefined) {
      const conds = Array.isArray(options.if) ? options.if : [options.if];
      parts.push((record: AnyRecord) => conds.every((c) => evaluateCondition(record, c)));
    }

    if (options.unless !== undefined) {
      const conds = Array.isArray(options.unless) ? options.unless : [options.unless];
      parts.push((record: AnyRecord) => !conds.some((c) => evaluateCondition(record, c)));
    }

    if (parts.length === 0) return undefined;

    return {
      if: (record: AnyRecord) => parts.every((fn) => fn(record)),
    };
  }

  /**
   * Define custom model callbacks.
   * Creates beforeX(), afterX(), and aroundX() class methods for each event name.
   *
   * Mirrors: ActiveModel::Callbacks.define_model_callbacks
   */
  static defineModelCallbacks = defineModelCallbacks;

  /**
   * Convert an attribute name to a human-readable form.
   *
   * Mirrors: ActiveModel::Translation.human_attribute_name
   */
  static humanAttributeName(attr: string): string {
    const fallback = humanize(attr);
    const scope = this.i18nScope;

    const defaults: Array<{ key: string } | { message: string }> = [];
    const ancestors = typeof this.lookupAncestors === "function" ? this.lookupAncestors() : [this];
    for (const klass of ancestors) {
      const key = klass.name ? underscore(klass.name) : undefined;
      if (key) {
        defaults.push({ key: `${scope}.attributes.${key}.${attr}` });
      }
    }
    defaults.push({ key: `attributes.${attr}` });
    defaults.push({ message: fallback });

    const [primary, ...rest] = defaults;
    const primaryKey = "key" in primary ? primary.key : `attributes.${attr}`;

    return I18n.t(primaryKey, { defaults: rest });
  }

  /**
   * The i18n scope for translation lookups.
   *
   * Mirrors: ActiveModel::Translation.i18n_scope
   */
  static get i18nScope(): string {
    return "activemodel";
  }

  static attributeMethodPrefix = attributeMethodPrefix;
  static attributeMethodSuffix = attributeMethodSuffix;
  static attributeMethodAffix = attributeMethodAffix;
  static undefineAttributeMethods = undefineAttributeMethods;

  // -- Naming (Phase 1300) --

  static lookupAncestors(): Array<typeof Model> {
    return [this];
  }

  static get modelName(): ModelName {
    if (!this._modelName || this._modelName.name !== this.name) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Model satisfies ModelLike but TS can't prove it due to circular types
      this._modelName = new ModelName(this.name, { klass: this as any });
    }
    return this._modelName;
  }

  // -- Instance --

  _attributes: AttributeSet = new AttributeSet();
  _accessedFields: Set<string> = new Set();
  errors: Errors = new Errors(this);
  _dirty: DirtyTracker = new DirtyTracker();

  /**
   * Mirrors: ActiveModel::API#initialize → ActiveModel::Attributes#initialize
   *
   * Rails pattern:
   *   Attributes#initialize: @attributes = self.class._default_attributes.deep_dup
   *   API#initialize:        assign_attributes(attributes); super()
   */
  constructor(attrs: Record<string, unknown> = {}) {
    const ctor = this.constructor as typeof Model;

    // Attributes#initialize — @attributes = self.class._default_attributes.deep_dup
    this._attributes = ctor._defaultAttributes().deepDup();

    // API#initialize — assign through writeAttribute (casting, normalization).
    // Dispatches through this (so subclass overrides apply), matching Rails.
    for (const [key, value] of Object.entries(attrs)) {
      this.writeAttribute(key, value);
    }

    // Snapshot after construction — the initial state is "clean"
    this._dirty.snapshot(this._attributes);

    // Fire after_initialize callbacks. ActiveRecord intentionally uses the
    // duck-typed `_suppressInitializeCallback` hook during DB hydration so it
    // can defer constructor-time after_initialize, run after_find first, and
    // then fire after_initialize in Rails-compatible order.
    const callbackSuppressor = ctor as typeof ctor & { _suppressInitializeCallback?: boolean };
    if (callbackSuppressor._suppressInitializeCallback !== true) {
      ctor._callbackChain.runAfter("initialize", this, { strict: "sync" });
    }
  }

  // -- Attribute access --

  readAttribute(name: string): unknown {
    // Rails resolves alias_attribute names in `read_attribute`
    // (attribute_aliases[name] || name); `_read_attribute` skips it.
    const resolved = resolveAliasName(this.constructor as typeof Model, name);
    if (!this._attributes.has(resolved)) {
      // Trails-specific divergence: returns null for unknown attributes.
      // Rails attribute_methods.rb:553 raises MissingAttributeError here,
      // but many trails callers (secure-password, callbacks, etc.) rely
      // on the null-return behavior, so changing it would be a wide
      // breaking change. Note that Rails `attribute_missing` is the
      // method_missing dispatcher for *generated* per-attribute methods
      // (name_changed?, name_was, …), NOT a fallback for plain reads —
      // see Model#attributeMissing for the Rails-faithful dispatcher.
      return null;
    }
    this._accessedFields.add(resolved);
    return this._attributes.fetchValue(resolved) ?? null;
  }

  /** @internal */
  _readAttribute(name: string): unknown {
    if (!this._attributes.has(name)) {
      return null;
    }
    return this._attributes.fetchValue(name) ?? null;
  }

  /**
   * Mirrors: attribute_methods.rb:520-522
   *   def attribute_missing(match, ...)
   *     __send__(match.proxy_target, match.attr_name, ...)
   *   end
   *
   * Per-attribute methods generated by `defineDirtyAttributeMethods`
   * route through this hook so subclasses can intercept the entire
   * cascade (`name_changed?`, `name_was`, `restore_name`, …) by
   * overriding a single method — same shape as Rails.
   *
   * Defined as a prototype method (not a class field) so subclass
   * `override attributeMissing(...)` declarations correctly shadow it.
   * Class fields would create per-instance properties that mask the
   * prototype override.
   */
  attributeMissing(match: { proxyTarget: string; attrName: string }, ...args: unknown[]): unknown {
    return attributeMissing.call(this as Record<string, unknown>, match, ...args);
  }

  writeAttribute(name: string, value: unknown): void {
    // Alias-resolve on the public write path; aliased writes land on the
    // canonical attribute's dirty state (Rails `write_attribute`).
    const resolved = resolveAliasName(this.constructor as typeof Model, name);
    this._writeAttribute(resolved, value);
  }

  /** @internal */
  _writeAttribute(name: string, value: unknown): void {
    const ctor = this.constructor as typeof Model;
    const oldValue = this._attributes.has(name) ? this._attributes.fetchValue(name) : undefined;
    this._attributes.writeFromUser(name, value);
    let newValue = this._attributes.fetchValue(name);
    newValue = ctor._applyNormalization(name, newValue);
    newValue = this._applyNullifyBlanks(name, newValue);
    if (newValue !== this._attributes.fetchValue(name)) {
      this._attributes.writeCastValue(name, newValue);
    }
    this._dirty.attributeWillChange(name, oldValue, newValue);
  }

  /**
   * Apply nullifyBlanks: convert blank strings to null.
   */
  private _applyNullifyBlanks(name: string, value: unknown): unknown {
    const ctor = this.constructor as typeof Model;
    const config = ctor._nullifyBlanks;
    if (config === false) return value;
    if (typeof value !== "string") return value;
    if (config === true || (Array.isArray(config) && config.includes(name))) {
      if (value.trim() === "") return null;
    }
    return value;
  }

  /**
   * Read the raw (uncast) value of an attribute.
   *
   * Mirrors: ActiveModel::Dirty#attribute_before_type_cast
   */
  readAttributeBeforeTypeCast(name: string): unknown {
    const resolved = resolveAliasName(this.constructor as typeof Model, name);
    return this._attributes.getAttribute(resolved).valueBeforeTypeCast ?? null;
  }

  /**
   * Get all attributes before type cast as a plain object.
   *
   * Mirrors: ActiveModel::Attributes#attributes_before_type_cast
   */
  get attributesBeforeTypeCast(): Record<string, unknown> {
    return this._attributes.valuesBeforeTypeCast();
  }

  /**
   * Get the type/metadata for an attribute.
   *
   * Mirrors: ActiveRecord::Base.column_for_attribute
   */
  columnForAttribute(name: string): { name: string; type: Type } | null {
    const def = (this.constructor as typeof Model)._attributeDefinitions.get(name);
    if (!def) return null;
    return { name: def.name, type: def.type };
  }

  /**
   * Check if this model has the given attribute defined.
   *
   * Mirrors: ActiveModel::AttributeMethods#has_attribute?
   */
  hasAttribute(name: string): boolean {
    const ctor = this.constructor as typeof Model;
    const resolved = resolveAliasName(ctor, name);
    return ctor._attributeDefinitions.has(resolved);
  }

  /**
   * Return the list of attribute names for this instance's class.
   *
   * Mirrors: ActiveModel::AttributeMethods#attribute_names (instance)
   */
  attributeNames(): string[] {
    return (this.constructor as typeof Model).attributeNames();
  }

  get attributes(): Record<string, unknown> {
    return this._attributes.toHash();
  }

  attributePresent(name: string): boolean {
    const value = this.readAttribute(name);
    if (value === null || value === undefined) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    return true;
  }

  // -- Validations --

  // Rails `validation_context` holds either a single Symbol or an
  // Array<Symbol> (or nil). `valid?([:create, :publish])` round-trips
  // the array so `on: :create` / `on: [:create]` / `on: [:create, :other]`
  // validators all fire. See `validations.rb:361-368` and `:294-306`.
  _validationContext: string | string[] | null = null;

  isValid(context?: string | string[] | ValidationContext | null): boolean {
    this.errors.clear();
    const ctor = this.constructor as typeof Model;
    // Rails `valid?(context = nil)` (validations.rb:361-368) always
    // assigns `context_for_validation.context = context` on entry,
    // restoring in `ensure`. An omitted argument and an explicit
    // `null` both map to Rails' `nil` — so we collapse both to
    // `null` here. For `ValidationContext` / Array we deep-copy to
    // prevent caller-side mutation from leaking into our frame.
    let normalized: string | string[] | null;
    if (context === undefined || context === null) {
      normalized = null;
    } else if (context instanceof ValidationContext) {
      const inner = context.context;
      normalized = Array.isArray(inner) ? [...inner] : inner;
    } else if (Array.isArray(context)) {
      normalized = [...context];
    } else {
      normalized = context;
    }
    const prevContext = this._validationContext;
    this._validationContext = normalized;

    try {
      const completed = ctor._callbackChain.runCallbacks(
        "validation",
        this,
        () => {
          this._runValidateCallbacks();
        },
        { strict: "sync" },
      );
      if (!completed) return false;
      return this.errors.empty;
    } finally {
      this._validationContext = prevContext;
    }
  }

  private _runValidateCallbacks(): void {
    const ctor = this.constructor as typeof Model;
    ctor._callbackChain.runBefore("validate", this, { strict: "sync" });
  }

  /**
   * Run validations and return whether the record is valid.
   *
   * Mirrors Rails `alias_method :validate, :valid?`
   * (activemodel/lib/active_model/validations.rb:370).
   */
  validate(context?: string | string[] | ValidationContext | null): boolean {
    return this.isValid(context);
  }

  /**
   * Opposite of `isValid`. Accepts an optional context.
   *
   * Mirrors Rails `def invalid?(context = nil); !valid?(context); end`
   * (activemodel/lib/active_model/validations.rb:408-410).
   */
  isInvalid(context?: string | string[] | ValidationContext | null): boolean {
    return !this.isValid(context);
  }

  /**
   * Freeze this model instance. Mirrors Rails
   * `ActiveModel::Validations#freeze` (activemodel/lib/active_model/validations.rb:372-377):
   *
   *   def freeze
   *     errors
   *     context_for_validation
   *     super
   *   end
   *
   * Rails pre-touches `@errors` and `@context_for_validation` so frozen
   * models can still answer `#errors` and `#validation_context` without
   * tripping their `||=` lazy-init. We mirror that by going through the
   * public API (`.errors`, `.validationContext`) — that way, if either
   * becomes lazy in the future, the pre-materialization still runs
   * without this method coupling to private fields.
   */
  freeze(): this {
    void this.errors;
    void this.validationContext;
    Object.freeze(this);
    return this;
  }

  // -- Dirty tracking --

  get changed(): boolean {
    return this._dirty.changed;
  }

  /**
   * Check if there are any unsaved changes.
   *
   * Mirrors: ActiveModel::Dirty#has_changes_to_save?
   */
  get hasChangesToSave(): boolean {
    return this._dirty.changed;
  }

  get changedAttributes(): string[] {
    return this._dirty.changedAttributes;
  }

  get changes(): Record<string, [unknown, unknown]> {
    return this._dirty.changes;
  }

  attributeChanged(name: string, options?: { from?: unknown; to?: unknown }): boolean {
    if (!this._dirty.attributeChanged(name)) return false;
    if (!options) return true;
    const change = this._dirty.attributeChange(name);
    if (!change) return false;
    if ("from" in options && change[0] !== options.from) return false;
    if ("to" in options && change[1] !== options.to) return false;
    return true;
  }

  /**
   * Check if a specific attribute will be saved on the next save.
   * Supports from: and to: options like Rails.
   *
   * Mirrors: ActiveModel::Dirty#will_save_change_to_attribute?
   */
  willSaveChangeToAttribute(name: string, options?: { from?: unknown; to?: unknown }): boolean {
    return this.attributeChanged(name, options);
  }

  attributeWas(name: string): unknown {
    return this._dirty.attributeWas(name);
  }

  /** @internal */
  attributeChange(name: string): [unknown, unknown] | undefined {
    return this._dirty.attributeChange(name);
  }

  /**
   * Get the before/after values of a change that will be saved.
   *
   * Mirrors: ActiveModel::Dirty#will_save_change_to_attribute
   */
  willSaveChangeToAttributeValues(name: string): [unknown, unknown] | undefined {
    return this._dirty.attributeChange(name);
  }

  get previousChanges(): Record<string, [unknown, unknown]> {
    return this._dirty.previousChanges;
  }

  /**
   * Alias for previousChanges — the changes that were persisted in the last save.
   *
   * Mirrors: ActiveModel::Dirty#saved_changes
   */
  get savedChanges(): Record<string, [unknown, unknown]> {
    return this._dirty.previousChanges;
  }

  /**
   * Check if a specific attribute was saved in the last save.
   *
   * Mirrors: ActiveModel::Dirty#saved_change_to_attribute?
   */
  savedChangeToAttribute(name: string, options?: { from?: unknown; to?: unknown }): boolean {
    const changes = this._dirty.previousChanges;
    if (!(name in changes)) return false;
    if (!options) return true;
    const change = changes[name];
    if ("from" in options && change[0] !== options.from) return false;
    if ("to" in options && change[1] !== options.to) return false;
    return true;
  }

  /**
   * Get the before/after values of a specific attribute from the last save.
   *
   * Mirrors: ActiveModel::Dirty#saved_change_to_attribute
   */
  /**
   * Get the attribute value before the last save.
   *
   * Mirrors: ActiveModel::Dirty#attribute_before_last_save
   */
  attributeBeforeLastSave(name: string): unknown {
    const change = this._dirty.previousChanges[name];
    return change ? change[0] : this.readAttribute(name);
  }

  /**
   * Get the attribute value as it currently exists in the database
   * (i.e. the value from before any unsaved changes).
   *
   * Mirrors: ActiveModel::Dirty#attribute_in_database
   */
  attributeInDatabase(name: string): unknown {
    return this._dirty.attributeWas(name) ?? this.readAttribute(name);
  }

  /**
   * Return the list of attribute names that have unsaved changes.
   *
   * Mirrors: ActiveModel::Dirty#changed_attribute_names_to_save
   */
  get changedAttributeNamesToSave(): string[] {
    return this.changedAttributes;
  }

  /**
   * Return the changes hash that will be saved on the next save.
   * Same as `changes` — returns { attr: [old, new] } for unsaved attributes.
   *
   * Mirrors: ActiveModel::Dirty#changes_to_save
   */
  get changesToSave(): Record<string, [unknown, unknown]> {
    return this.changes;
  }

  /**
   * Return a hash of all attributes with their database values
   * (i.e. the values from before any unsaved changes).
   *
   * Mirrors: ActiveModel::Dirty#attributes_in_database
   */
  get attributesInDatabase(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const name of this.changedAttributes) {
      result[name] = this.attributeInDatabase(name);
    }
    return result;
  }

  savedChangeToAttributeValues(name: string): [unknown, unknown] | undefined {
    const changes = this._dirty.previousChanges;
    return changes[name];
  }

  /**
   * Check if a specific attribute changed in the last save.
   * Alias for savedChangeToAttribute.
   *
   * Mirrors: ActiveModel::Dirty#attribute_previously_changed?
   */
  attributePreviouslyChanged(name: string, options?: { from?: unknown; to?: unknown }): boolean {
    return this.savedChangeToAttribute(name, options);
  }

  /**
   * Get the value of an attribute before the last save.
   * Alias for attributeBeforeLastSave.
   *
   * Mirrors: ActiveModel::Dirty#attribute_previously_was
   */
  attributePreviouslyWas(name: string): unknown {
    return this.attributeBeforeLastSave(name);
  }

  restoreAttributes(): void {
    this._dirty.restore(this._attributes);
  }

  /**
   * Restore a single attribute to its pre-change value.
   *
   * Mirrors: ActiveModel::Dirty#restore_attribute!
   */
  restoreAttribute(name: string): void {
    this._dirty.restoreAttribute(this._attributes, name);
  }

  /**
   * Before/after tuple of a saved change for `name`, or undefined if the
   * attribute wasn't changed in the last save.
   *
   * Mirrors: ActiveModel::Dirty#attribute_previous_change (returned as
   * the hash pair by `attribute_previously_was` / `saved_change_to_attribute`).
   *
   * @internal
   */
  attributePreviousChange(name: string): [unknown, unknown] | undefined {
    return this._dirty.previousChanges[name];
  }

  changesApplied(): void {
    this._dirty.changesApplied(this._attributes);
  }

  /**
   * Clear all dirty tracking information (changes + previous changes).
   *
   * Mirrors: ActiveModel::Dirty#clear_changes_information
   */
  clearChangesInformation(): void {
    this._dirty.clearChangesInformation();
  }

  /**
   * Clear dirty tracking for specific attributes only.
   *
   * Mirrors: ActiveModel::Dirty#clear_attribute_changes
   */
  clearAttributeChanges(attributes: string[]): void {
    this._dirty.clearAttributeChanges(attributes);
  }

  /**
   * Pending changes diff against the values loaded from the database.
   *
   * Mirrors: ActiveModel::Dirty#mutations_from_database
   *
   * @internal
   */
  get mutationsFromDatabase(): Record<string, [unknown, unknown]> {
    return this._dirty.mutationsFromDatabase;
  }

  /**
   * Snapshot of the pending changes at the moment of the last save.
   *
   * Mirrors: ActiveModel::Dirty#mutations_before_last_save
   *
   * @internal
   */
  get mutationsBeforeLastSave(): Record<string, [unknown, unknown]> {
    return this._dirty.mutationsBeforeLastSave;
  }

  /**
   * Drop all pending assignment tracking without reverting values.
   * Used by transactional rollback paths.
   *
   * Mirrors: ActiveModel::Dirty#forget_attribute_assignments
   *
   * @internal
   */
  forgetAttributeAssignments(): void {
    this._dirty.forgetAttributeAssignments(this._attributes);
  }

  /**
   * Drop a single attribute's pending change without reverting its value.
   *
   * Mirrors: ActiveModel::Dirty#clear_attribute_change
   *
   * @internal
   */
  clearAttributeChange(name: string): void {
    this._dirty.clearAttributeChange(this._attributes, name);
  }

  // -- Serialization --

  serializableHash(options?: SerializeOptions): Record<string, unknown> {
    return serializableHash(this, options);
  }

  asJson(options?: SerializeOptions): Record<string, unknown> {
    const hash = coerceForJson(this.serializableHash(options)) as Record<string, unknown>;
    const ctor = this.constructor as typeof Model;
    if (ctor.includeRootInJson) {
      const root =
        typeof ctor.includeRootInJson === "string"
          ? ctor.includeRootInJson
          : ctor.modelName.element;
      return { [root]: hash };
    }
    return hash;
  }

  toJson(options?: SerializeOptions): string {
    return JSON.stringify(this.asJson(options));
  }

  /**
   * JSON.stringify hook — delegates to `asJson()` so
   * `JSON.stringify(model)` produces the same output as
   * `model.toJson()`. Without this, the default walker would
   * enumerate internal fields (`_attributes`, `_dirty`, `errors`, …)
   * and potentially throw on BigInt attributes.
   */
  toJSON(): unknown {
    return this.asJson();
  }

  /**
   * Deserialize a JSON string into this model's attributes.
   *
   * Mirrors: ActiveModel::Serializers::JSON#from_json (json.rb:144-149)
   *
   *   def from_json(json, include_root = include_root_in_json)
   *     hash = ActiveSupport::JSON.decode(json)
   *     hash = hash.values.first if include_root
   *     self.attributes = hash
   *     self
   *   end
   *
   * `includeRoot` defaults to the class-level `includeRootInJson`
   * (matching Rails); when truthy, unwrap unconditionally via
   * first-value semantics regardless of the configured root key. Empty
   * strings are truthy here per Ruby semantics — only `false`/`null`
   * skip the unwrap.
   */
  fromJson(json: string, includeRoot?: boolean | string): this {
    const ctor = this.constructor as typeof Model;
    const root = includeRoot ?? ctor.includeRootInJson;
    let attrs: unknown = JSON.parse(json);
    // Rails calls hash.values.first / self.attributes = hash on the
    // decoded payload — both raise NoMethodError if the input is not a
    // Hash. Surface the same failure mode loudly with shape-accurate
    // diagnostics, matching JSONSerializer.fromJson (serializers/json.ts).
    const shapeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v);
    if (!isPlainObject(attrs)) {
      throw new TypeError(`fromJson expected a JSON object, got ${shapeOf(attrs)}`);
    }
    if (root !== false && root != null) {
      attrs = Object.values(attrs)[0];
      if (!isPlainObject(attrs)) {
        throw new TypeError(`fromJson root payload must be a JSON object, got ${shapeOf(attrs)}`);
      }
    }
    for (const [key, value] of Object.entries(attrs)) {
      this.writeAttribute(key, value);
    }
    return this;
  }

  /**
   * Serialize this model to XML.
   *
   * Mirrors: ActiveModel::Serializers::Xml#to_xml
   */
  toXml(options?: SerializeOptions & { root?: string }): string {
    const hash = this.serializableHash(options);
    const root = options?.root ?? (this.constructor as typeof Model).modelName.singular;
    return `<${root}>\n${this._hashToXml(hash, "  ")}</${root}>`;
  }

  private _hashToXml(hash: Record<string, unknown>, indent: string): string {
    let xml = "";
    for (const [key, value] of Object.entries(hash)) {
      const tag = dasherize(key);
      if (value === null || value === undefined) {
        xml += `${indent}<${tag} nil="true"/>\n`;
      } else if (
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !(value instanceof Temporal.Instant) &&
        !(value instanceof Temporal.PlainDateTime) &&
        !(value instanceof Temporal.PlainDate) &&
        !(value instanceof Temporal.PlainTime) &&
        !(value instanceof Temporal.ZonedDateTime)
      ) {
        xml += `${indent}<${tag}>\n${this._hashToXml(value as Record<string, unknown>, indent + "  ")}${indent}</${tag}>\n`;
      } else if (value instanceof Date) {
        // Dual-typed window: Date values still serialize as ISO 8601 dateTime.
        xml += `${indent}<${tag} type="dateTime">${Number.isNaN(value.getTime()) ? "" : value.toISOString()}</${tag}>\n`;
      } else if (Array.isArray(value)) {
        xml += `${indent}<${tag} type="array">\n`;
        for (const item of value) {
          if (typeof item === "object" && item !== null) {
            xml += `${indent}  <item>\n${this._hashToXml(item as Record<string, unknown>, indent + "    ")}${indent}  </item>\n`;
          } else {
            xml += `${indent}  <item>${this._escapeXml(String(item))}</item>\n`;
          }
        }
        xml += `${indent}</${tag}>\n`;
      } else if (typeof value === "number") {
        xml += `${indent}<${tag} type="integer">${value}</${tag}>\n`;
      } else if (typeof value === "boolean") {
        xml += `${indent}<${tag} type="boolean">${value}</${tag}>\n`;
      } else if (value instanceof Temporal.Instant || value instanceof Temporal.PlainDateTime) {
        xml += `${indent}<${tag} type="dateTime">${value.toJSON()}</${tag}>\n`;
      } else if (value instanceof Temporal.ZonedDateTime) {
        // ZonedDateTime.toJSON() includes the IANA bracket annotation which is
        // not a valid XML Schema dateTime lexical form. Serialize as Instant
        // (UTC) so the output is a standard ISO 8601 dateTime string.
        xml += `${indent}<${tag} type="dateTime">${value.toInstant().toJSON()}</${tag}>\n`;
      } else if (value instanceof Temporal.PlainDate) {
        xml += `${indent}<${tag} type="date">${value.toString()}</${tag}>\n`;
      } else if (value instanceof Temporal.PlainTime) {
        xml += `${indent}<${tag} type="time">${value.toString()}</${tag}>\n`;
      } else {
        xml += `${indent}<${tag}>${this._escapeXml(String(value))}</${tag}>\n`;
      }
    }
    return xml;
  }

  private _escapeXml(str: string): string {
    return htmlEscape(str).toString();
  }

  /**
   * Whether this model instance has been persisted.
   * ActiveModel returns false; ActiveRecord overrides.
   *
   * Mirrors: ActiveModel::API#persisted?
   */
  isPersisted(): boolean {
    return false;
  }

  // -- Naming / Conversion --

  get modelName(): ModelName {
    return (this.constructor as typeof Model).modelName;
  }

  /**
   * Returns self. Required by ActiveModel::Conversion.
   *
   * Mirrors: ActiveModel::Conversion#to_model
   */
  toModel(): this {
    return this;
  }

  /**
   * Assign multiple attributes at once without saving.
   *
   * Mirrors: ActiveModel::AttributeAssignment#assign_attributes
   */
  assignAttributes(attrs: Record<string, unknown>): void {
    assignAttrs(this, attrs);
  }

  /**
   * Hook invoked when assignAttributes encounters an unknown attribute
   * that causes writeAttribute to throw UnknownAttributeError.
   * Override to customize behavior (e.g. log instead of raise).
   *
   * Mirrors: ActiveModel::AttributeAssignment#attribute_writer_missing
   */
  attributeWriterMissing(name: string, value: unknown): void {
    defaultAttributeWriterMissing(this, name, value);
  }

  toParam(): string | null {
    if (!this.isPersisted()) return null;
    const key = this.toKey();
    if (!key) return null;
    if (!key.every((part) => part !== null && part !== undefined && part !== false)) return null;
    return key.map(String).join((this.constructor as typeof Model).paramDelimiter);
  }

  toPartialPath(): string {
    return (this.constructor as typeof Model)._toPartialPath();
  }

  /**
   * Check if this model instance responds to a method/attribute.
   *
   * Mirrors: ActiveModel::AttributeMethods#respond_to?
   */
  respondTo(method: string): boolean {
    if (typeof (this as AnyRecord)[method] === "function") return true;
    if (this._attributes.has(method)) return true;
    return false;
  }

  /**
   * Returns the type of the attribute (the Type object).
   *
   * Mirrors: ActiveModel::Attributes#attribute_for_inspect
   */
  typeForAttribute(name: string): Type | null {
    return (this.constructor as typeof Model).typeForAttribute(name);
  }

  /**
   * Check if an attribute value has changed in-place (by identity).
   *
   * Mirrors: ActiveModel::Dirty#attribute_changed_in_place?
   */
  attributeChangedInPlace(name: string): boolean {
    const original = this._dirty.attributeWas(name);
    const current = this.readAttribute(name);
    // In-place change = same type but different identity
    if (original === undefined) return false;
    return original !== current;
  }

  /**
   * Return a unique key for this model, or null if not persisted.
   *
   * Mirrors: ActiveModel::Conversion#to_key
   */
  toKey(): unknown[] | null {
    if (!this.isPersisted()) return null;
    const id = this.readAttribute("id");
    return id != null ? [id] : null;
  }

  /**
   * Return the current validation context.
   *
   * Mirrors: ActiveModel::Validations#validation_context
   *
   * @internal
   */
  get validationContext(): string | string[] | null {
    return this._validationContext;
  }

  /**
   * Run validations. Returns `true` when valid; raises `ValidationError`
   * otherwise — never returns `false`.
   *
   * Mirrors Rails `def validate!(context = nil); valid?(context) || raise_validation_error; end`
   * (activemodel/lib/active_model/validations.rb:417-419).
   */
  validateBang(context?: string | string[] | ValidationContext | null): true {
    if (!this.isValid(context)) {
      throw new ValidationError(this);
    }
    return true;
  }

  /**
   * Return a subset of attributes.
   *
   * Mirrors: ActiveModel::Access#slice
   */
  slice(...methods: (string | string[])[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const m of methods.flat()) {
      result[m] = this.readAttribute(m);
    }
    return result;
  }

  /**
   * Return attribute values as an array.
   *
   * Mirrors: ActiveModel::Access#values_at
   */
  valuesAt(...methods: (string | string[])[]): unknown[] {
    return methods.flat().map((m) => this.readAttribute(m));
  }

  // -- Callbacks helper for subclasses --

  runCallbacks(
    event: string,
    block: () => unknown,
    opts: RunCallbacksOptions & { strict: "sync" },
  ): boolean;
  runCallbacks(
    event: string,
    block: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean>;
  runCallbacks(
    event: string,
    block: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean> {
    return (this.constructor as typeof Model)._callbackChain.runCallbacks(event, this, block, opts);
  }
}

const VALID_ON_CONDITIONS = new Set(["create", "update", "destroy"]);

function _validateOnCondition(on: string | string[]): void {
  const values = Array.isArray(on) ? on : [on];
  for (const v of values) {
    if (!VALID_ON_CONDITIONS.has(v)) {
      throw new ArgumentError(
        `:on conditions for after_commit and after_rollback callbacks have to be one of [:create, :destroy, :update]`,
      );
    }
  }
}

function _rejectOnOption(conditions?: CallbackConditions): void {
  if (conditions && "on" in conditions) {
    throw new ArgumentError("Unknown key: :on. Valid keys are: :if, :unless, :prepend");
  }
}
