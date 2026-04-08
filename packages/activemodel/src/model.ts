import { Errors, StrictValidationFailed } from "./errors.js";
import { ValidationError, ValidationContext } from "./validations.js";
import { humanize, underscore, dasherize, htmlEscape } from "@blazetrails/activesupport";
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
  defineModelCallbacks,
} from "./callbacks.js";
import { serializableHash, SerializeOptions } from "./serialization.js";
import { BlockValidator } from "./validator.js";
import {
  AttributeMethodPattern,
  attributeMethodPrefix,
  attributeMethodSuffix,
  attributeMethodAffix,
  aliasAttribute,
  undefineAttributeMethods,
} from "./attribute-methods.js";
import {
  assignAttributes as assignAttrs,
  attributeWriterMissing as defaultAttributeWriterMissing,
  ArgumentError,
} from "./attribute-assignment.js";
import type {
  ValidatorContract as Validator,
  ConditionalOptions,
  ConditionFn,
  AnyRecord,
} from "./validator.js";
import { shouldValidate } from "./validator.js";
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
import { type AttributeDefinition, constructor as initAttrs, attribute } from "./attributes.js";

interface ValidationEntry {
  attribute: string;
  validator: Validator;
  on?: string;
  strict?: boolean;
  if?: ConditionFn | ConditionFn[];
  unless?: ConditionFn | ConditionFn[];
}

interface CustomValidationEntry {
  method: string | ((record: AnyRecord) => void);
  options: ConditionalOptions;
}

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
  static _attributeDefinitions: Map<string, AttributeDefinition> = new Map();
  static _attributeMethodPatterns: AttributeMethodPattern[] = [];
  static _attributeAliases: Record<string, string> = {};
  static _aliasesByAttributeName: Map<string, string[]> = new Map();
  static _generatedMethods: Set<string> = new Set();
  static _validations: ValidationEntry[] = [];
  static _customValidations: CustomValidationEntry[] = [];
  static _callbackChain: CallbackChain = new CallbackChain();
  private static _modelName: ModelName | null = null;

  // -- Attributes (Phase 1000) --

  static attribute = attribute;

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
    if (!Object.prototype.hasOwnProperty.call(this, "_validations")) {
      this._validations = [...this._validations];
    }

    const onContext = rules.on as string | undefined;
    const ifCond = rules.if as ConditionFn | ConditionFn[] | undefined;
    const unlessCond = rules.unless as ConditionFn | ConditionFn[] | undefined;
    const isStrict = rules.strict as boolean | undefined;
    const sharedAllowNil = rules.allowNil as boolean | undefined;
    const sharedAllowBlank = rules.allowBlank as boolean | undefined;

    const push = (validator: Validator) => {
      if (typeof (validator as AnyRecord).checkValidityBang === "function") {
        (validator as AnyRecord).checkValidityBang();
      }
      this._validations.push({
        attribute,
        validator,
        on: onContext,
        ...(isStrict && { strict: true }),
        ...(ifCond !== undefined && { if: ifCond }),
        ...(unlessCond !== undefined && { unless: unlessCond }),
      });
    };

    if (rules.presence) {
      const opts = rules.presence === true ? {} : (rules.presence as AnyRecord);
      push(new PresenceValidator(opts));
    }

    if (rules.absence) {
      const opts = rules.absence === true ? {} : (rules.absence as AnyRecord);
      push(new AbsenceValidator(opts));
    }

    if (rules.length) {
      const opts = { ...(rules.length as AnyRecord) };
      if (sharedAllowNil !== undefined && opts.allowNil === undefined)
        opts.allowNil = sharedAllowNil;
      if (sharedAllowBlank !== undefined && opts.allowBlank === undefined)
        opts.allowBlank = sharedAllowBlank;
      push(new LengthValidator(opts));
    }

    if (rules.numericality) {
      const opts = rules.numericality === true ? {} : { ...(rules.numericality as AnyRecord) };
      if (sharedAllowNil !== undefined && opts.allowNil === undefined)
        opts.allowNil = sharedAllowNil;
      if (sharedAllowBlank !== undefined && opts.allowBlank === undefined)
        opts.allowBlank = sharedAllowBlank;
      push(new NumericalityValidator(opts));
    }

    if (rules.inclusion) {
      const opts = { ...(rules.inclusion as AnyRecord) };
      if (sharedAllowNil !== undefined && opts.allowNil === undefined)
        opts.allowNil = sharedAllowNil;
      if (sharedAllowBlank !== undefined && opts.allowBlank === undefined)
        opts.allowBlank = sharedAllowBlank;
      push(new InclusionValidator(opts));
    }

    if (rules.exclusion) {
      const opts = { ...(rules.exclusion as AnyRecord) };
      if (sharedAllowNil !== undefined && opts.allowNil === undefined)
        opts.allowNil = sharedAllowNil;
      if (sharedAllowBlank !== undefined && opts.allowBlank === undefined)
        opts.allowBlank = sharedAllowBlank;
      push(new ExclusionValidator(opts));
    }

    if (rules.format) {
      const opts = { ...(rules.format as AnyRecord) };
      if (sharedAllowNil !== undefined && opts.allowNil === undefined)
        opts.allowNil = sharedAllowNil;
      if (sharedAllowBlank !== undefined && opts.allowBlank === undefined)
        opts.allowBlank = sharedAllowBlank;
      push(new FormatValidator(opts));
    }

    if (rules.acceptance) {
      const opts = rules.acceptance === true ? {} : (rules.acceptance as AnyRecord);
      if (!this._attributeDefinitions.has(attribute)) {
        this.attribute(attribute, "string", { virtual: true });
      }
      push(new AcceptanceValidator(opts));
    }

    if (rules.confirmation) {
      const opts = rules.confirmation === true ? {} : (rules.confirmation as AnyRecord);
      const confirmationAttr = `${attribute}Confirmation`;
      if (!this._attributeDefinitions.has(confirmationAttr)) {
        this.attribute(confirmationAttr, "string", { virtual: true });
      }
      push(new ConfirmationValidator(opts));
    }

    if (rules.comparison) {
      push(new ComparisonValidator(rules.comparison as AnyRecord));
    }
  }

  static validatesBang(attribute: string, rules: Record<string, unknown>): void {
    this.validates(attribute, { ...rules, strict: true });
  }

  static clearValidatorsBang(): void {
    this._validations = [];
    this._customValidations = [];
  }

  static isAttributeMethod(attribute: string): boolean {
    return this._attributeDefinitions.has(attribute);
  }

  static validate(
    methodOrFn: string | ((record: AnyRecord) => void),
    options: ConditionalOptions = {},
  ): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_customValidations")) {
      this._customValidations = [...this._customValidations];
    }
    this._customValidations.push({ method: methodOrFn, options });
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
    this.validate((record: AnyRecord) => {
      validator.validate(record);
    }, options);
  }

  /**
   * Validates using a custom validator class instance.
   * The validator must implement validate(record).
   *
   * Mirrors: ActiveModel::Validations.validates_with
   */
  static validatesWith(
    validatorClass: {
      new (options?: Record<string, unknown>): { validate(record: AnyRecord): void };
    },
    options: ConditionalOptions & { [key: string]: unknown } = {},
  ): void {
    const { if: ifOpt, unless: unlessOpt, on: onOpt, ...rest } = options;
    const validator = new validatorClass(rest);
    this.validate(
      (record: AnyRecord) => {
        validator.validate(record);
      },
      { if: ifOpt, unless: unlessOpt, on: onOpt },
    );
  }

  /**
   * Return all validators registered on this model.
   *
   * Mirrors: ActiveModel::Validations.validators
   */
  static validators(): Array<{ attribute: string; validator: Validator; on?: string }> {
    return [...this._validations];
  }

  /**
   * Return validators registered for a specific attribute.
   *
   * Mirrors: ActiveModel::Validations.validators_on
   */
  static validatorsOn(attribute: string): Validator[] {
    return this._validations
      .filter((entry) => entry.attribute === attribute)
      .map((entry) => entry.validator);
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

  static beforeValidation(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    this._ensureOwnCallbacks();
    this._callbackChain.register("before", "validation", fn, conditions);
  }

  static afterValidation(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "validation", fn, conditions);
  }

  static beforeSave(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("before", "save", fn, conditions);
  }

  static afterSave(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "save", fn, conditions);
  }

  static beforeCreate(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("before", "create", fn, conditions);
  }

  static afterCreate(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "create", fn, conditions);
  }

  static beforeUpdate(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("before", "update", fn, conditions);
  }

  static afterUpdate(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "update", fn, conditions);
  }

  static beforeDestroy(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("before", "destroy", fn, conditions);
  }

  static afterDestroy(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "destroy", fn, conditions);
  }

  static aroundSave(fn: AroundCallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("around", "save", fn, conditions);
  }

  static aroundCreate(
    fn: AroundCallbackFn | CallbackObject,
    conditions?: CallbackConditions,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("around", "create", fn, conditions);
  }

  static aroundUpdate(
    fn: AroundCallbackFn | CallbackObject,
    conditions?: CallbackConditions,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("around", "update", fn, conditions);
  }

  static aroundDestroy(
    fn: AroundCallbackFn | CallbackObject,
    conditions?: CallbackConditions,
  ): void {
    _rejectOnOption(conditions);
    this._ensureOwnCallbacks();
    this._callbackChain.register("around", "destroy", fn, conditions);
  }

  static afterCommit(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    if (conditions?.on !== undefined) {
      _validateOnCondition(conditions.on);
    }
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "commit", fn, conditions);
  }

  static afterSaveCommit(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    this.afterCommit(fn, { ...conditions, on: ["create", "update"] });
  }

  static afterCreateCommit(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    this.afterCommit(fn, { ...conditions, on: "create" });
  }

  static afterUpdateCommit(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    this.afterCommit(fn, { ...conditions, on: "update" });
  }

  static afterDestroyCommit(
    fn: CallbackFn | CallbackObject,
    conditions?: CallbackConditions,
  ): void {
    this.afterCommit(fn, { ...conditions, on: "destroy" });
  }

  static afterRollback(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    if (conditions?.on !== undefined) {
      _validateOnCondition(conditions.on);
    }
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "rollback", fn, conditions);
  }

  static afterInitialize(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "initialize", fn, conditions);
  }

  static afterFind(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "find", fn, conditions);
  }

  static afterTouch(fn: CallbackFn | CallbackObject, conditions?: CallbackConditions): void {
    this._ensureOwnCallbacks();
    this._callbackChain.register("after", "touch", fn, conditions);
  }

  private static _ensureOwnCallbacks(): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
      // Clone parent's chain so subclass inherits existing callbacks
      this._callbackChain = this._callbackChain.clone();
    }
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

    // Attributes#initialize — deep-dup class defaults
    this._attributes = initAttrs(ctor._attributeDefinitions);

    // API#initialize — assign through writeAttribute (casting, normalization).
    // Dispatches through this (so subclass overrides apply), matching Rails.
    for (const [key, value] of Object.entries(attrs)) {
      this.writeAttribute(key, value);
    }

    // Snapshot after construction — the initial state is "clean"
    this._dirty.snapshot(this._attributes);

    // Fire after_initialize callbacks
    ctor._callbackChain.runAfterSync("initialize", this);
  }

  // -- Attribute access --

  readAttribute(name: string): unknown {
    if (!this._attributes.has(name)) {
      return this.attributeMissing(name);
    }
    this._accessedFields.add(name);
    return this._attributes.fetchValue(name) ?? null;
  }

  /**
   * Hook called when reading an attribute that doesn't exist.
   * Override in subclasses to provide custom behavior.
   *
   * Mirrors: ActiveModel::AttributeMethods#attribute_missing
   */
  attributeMissing(_name: string): unknown {
    return null;
  }

  writeAttribute(name: string, value: unknown): void {
    const ctor = this.constructor as typeof Model;
    const oldValue = this._attributes.has(name) ? this._attributes.fetchValue(name) : undefined;
    this._attributes.writeFromUser(name, value);
    // Apply normalization and nullify blanks on the cast value
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
    return this._attributes.getAttribute(name).valueBeforeTypeCast ?? null;
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
    return (this.constructor as typeof Model)._attributeDefinitions.has(name);
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

  _validationContext: string | null = null;

  isValid(context?: string | ValidationContext): boolean {
    this.errors.clear();
    const ctor = this.constructor as typeof Model;
    const contextStr = context instanceof ValidationContext ? context.name : context;
    const effectiveContext = contextStr ?? this._validationContext;

    // Run before_validation callbacks
    if (!ctor._callbackChain.runBeforeSync("validation", this)) return false;

    // Run attribute validations
    for (const entry of ctor._validations) {
      // If validation has an `on` context, only run when context matches
      if (entry.on && entry.on !== effectiveContext) continue;
      // Check if/unless conditions
      if (!shouldValidate(this, { if: entry.if, unless: entry.unless })) continue;
      const value = this.readAttribute(entry.attribute);
      if (entry.strict) {
        const tempErrors = new Errors(this);
        entry.validator.validate(this, entry.attribute, value, tempErrors);
        if (tempErrors.any) {
          const msg = tempErrors.fullMessages.join(", ");
          throw new StrictValidationFailed(`${entry.attribute} ${msg}`);
        }
      } else {
        entry.validator.validate(this, entry.attribute, value, this.errors);
      }
    }

    // Run custom validations
    for (const entry of ctor._customValidations) {
      if (!shouldValidate(this, entry.options)) continue;
      if (typeof entry.method === "function") {
        entry.method(this);
      } else if (typeof (this as AnyRecord)[entry.method] === "function") {
        (this as AnyRecord)[entry.method]();
      }
    }

    // Run after_validation callbacks
    ctor._callbackChain.runAfterSync("validation", this);

    return this.errors.empty;
  }

  /**
   * Run validations and return self.
   *
   * Mirrors: ActiveModel::Validations#validate
   */
  validate(context?: string | ValidationContext): this {
    this.isValid(context);
    return this;
  }

  isInvalid(): boolean {
    return !this.isValid();
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

  // -- Serialization --

  serializableHash(options?: SerializeOptions): Record<string, unknown> {
    return serializableHash(this, options);
  }

  asJson(options?: SerializeOptions): Record<string, unknown> {
    const hash = this.serializableHash(options);
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
   * Deserialize a JSON string into this model's attributes.
   *
   * Mirrors: ActiveModel::Serializers::JSON#from_json
   */
  fromJson(json: string, includeRoot = false): this {
    let attrs = JSON.parse(json);
    if (includeRoot && typeof attrs === "object") {
      const keys = Object.keys(attrs);
      if (keys.length === 1) {
        attrs = attrs[keys[0]];
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
      } else if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
        xml += `${indent}<${tag}>\n${this._hashToXml(value as Record<string, unknown>, indent + "  ")}${indent}</${tag}>\n`;
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
      } else if (value instanceof Date) {
        xml += `${indent}<${tag} type="dateTime">${value.toISOString()}</${tag}>\n`;
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
    const key = this.toKey();
    if (!key) return null;
    return key.map(String).join("-");
  }

  toPartialPath(): string {
    const mn = this.modelName;
    return `${mn.collection}/_${mn.element}`;
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
    const def = (this.constructor as typeof Model)._attributeDefinitions.get(name);
    return def ? def.type : null;
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
   */
  get validationContext(): string | null {
    return this._validationContext;
  }

  /**
   * Run validations, throw if invalid.
   *
   * Mirrors: ActiveModel::Validations#validate!
   */
  validateBang(context?: string): boolean {
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

  runCallbacks(event: string, block: () => void): boolean {
    return (this.constructor as typeof Model)._callbackChain.runSync(event, this, block);
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
