import { Errors } from "./errors.js";
import {
  ValidationContext,
  ValidationsContextHost,
  initInternals as validationsInitInternals,
  initializeDup as validationsInitializeDup,
  contextForValidation as validationsContextForValidation,
  runValidationsBang as validationsRunValidationsBang,
  raiseValidationError as validationsRaiseValidationError,
  predicateForValidationContext as validationsPredicateForValidationContext,
  _mergeAttributes as validationsMergeAttributes,
  VALID_OPTIONS_FOR_VALIDATE,
  readAttributeForValidation as validationsReadAttributeForValidation,
} from "./validations.js";
import { sanitizeForbiddenAttributes as forbiddenSanitize } from "./forbidden-attributes-protection.js";
import {
  Callbacks as ASCallbacks,
  defineCallbacks,
  resetCallbacks as asResetCallbacks,
  setCallback,
  runCallbacks,
  extend,
  include,
  prepend,
  runLoadHooks,
  wrap,
  ToJsonWithActiveSupportEncoder,
  type Included,
  type Extended,
  type CodeGenerator,
  Module,
  classAttribute,
  kernelArray,
} from "@blazetrails/activesupport";
import {
  humanAttributeName as translationHumanAttributeName,
  lookupAncestors as translationLookupAncestors,
} from "./translation.js";
import { Type } from "./type/value.js";
import { AttributeSet } from "./attribute-set.js";
import { ModelLike, ModelName } from "./naming.js";
import {
  DirtyTracker,
  type DirtyOptions,
  initInternals as dirtyInitInternals,
  initializeDup as dirtyInitializeDup,
} from "./dirty.js";
import { CallbackFn, CallbackConditions, defineModelCallbacks } from "./callbacks.js";
import {
  serializableHash,
  SerializeOptions,
  asJsonThenable,
  readAttributeForSerialization as serializationReadAttributeForSerialization,
  type SerializationRecord,
} from "./serialization.js";
import { BlockValidator, EachValidator, Validator as ValidatorBase } from "./validator.js";
import type { ValidatableRecord } from "./validator.js";
import type { ConditionalOptions } from "./validations.js";
import * as AttributeMethods from "./attribute-methods.js";
import {
  AttributeMethodPattern,
  type AttributeMethodMatch,
  defineMethodAttribute,
  _resurrectAttributeMethods,
} from "./attribute-methods.js";
import {
  _assignAttribute as attrAssignOne,
  assignAttributes as attrAssign,
  setAttributes as attrSetAttributes,
  attributeWriterMissing as defaultAttributeWriterMissing,
  isMassAssignmentEmpty,
  ArgumentError,
  NoMethodError,
} from "./attribute-assignment.js";
import { sanitizeForMassAssignment as attrSanitize } from "./forbidden-attributes-protection.js";
import {
  ClassMethods as ValidationsCallbacksClassMethods,
  type ValidationCallbackFilter,
  type ValidationCallbackOptions,
} from "./validations/callbacks.js";
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
import * as Validates from "./validations/validates.js";
import {
  ClassMethods as WithClassMethods,
  validatesWith as withValidatesWith,
} from "./validations/with.js";
import {
  type AttributeDefinition,
  Attributes,
  attribute,
  setDefineMethodAttribute,
  freeze as attributesFreeze,
  initializeDup as attributesInitializeDup,
} from "./attributes.js";
import {
  _defaultAttributes,
  attributeTypes,
  typeForAttribute as staticTypeForAttribute,
  decorateAttributes,
  pendingAttributeModifications as _pendingAttributeModificationsHelper,
  resetDefaultAttributesBang as _resetDefaultAttributesBangHelper,
  resolveTypeName as _resolveTypeNameHelper,
  hookAttributeType as _hookAttributeTypeHelper,
  type AttributeHostInternals,
} from "./attribute-registration.js";
import { _toPartialPath } from "./conversion.js";

/**
 * Mirrors: ActiveModel::Attributes::ClassMethods (attributes.rb:38-101) — the
 * class half `include ActiveModel::Attributes` contributes, mixed onto `Model`
 * by the `extend()` at the bottom of this file.
 *
 * `attribute_names` (attributes.rb:73-75) is not carried: `Model` defines its
 * own in the class body, and where Ruby's ancestry lets a class-body method
 * outrank the module's, `extend()` would overwrite it.
 */
const AttributesClassMethods = { attribute, setDefineMethodAttribute };

/**
 * Anything `validates_with` accepts: a full `Validator`/`EachValidator`
 * subclass, or any class that just implements `validate(record)`. Used by
 * `_validators` / `validators()` / `validatorsOn()` so the stored value
 * type matches what we actually accept at registration.
 */
type ValidatorLike = ValidatorBase | EachValidator | { validate(record: ValidatableRecord): void };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export interface Model {
  /**
   * `ActiveModel::Validations#validates_with` (validations/with.rb:144-151),
   * mixed on by the `include(Model, …)` at the bottom of this file.
   */
  validatesWith: typeof withValidatesWith;

  /** `ActiveSupport::ToJsonWithActiveSupportEncoder#to_json` (json.rb:35-43). */
  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];

  /**
   * The instance half of Ruby `include ActiveModel::AttributeMethods`
   * (attribute_methods.rb:73), installed by the `include(Model, …)` at the
   * bottom of this file. Declared as methods, not properties, so a subclass
   * may override `attribute_missing` the way Rails' cascade expects.
   */
  attributeMissing(match: AttributeMethodMatch, ...args: unknown[]): unknown;
  isAttributeMethod(attrName: string): boolean;
  matchedAttributeMethod(methodName: string): { proxyTarget: string; attrName: string } | null;
  missingAttribute(attrName: string, stack?: string): never;
  isRespondToWithoutAttributes(method: string, includePrivateMethods?: boolean): boolean;

  /**
   * The instance halves of Ruby `include ActiveModel::Validations`
   * (validations.rb:52) and `include ForbiddenAttributesProtection`
   * (model.rb:12-14), installed by the `include(Model, …)` calls at the bottom
   * of this file.
   *
   * @internal
   */
  contextForValidation(): ValidationContext;
  /** @internal */
  runValidationsBang(): Promise<boolean>;
  raiseValidationError(): never;
  readAttributeForValidation(attribute: string): unknown;
  /** @internal */
  sanitizeForbiddenAttributes(attributes: Record<string, unknown>): Record<string, unknown>;

  /**
   * `ActiveModel::Attributes#attribute_names` (attributes.rb:146-148),
   * installed on the prototype by the `include(Model, Attributes)` at the
   * bottom of this file. Declared here only for its type, which Model's index
   * signature otherwise widens to `unknown`; the merge spells it as a method
   * so ActiveRecord's own `attribute_names` override (attribute_methods.rb:
   * 334-336) stays assignable.
   */
  attributeNames(): string[];

  /**
   * The `super`-chained hooks Ruby's included modules define —
   * `Validations#init_internals` / `#initialize_dup` (validations.rb:467-471,
   * 310-313) and `Dirty#init_internals` / `#initialize_dup` (dirty.rb:371-376,
   * 248-251) — prepended in include order at the bottom of this file. As in
   * `model.rb`, this class defines no body for either.
   *
   * @internal
   */
  initInternals(): void;
  /** @internal */
  initializeDup(other: unknown): void;
}

/**
 * Model — the base class that bundles Attributes, Validations, Callbacks,
 * Dirty tracking, Serialization, and Naming.
 *
 * Mirrors: ActiveModel::Model (with all the included modules)
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Model {
  [key: string]: unknown;

  static includeRootInJson: boolean | string = false;
  // Rails: class_attribute :param_delimiter, instance_reader: false, default: "-"
  // (activemodel/lib/active_model/conversion.rb:32)
  static paramDelimiter: string = "-";
  static _attributeDefinitions: Map<string, AttributeDefinition> = new Map();
  // Runtime accessors come from the `classAttribute()` calls at the bottom of
  // this file (attribute_methods.rb:70-73).
  declare static attributeAliases: Record<string, string>;
  declare static isAttributeAliases: boolean;
  declare static attributeMethodPatterns: AttributeMethodPattern[];
  declare static isAttributeMethodPatterns: boolean;
  static _aliasesByAttributeName: Map<string, string[]> = new Map();
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
  declare private static _modelName: ModelName | null;

  declare static attribute: Extended<typeof AttributesClassMethods>["attribute"];
  declare static setDefineMethodAttribute: Extended<
    typeof AttributesClassMethods
  >["setDefineMethodAttribute"];
  static defineMethodAttribute = defineMethodAttribute;
  static _defaultAttributes = _defaultAttributes;
  static decorateAttributes = decorateAttributes;
  static attributeTypes = attributeTypes;
  static typeForAttribute = staticTypeForAttribute;
  static _toPartialPath = _toPartialPath;

  /** @internal Rails-private helper. */
  declare static pendingAttributeModifications: typeof _pendingAttributeModificationsHelper;

  /** @internal Rails-private helper. */
  declare static resetDefaultAttributesBang: typeof _resetDefaultAttributesBangHelper;

  /**
   * @internal Rails-private helper.
   *
   * ActiveModel::AttributeMethods is included after AttributeRegistration, so
   * its alias-resolving override (attribute_methods.rb:396-398) wins over
   * AttributeRegistration's `name.to_s` (attribute_registration.rb:101-103).
   */
  declare static resolveAttributeName: (name: string) => string;

  /** @internal Rails-private helper. */
  declare static resolveTypeName: typeof _resolveTypeNameHelper;

  /** @internal Rails-private helper. */
  static hookAttributeType(
    attribute: string,
    type: import("./type/value.js").Type,
  ): import("./type/value.js").Type {
    return _hookAttributeTypeHelper.call(
      this as unknown as AttributeHostInternals,
      attribute,
      type,
    );
  }

  /** Mirrors: ActiveModel::Attributes::ClassMethods#attribute_names (attributes.rb:74-75). */
  static attributeNames(): string[] {
    return Object.keys(this.attributeTypes());
  }

  /**
   * Mirrors: ActiveModel::Validations::ClassMethods#validates
   * (validations/validates.rb:111-133), mixed on by the
   * `extend(Model, Validates)` at the bottom of this file.
   */
  declare static validates: Extended<typeof Validates>["validates"];

  /**
   * Mirrors: ActiveModel::Validations::ClassMethods#validates!
   * (validations/validates.rb:153-157), mixed on by the
   * `extend(Model, Validates)` at the bottom of this file.
   */
  declare static validatesBang: Extended<typeof Validates>["validatesBang"];

  static clearValidatorsBang(): void {
    // Rails: `_validators.clear` (activemodel/lib/active_model/validations.rb:248).
    this._validators = new Map();
    asResetCallbacks(this.prototype, "validate");
  }

  /**
   * Mirrors: ActiveModel::Validations::ClassMethods#attribute_method?
   * (validations.rb:282-284) — `method_defined?(attribute)`. Ruby's
   * `method_defined?` walks the ancestor chain, which `in` does for a prototype.
   */
  static isAttributeMethod(attribute: string): boolean {
    return attribute in this.prototype;
  }

  /**
   * Mirrors: ActiveModel::Validations::ClassMethods#validate (validations.rb:160-185).
   * The key check runs only under `args.all?(Symbol)` — a block validator may carry
   * validator-ish keys. An unknown method name is a `send`-dispatched callback
   * filter, so it raises `NoMethodError` at validation time, not registration time.
   *
   * `on:` merges into `:if` (validations.rb:170-172) and `except_on:` into
   * `:unless` as an intersection of `Array(except_on)` with
   * `Array(o.validation_context)` (:174-182), so a nil context never intersects
   * and the validator still runs; the result goes straight to `set_callback`
   * (:184).
   */
  static validate<T extends ValidatableRecord = ValidatableRecord>(
    methodOrFn: string | ((record: T) => unknown),
    options: ConditionalOptions = {},
  ): void {
    if (typeof methodOrFn === "string") {
      for (const k of Object.keys(options)) {
        if (!(VALID_OPTIONS_FOR_VALIDATE as readonly string[]).includes(k)) {
          throw new ArgumentError(
            `Unknown key: :${k}. Valid keys are: ${VALID_OPTIONS_FOR_VALIDATE.map((v) => `:${v}`).join(", ")}. Perhaps you meant to call \`validates\` instead of \`validate\`?`,
          );
        }
      }
    }

    const fn: CallbackFn = (record: object) => {
      // Return the underlying result so a Promise-returning validator flows
      // into the callback runner, which awaits it (RFC 0063 made the validation
      // chain async) rather than dropping it as an unhandled rejection. Most
      // validators are synchronous like Rails; the exception is a DB-backed one
      // such as `uniqueness`, whose existence check the awaited chain runs
      // inline.
      const r = record as T & Record<string, unknown>;
      if (typeof methodOrFn === "function") {
        // Bind `this` to the record so block validators written as
        // `function () { this.foo }` (Rails `instance_exec`) resolve `this`,
        // while arrow validators reading the `record` arg keep working.
        return methodOrFn.call(r, r) as void;
      } else if (typeof r[methodOrFn] === "function") {
        return (r[methodOrFn] as () => void)();
      }
      throw new NoMethodError(
        `undefined method '${methodOrFn}' for an instance of ${r.constructor.name}`,
      );
    };
    let ifConds = kernelArray(options.if as CallbackConditions["if"]);
    let unlessConds = kernelArray(options.unless as CallbackConditions["unless"]);

    if (options.on !== undefined) {
      const pred = validationsPredicateForValidationContext(options.on);
      ifConds = [(record: object) => pred(record as ValidationsContextHost), ...ifConds];
    }

    if (options.exceptOn !== undefined) {
      const exceptOn = kernelArray(options.exceptOn);
      unlessConds = [
        (record: object) => {
          const current = kernelArray(
            (record as unknown as ValidationsContextHost).validationContext,
          );
          return exceptOn.some((c) => current.includes(c));
        },
        ...unlessConds,
      ];
    }

    setCallback(this.prototype, "validate", fn, {
      ...(ifConds.length > 0 ? { if: ifConds } : {}),
      ...(unlessConds.length > 0 ? { unless: unlessConds } : {}),
      ...(options.prepend ? { prepend: true } : {}),
    });
  }

  /**
   * Validates each of the specified attributes with a block.
   *
   * Mirrors: ActiveModel::Validations.validates_each —
   * `validates_with BlockValidator, _merge_attributes(attr_names), &block`
   * (activemodel/lib/active_model/validations.rb:190-192). `_merge_attributes`
   * flattens, so a nested `[:title, :content]` contributes its members again.
   * `validates_with` registers through `validate(validator, options)`
   * (with.rb:103), which is where the `on:` / `except_on:` merge happens.
   */
  static validatesEach<T extends ValidatableRecord = ValidatableRecord>(
    attrNames: Array<string | string[]>,
    fn: (record: T, attribute: string, value: unknown) => void,
    options: ConditionalOptions = {},
  ): void {
    const validator = new BlockValidator(
      { ...this._mergeAttributes([...attrNames]), ...options },
      fn as (record: ValidatableRecord, attribute: string, value: unknown) => void,
    );
    this._registerValidator(validator);
    this.validate((record: ValidatableRecord) => validator.validate(record), options);
  }

  /**
   * Validates using a custom validator class instance.
   * The validator must implement validate(record).
   *
   * Mirrors: ActiveModel::Validations::ClassMethods#validates_with
   * (validations/with.rb:88-105), mixed on by the `extend(Model, …)` at the
   * bottom of this file.
   */
  declare static validatesWith: Extended<typeof WithClassMethods>["validatesWith"];

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
   * Return validators registered for the given attributes. O(1) bucket
   * lookup per attribute — Rails
   * `attributes.flat_map { |attribute| _validators[attribute.to_sym] }`
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
  static validatorsOn(...attributes: string[]): Array<ValidatorLike> {
    return attributes.flatMap((attribute) => this._validators.get(attribute) ?? []);
  }

  // -- Individual validator helper methods --
  // These mirror the Rails validates_*_of shorthand methods

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_presence_of
   *   validates_with PresenceValidator, _merge_attributes(attr_names)
   */
  static validatesPresenceOf(...attrNames: unknown[]): void {
    this.validatesWith(PresenceValidator, this._mergeAttributes(attrNames));
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_absence_of
   *   validates_with AbsenceValidator, _merge_attributes(attr_names)
   */
  static validatesAbsenceOf(...attrNames: unknown[]): void {
    this.validatesWith(AbsenceValidator, this._mergeAttributes(attrNames));
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_length_of
   *   validates_with LengthValidator, _merge_attributes(attr_names)
   */
  static validatesLengthOf(...attrNames: unknown[]): void {
    this.validatesWith(LengthValidator, this._mergeAttributes(attrNames));
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_numericality_of
   *   validates_with NumericalityValidator, _merge_attributes(attr_names)
   */
  static validatesNumericalityOf(...attrNames: unknown[]): void {
    this.validatesWith(NumericalityValidator, this._mergeAttributes(attrNames));
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_inclusion_of
   *   validates_with InclusionValidator, _merge_attributes(attr_names)
   */
  static validatesInclusionOf(...attrNames: unknown[]): void {
    this.validatesWith(InclusionValidator, this._mergeAttributes(attrNames));
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_exclusion_of
   *   validates_with ExclusionValidator, _merge_attributes(attr_names)
   */
  static validatesExclusionOf(...attrNames: unknown[]): void {
    this.validatesWith(ExclusionValidator, this._mergeAttributes(attrNames));
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_format_of
   *   validates_with FormatValidator, _merge_attributes(attr_names)
   */
  static validatesFormatOf(...attrNames: unknown[]): void {
    this.validatesWith(FormatValidator, this._mergeAttributes(attrNames));
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_acceptance_of
   *   validates_with AcceptanceValidator, _merge_attributes(attr_names)
   *
   * `validatesWith` injects the host class and invokes the validator's
   * `setupBang` (Rails' `setup!(options[:class])`), which materializes the
   * virtual acceptance accessors on the prototype; the constructor's
   * setter-dispatch mass-assignment honors them.
   */
  static validatesAcceptanceOf(...attrNames: unknown[]): void {
    this.validatesWith(AcceptanceValidator, this._mergeAttributes(attrNames));
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_confirmation_of
   *   validates_with ConfirmationValidator, _merge_attributes(attr_names)
   *
   * As with acceptance, `validatesWith` invokes the validator's `setupBang`
   * (Rails' `setup!`), which defines the `${attr}Confirmation` accessors on
   * the prototype; the constructor's setter-dispatch mass-assignment accepts
   * them.
   */
  static validatesConfirmationOf(...attrNames: unknown[]): void {
    this.validatesWith(ConfirmationValidator, this._mergeAttributes(attrNames));
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods.validates_comparison_of
   *   validates_with ComparisonValidator, _merge_attributes(attr_names)
   */
  static validatesComparisonOf(...attrNames: unknown[]): void {
    this.validatesWith(ComparisonValidator, this._mergeAttributes(attrNames));
  }

  /**
   * Mirrors: ActiveModel::Validations::HelperMethods `alias_method
   * :validates_size_of, :validates_length_of` (length.rb:128).
   */
  static validatesSizeOf(...attrNames: unknown[]): void {
    this.validatesWith(LengthValidator, this._mergeAttributes(attrNames));
  }

  // The `ActiveModel::Validations::Callbacks::ClassMethods` half
  // (validations/callbacks.rb:32-110), mixed on by the `extend(Model, …)` at
  // the bottom of this file. Declared here only for their types.
  declare static beforeValidation: <T extends typeof Model>(
    this: T,
    fn: ValidationCallbackFilter<T>,
    options?: ValidationCallbackOptions,
  ) => void;
  declare static afterValidation: <T extends typeof Model>(
    this: T,
    fn: ValidationCallbackFilter<T>,
    options?: ValidationCallbackOptions,
  ) => void;

  /**
   * The `ActiveSupport::Callbacks::ClassMethods` half (callbacks.rb:733-820),
   * which Rails gets from `include ActiveSupport::Callbacks` (callbacks.rb:66-69);
   * mixed on by the `extend(Model, Callbacks.ClassMethods)` at the bottom of
   * this file, and typed from that module object rather than restated here.
   */
  declare static setCallback: Extended<typeof ASCallbacks.ClassMethods>["setCallback"];
  declare static skipCallback: Extended<typeof ASCallbacks.ClassMethods>["skipCallback"];
  declare static resetCallbacks: Extended<typeof ASCallbacks.ClassMethods>["resetCallbacks"];

  static _ensureOwnValidators(): void {
    // Copy-on-first-write dup. Rails' `inherited(base)` hook
    // (activemodel/lib/active_model/validations.rb:287-291) does this
    // eagerly at class-definition time; JS has no such hook, so we defer
    // the dup until the first write on the subclass. Produces an
    // independent top-level Map whose per-attribute arrays are also fresh,
    // matching Rails' `dup.each { |k, v| dup[k] = v.dup }` — downward
    // writes from the subclass never leak up to the parent.
    if (!Object.hasOwn(this, "_validators")) {
      const cloned = new Map<string | null, Array<ValidatorLike>>();
      for (const [k, arr] of this._validators) cloned.set(k, [...arr]);
      this._validators = cloned;
    }
  }

  /**
   * Register `validator` under each of its declared attributes (or under
   * the `null` key when none are declared) — the `_validators[...] <<
   * validator` half of Rails `validates_with` (validations/with.rb:95-101),
   * reached here from `validates_each`, whose Rails body registers by routing
   * through `validates_with` itself (validations.rb:190-192).
   */
  private static _registerValidator(validator: ValidatorLike): void {
    this._ensureOwnValidators();
    const attributes = (validator as { attributes?: readonly string[] }).attributes;
    const keys: Array<string | null> =
      Array.isArray(attributes) && attributes.length > 0 ? attributes.map(String) : [null];
    for (const key of keys) {
      let bucket = this._validators.get(key);
      if (!bucket) {
        bucket = [];
        this._validators.set(key, bucket);
      }
      bucket.push(validator);
    }
  }

  /**
   * Define custom model callbacks.
   * Creates beforeX(), afterX(), and aroundX() class methods for each event name.
   *
   * Mirrors: ActiveModel::Callbacks.define_model_callbacks
   */
  static defineModelCallbacks = defineModelCallbacks;

  static humanAttributeName = translationHumanAttributeName;

  /**
   * The i18n scope for translation lookups.
   *
   * Mirrors: ActiveModel::Translation.i18n_scope
   */
  static get i18nScope(): string {
    return "activemodel";
  }

  // Ruby `include ActiveModel::AttributeMethods` (attribute_methods.rb:73)
  // brings the whole ClassMethods surface along; the `extend(Model, …)` at the
  // bottom of this file installs it, and these declarations are its type side.
  declare static attributeMethodPrefix: (
    ...prefixes: Array<string | { parameters?: string | null | false }>
  ) => void;
  declare static attributeMethodSuffix: (
    ...suffixes: Array<string | { parameters?: string | null | false }>
  ) => void;
  declare static attributeMethodAffix: (
    ...affixes: Array<{ prefix: string; suffix: string; parameters?: string | null | false }>
  ) => void;
  declare static aliasAttribute: (newName: string, oldName: string) => void;
  declare static eagerlyGenerateAliasAttributeMethods: (newName: string, oldName: string) => void;
  declare static defineAttributeMethods: (...attrNames: string[]) => void;
  declare static defineAttributeMethod: (
    attrName: string,
    options?: { _owner?: Module | CodeGenerator; as?: string },
  ) => void;
  declare static defineAttributeMethodPattern: (
    pattern: AttributeMethodPattern,
    attrName: string,
    options: { owner: CodeGenerator; as: string; override?: boolean },
  ) => void;
  declare static undefineAttributeMethods: () => void;
  declare static generatedAttributeMethods: () => Module;
  declare static isInstanceMethodAlreadyImplemented: (methodName: string) => boolean;
  declare static attributeMethodPatternsCache: () => Map<
    string,
    Array<{ proxyTarget: string; attrName: string }>
  >;
  declare static attributeMethodPatternsMatching: (
    methodName: string,
  ) => Array<{ proxyTarget: string; attrName: string }>;

  declare static lookupAncestors: () => Array<{
    new (...args: never[]): unknown;
    modelName: ModelName;
  }>;

  /**
   * Optional `::`-joined Ruby module path for a namespaced model (e.g.
   * `"Admin"` for `Admin::User`, `"MyApplication::Business"`). JS class names
   * carry no module path, so this carrier lets STI/polymorphic `type` values
   * and `modelName` reconstruct the qualified Rails constant name.
   */
  declare static moduleName?: string;

  /**
   * Mirrors Rails `model_name` (naming.rb:270-277). The namespace is the
   * enclosing module, carried as `moduleName` because a JS class has no module
   * path; `@_model_name ||=` is a per-class ivar, so the memo is an own
   * property rather than an inherited one.
   */
  static get modelName(): ModelName {
    if (!Object.hasOwn(this, "_modelName") || !this._modelName) {
      // Rails walks `module_parents` for a module answering
      // `use_relative_model_naming?` (naming.rb:271-276). JS has no
      // enclosing-module chain to walk, so nothing can declare relative naming
      // and the detect answers nil.
      const namespace = null;
      this._modelName = new ModelName(this as unknown as ModelLike, namespace);
    }
    return this._modelName;
  }

  _attributes: AttributeSet = new AttributeSet();
  errors!: Errors<this>;
  _dirty!: DirtyTracker;

  /**
   * True only while the constructor is assigning its initial attribute bag
   * through `assign_attributes` (per-key setter dispatch). This flag lets the
   * AR write path detect the window (e.g. composite-PK `id=` remap) without
   * re-raising mid-construction.
   *
   * @internal
   */
  _initializingAttributes = false;

  /**
   * Build the `if`-predicate that gates a validator on a validation
   * context. Mirrors Rails `predicate_for_validation_context`
   * (validations.rb:296-306).
   *
   * @internal Rails-private helper.
   */
  static predicateForValidationContext = validationsPredicateForValidationContext;

  /**
   * Normalize the trailing options hash from a `validates_each`
   * argument list and stamp `attributes:` onto it. Mirrors Rails
   * `Validations::HelperMethods#_merge_attributes`.
   *
   * @internal Rails-private helper.
   */
  static _mergeAttributes(attrNames: unknown[]): Record<string, unknown> {
    return validationsMergeAttributes(attrNames);
  }

  /**
   * Default option keys recognized by `validates(...)`. Subclasses
   * override to add custom keys. Mirrors Rails
   * `_validates_default_keys` (validations/validates.rb:162-164).
   *
   * @internal Rails-private helper.
   */
  declare static _validatesDefaultKeys: Extended<typeof Validates>["_validatesDefaultKeys"];

  /**
   * Normalize a validator option value into the option hash the
   * validator constructor expects. Mirrors Rails
   * `_parse_validates_options` (validations/validates.rb:166-177).
   *
   * @internal Rails-private helper.
   */
  declare static _parseValidatesOptions: Extended<typeof Validates>["_parseValidatesOptions"];

  /**
   * Mirrors: ActiveModel::API#initialize → ActiveModel::Attributes#initialize
   *
   * Rails pattern:
   *   Attributes#initialize: @attributes = self.class._default_attributes.deep_dup
   *   API#initialize:        assign_attributes(attributes); super()
   */
  constructor(attrs: Record<string, unknown> = {}) {
    const ctor = this.constructor as typeof Model;

    // Mirrors Rails' init_internals chain (validations.rb:467,
    // dirty.rb:372). Field initializers above already produce the
    // same end-state, but routing through the chainable hook keeps
    // a single point that subclasses (e.g. ActiveRecord) override.
    this.initInternals();

    _resurrectAttributeMethods(ctor as unknown as Parameters<typeof _resurrectAttributeMethods>[0]);

    this._attributes = ctor._defaultAttributes().deepDup();

    // API#initialize — assign_attributes(attributes) (api.rb:80-82), which runs
    // `sanitize_for_mass_assignment` (ForbiddenAttributesProtection) before the
    // per-key dispatch: an unpermitted `ActionController::Parameters`-like bag
    // raises `ForbiddenAttributesError` at construction, a permitted one is
    // unwrapped via `to_h`, and a plain hash passes through untouched. Each key
    // is then routed through `_assignAttribute` → setter dispatch, exactly like
    // Rails' `_assign_attribute` (attribute_assignment.rb:67-75): a key with a
    // writer (a framework-generated attribute setter, a user-defined `set name`,
    // or a nested-attribute `<assoc>Attributes=` setter) dispatches through it,
    // and a genuinely-unknown, writer-less key routes to `attributeWriterMissing`
    // (→ `UnknownAttributeError`). The `_initializingAttributes` window lets the
    // AR write path detect construction (e.g. composite-PK `id=` remap) without
    // re-raising mid-construction. Empty bag is a no-op — mirrors
    // `assign_attributes`' `return if new_attributes.empty?` (so a subclass
    // `_assignAttributes` override isn't invoked for `new Model({})`, and neither
    // is sanitization). The ActiveRecord `Base` constructor sanitizes before
    // `super()`, converting any params wrapper to a plain hash, so this second
    // sanitize on the AR path no-ops rather than double-checking.
    this._initializingAttributes = true;
    try {
      if (!isMassAssignmentEmpty(attrs)) {
        this._assignAttributes(this.sanitizeForMassAssignment(attrs));
      }
    } finally {
      this._initializingAttributes = false;
    }

    this._dirty.snapshot(this._attributes);

    // Fire after_initialize callbacks. ActiveRecord intentionally uses the
    // duck-typed `_suppressInitializeCallback` hook during DB hydration so it
    // can defer constructor-time after_initialize, run after_find first, and
    // then fire after_initialize in Rails-compatible order.
    const callbackSuppressor = ctor as typeof ctor & { _suppressInitializeCallback?: boolean };
    if (callbackSuppressor._suppressInitializeCallback !== true) {
      void runCallbacks(this, "initialize", undefined, { strict: "sync" });
    }
  }

  /**
   * @internal
   * Mirrors AR `_read_attribute(attr_name, &block)` — reads directly from the
   * attribute store, optionally yielding a known-but-unselected column's name to
   * `block` (which the generated getters / `[]` use to raise
   * MissingAttributeError). Without a block, an unselected column reads as nil,
   * matching plain `read_attribute`/`_read_attribute`.
   */
  _readAttribute(name: string, block?: (name: string) => unknown): unknown {
    return this._attributes.fetchValue(name, block) ?? null;
  }

  /** Mirrors: ActiveModel::Attributes `alias :attribute= :_write_attribute` (attributes.rb:159). */
  "attribute="(name: string, value: unknown): void {
    this._writeAttribute(name, value);
  }

  /**
   * Rails computes nothing here: `write_from_user` builds a `FromUser` whose
   * `@value` stays uncomputed, so `has_been_read?` is false after a write and
   * `accessed_fields` is empty on a freshly built record
   * (attribute_methods_test.rb:1308). The write is recorded against the
   * tracker without casting: the cast reaches `type.changed?` from
   * `Attribute#changed?` (attribute.rb:155-160) when someone asks.
   *
   * @internal
   */
  _writeAttribute(name: string, value: unknown): void {
    this._attributes.writeFromUser(name, value);
    this._dirty.attributeWritten(name);
  }

  /** Mirrors ActiveModel::Serializers::JSON `class_attribute :include_root_in_json` instance reader. */
  get includeRootInJson(): boolean | string {
    return (this.constructor as typeof Model).includeRootInJson;
  }

  /**
   * `ActiveModel::Attributes#attributes` (attributes.rb:131-133), installed on
   * the prototype by the `include(Model, Attributes)` at the bottom of this
   * file. Declared here only for its type: `Included<>` derives callable
   * methods and cannot carry an accessor's type across the mixin.
   */
  declare attributes: Record<string, unknown>;

  // Rails `validation_context` holds either a single Symbol or an
  // Array<Symbol> (or nil). `valid?([:create, :publish])` round-trips
  // the array so `on: :create` / `on: [:create]` / `on: [:create, :other]`
  // validators all fire. See `validations.rb:361-368` and `:294-306`.
  /**
   * Rails has no `@validation_context` ivar — the context lives on the
   * `ValidationContext` (validations.rb:463-470). Writing through that object
   * rather than a model field is what lets a frozen model be validated.
   *
   * @internal
   */
  get _validationContext(): string | string[] | null {
    return this.contextForValidation().context;
  }

  /** @internal */
  set _validationContext(value: string | string[] | null) {
    this.contextForValidation().context = value;
  }

  /**
   * Lazy-initialized `ValidationContext`, which owns the active context. Set on
   * first `contextForValidation()` call and cleared by `initInternals()`.
   *
   * @internal
   */
  _contextForValidation?: ValidationContext;

  /**
   * Lazy accessor for the active `ValidationContext`. Mirrors Rails
   * `context_for_validation` (validations.rb:463-465).
   *
   * @internal Rails-private helper.
   */

  /**
   * Run the `:validate` callbacks and report whether the model has no
   * errors. Mirrors Rails `run_validations!` (validations.rb:473-476).
   *
   * @internal Rails-private helper.
   */

  /**
   * Throw `ValidationError` for the current model. Mirrors Rails
   * `raise_validation_error` (validations.rb:478-480).
   *
   * @internal Rails-private helper.
   */

  /**
   * Mirrors: ActiveModel::Validations#valid? (validations.rb:361-368) — read the
   * current context, write the new one through `context_for_validation`, restore
   * in `ensure`.
   */
  async isValid(context?: string | string[] | ValidationContext | null): Promise<boolean> {
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
    const currentContext = this.validationContext;
    this.contextForValidation().context = normalized;

    try {
      // Rails: `run_validations!` is the block, and its truthy return becomes
      // run_callbacks' value; `false` here means the chain halted.
      const completed = await runCallbacks(this, "validation", async () => {
        await this.runValidationsBang();
        return true;
      });
      if (!completed) return false;
      return this.errors.empty;
    } finally {
      this.contextForValidation().context = currentContext;
    }
  }

  /** @internal */
  async _runValidateCallbacks(): Promise<void> {
    const ctor = this.constructor as typeof Model;
    await runCallbacks(this, "validate");
  }

  /**
   * Run validations and return whether the record is valid.
   *
   * Mirrors Rails `alias_method :validate, :valid?`
   * (activemodel/lib/active_model/validations.rb:370).
   */
  validate(context?: string | string[] | ValidationContext | null): Promise<boolean> {
    return this.isValid(context);
  }

  /**
   * Opposite of `isValid`. Accepts an optional context.
   *
   * Mirrors Rails `def invalid?(context = nil); !valid?(context); end`
   * (activemodel/lib/active_model/validations.rb:408-410).
   */
  async isInvalid(context?: string | string[] | ValidationContext | null): Promise<boolean> {
    return !(await this.isValid(context));
  }

  /**
   * Mirrors: HelperMethods#validates_presence_of (validations/presence.rb:34-36).
   * Rails both `extend`s and `include`s `HelperMethods` (validations.rb:45-46), so
   * the helpers run on the spot on an instance — what a `validate do…end` calls.
   */
  async validatesPresenceOf(...attrNames: unknown[]): Promise<void> {
    await this.validatesWith(
      PresenceValidator,
      (this.constructor as typeof Model)._mergeAttributes([...attrNames]),
    );
  }

  /** Mirrors: HelperMethods#validates_length_of (validations/length.rb:123-125). */
  async validatesLengthOf(...attrNames: unknown[]): Promise<void> {
    await this.validatesWith(
      LengthValidator,
      (this.constructor as typeof Model)._mergeAttributes([...attrNames]),
    );
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
   * tripping their `||=` lazy-init. Trails mirrors that by reading
   * `errors` and calling `contextForValidation()` to populate its
   * cached `ValidationContext`. The `validationContext` getter alone
   * is not enough — it doesn't write to `_contextForValidation`, so a
   * subsequent `contextForValidation()` call on the frozen instance
   * would throw on the cache assignment.
   */
  freeze(): this {
    void this.errors;
    // Pre-materialize the lazy ValidationContext cache so callers can
    // still invoke `contextForValidation()` on a frozen instance —
    // Rails does the equivalent at validations.rb:374 by touching
    // `context_for_validation` inside `freeze`. Touching
    // `validationContext` alone would not populate the cache.
    void this.contextForValidation();
    // validations.rb:376 — `super` reaches `Attributes#freeze` (attributes.rb:150-153).
    attributesFreeze.call(this);
    Object.freeze(this);
    return this;
  }

  /**
   * Mirrors Ruby's `Object#dup`: allocate, copy the ivars, dispatch
   * `initialize_dup`; like Ruby `dup` it does NOT re-enter the constructor, and
   * the copy is unfrozen even from a frozen source — the descriptors are copied
   * writable and configurable, both so a frozen source yields a mutable copy and
   * so an own accessor property (the alias reader ActiveRecord installs for a
   * select alias, where Ruby answers through `method_missing`) arrives as an
   * accessor rather than a flattened snapshot of the source's value. Rails
   * splits the hook across three modules chained by `super` —
   * `Attributes#initialize_dup` deep-dups `@attributes` (attributes.rb:111-114),
   * `Validations#initialize_dup` replaces `@errors` (validations.rb:310-313),
   * `Dirty#initialize_dup` rebuilds the mutation trackers (dirty.rb:248-251).
   * All three are links in the {@link initializeDup} chain, so `dup` only
   * allocates and dispatches.
   */
  dup(): this {
    const duped = Object.create(Object.getPrototypeOf(this) as object) as this;
    const descriptors = Object.getOwnPropertyDescriptors(this);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key as string];
      descriptor.configurable = true;
      if (!descriptor.get && !descriptor.set) descriptor.writable = true;
    }
    Object.defineProperties(duped, descriptors);
    duped.initializeDup(this);
    return duped;
  }

  /**
   * Returns `true` if any of the attributes has unsaved changes.
   *
   * Mirrors: ActiveModel::Dirty#changed? (dirty.rb:285-288)
   */
  get isChanged(): boolean {
    return this._dirty.changed;
  }

  /**
   * Returns an array with the name of the attributes with unsaved changes.
   *
   * Mirrors: ActiveModel::Dirty#changed (dirty.rb:294-297)
   */
  get changed(): string[] {
    return this._dirty.changedAttributeNames;
  }

  /**
   * Map of each changed attribute's name to its old (pre-change) value.
   *
   * Mirrors: ActiveModel::Dirty#changed_attributes
   */
  get changedAttributes(): Record<string, unknown> {
    return this._dirty.changedAttributes;
  }

  get changes(): Record<string, [unknown, unknown]> {
    return this._dirty.changes;
  }

  /**
   * Mirrors: ActiveModel::Dirty#attribute_changed? (dirty.rb:300-302) —
   * `mutations_from_database.changed?(attr_name.to_s, **options)`.
   */
  attributeChanged(name: string, options?: DirtyOptions): boolean {
    return this._dirty.attributeChanged(
      (this.constructor as typeof Model).resolveAttributeName(name),
      options,
    );
  }

  attributeWas(name: string): unknown {
    return this._dirty.attributeWas((this.constructor as typeof Model).resolveAttributeName(name));
  }

  /** @internal */
  attributeChange(name: string): [unknown, unknown] | null {
    return this._dirty.attributeChange(
      (this.constructor as typeof Model).resolveAttributeName(name),
    );
  }

  get previousChanges(): Record<string, [unknown, unknown]> {
    return this._dirty.previousChanges;
  }

  /**
   * Check if a specific attribute changed in the last save.
   * Alias for savedChangeToAttribute.
   *
   * Mirrors: ActiveModel::Dirty#attribute_previously_changed?
   */
  attributePreviouslyChanged(name: string, options?: DirtyOptions): boolean {
    return this._dirty.attributePreviouslyChanged(
      (this.constructor as typeof Model).resolveAttributeName(name),
      options,
    );
  }

  /**
   * Get the value of an attribute before the last save.
   * Alias for attributeBeforeLastSave.
   *
   * Mirrors: ActiveModel::Dirty#attribute_previously_was
   */
  attributePreviouslyWas(name: string): unknown {
    name = (this.constructor as typeof Model).resolveAttributeName(name);
    const change = this._dirty.previousChanges[name];
    return change ? change[0] : this._readAttribute(name);
  }

  /**
   * Restore all previous data of the provided attributes.
   *
   * Mirrors: ActiveModel::Dirty#restore_attributes (dirty.rb:319-322)
   */
  restoreAttributes(attrNames: string[] = this.changed): void {
    attrNames.forEach((attrName) => this.restoreAttribute(attrName));
  }

  /**
   * Force-mark an attribute as changed without changing its value.
   * Used for in-place mutations where the object reference stays the same
   * but the content has changed, or to mark a virtual attribute dirty.
   *
   * Returns the forced value, mirroring Rails where `attribute_will_change!`
   * returns `mutations_from_database.force_change(...)` (dirty.rb:409-410) — a
   * truthy value relied on by `assert pirate.catchphrase_will_change!`.
   *
   * Mirrors: ActiveModel::Dirty#attribute_will_change!
   */
  attributeWillChange(name: string): unknown {
    const resolved = (this.constructor as typeof Model).resolveAttributeName(name);
    return this._dirty.forceChange(resolved);
  }

  /**
   * Restore a single attribute to its pre-change value.
   *
   * Mirrors: ActiveModel::Dirty#restore_attribute!
   */
  restoreAttribute(name: string): void {
    this._dirty.restoreAttribute(
      this._attributes,
      (this.constructor as typeof Model).resolveAttributeName(name),
    );
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
    return this._dirty.previousChanges[
      (this.constructor as typeof Model).resolveAttributeName(name)
    ];
  }

  changesApplied(): void {
    this._dirty.changesApplied(this._attributes);
    this._attributes.forgetAssignmentsBang();
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
    this._attributes.forgetAssignmentsBang();
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

  serializableHash(options?: SerializeOptions): Record<string, unknown> {
    return serializableHash(this, options);
  }

  asJson(options?: SerializeOptions): Record<string, unknown> {
    const ctor = this.constructor as typeof Model;
    return asJsonThenable(
      () => this.serializableHash(options),
      ctor.includeRootInJson,
      () => ctor.modelName.element,
      options ?? {},
    );
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
    // Rails' `self.attributes = hash` routes through `assign_attributes`,
    // which raises `ArgumentError` when the payload isn't hash-like
    // (attribute_assignment.rb:29-30). Surface the same class loudly with
    // shape-accurate diagnostics, matching JSONSerializer.fromJson
    // (serializers/json.ts).
    const shapeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v);
    if (!isPlainObject(attrs)) {
      throw new ArgumentError(`fromJson expected a JSON object, got ${shapeOf(attrs)}`);
    }
    if (root !== false && root != null) {
      attrs = Object.values(attrs)[0];
      if (!isPlainObject(attrs)) {
        throw new ArgumentError(
          `fromJson root payload must be a JSON object, got ${shapeOf(attrs)}`,
        );
      }
    }
    for (const [key, value] of Object.entries(attrs)) {
      this._writeAttribute(key, value);
    }
    return this;
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
  assignAttributes(newAttributes: unknown): Promise<void> | void {
    return attrAssign(this, newAttributes);
  }

  /**
   * Mirrors: `alias attributes= assign_attributes` (attribute_assignment.rb:36).
   */
  setAttributes(newAttributes: unknown): Promise<void> | void {
    return attrSetAttributes(this, newAttributes);
  }

  /**
   * @internal Rails-private helper.
   */
  _assignAttributes(attributes: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(attributes)) {
      void this._assignAttribute(k, v);
    }
  }

  /**
   * @internal Rails-private helper.
   */
  _assignAttribute(k: string, v: unknown): Promise<void> | void {
    return attrAssignOne(this, k, v);
  }

  /**
   * @internal Rails-private helper.
   */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown> {
    return attrSanitize(attributes);
  }

  /**
   * Mirrors: ActiveModel::ForbiddenAttributesProtection
   * (`alias :sanitize_forbidden_attributes :sanitize_for_mass_assignment`).
   *
   * @internal Rails-private helper.
   */

  /**
   * Mirrors: ActiveModel::Validations
   * (`alias :read_attribute_for_validation :send`). Reads the attribute by
   * name; ActiveRecord overrides to resolve associations.
   */

  /**
   * Mirrors: ActiveModel::Serialization
   * (`alias :read_attribute_for_serialization :send`). Public, overridable hook;
   * dispatches the named reader, falling back to the attribute store.
   */
  readAttributeForSerialization(key: string): unknown {
    return serializationReadAttributeForSerialization(this as unknown as SerializationRecord, key);
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
    if (typeof (this as unknown as Record<string, unknown>)[method] === "function") return true;
    if (this._attributes.has(method)) return true;
    return false;
  }

  /**
   * Returns the type of the attribute (the Type object).
   *
   * Mirrors: ActiveModel::Attributes#attribute_for_inspect
   */
  typeForAttribute(name: string, block?: () => Type): Type {
    return (this.constructor as typeof Model).typeForAttribute(name, block);
  }

  /**
   * Check if an attribute value has changed in-place (by identity).
   *
   * Mirrors: ActiveModel::Dirty#attribute_changed_in_place?
   */
  attributeChangedInPlace(name: string): boolean {
    const current = this._readAttribute(
      (this.constructor as typeof Model).resolveAttributeName(name),
    );
    const recorded = this._dirty.mutationsFromDatabase[name];
    if (recorded) return current !== recorded[1];
    const original = this._dirty.attributeWas(name);
    if (original === undefined) return false;
    return original !== current;
  }

  /**
   * Return an array of all key attributes if any of the attributes is set,
   * whether or not the object is persisted.
   *
   * Mirrors: ActiveModel::Conversion#to_key
   */
  toKey(): unknown[] | null {
    // conversion.rb:67-70 — `key = respond_to?(:id) && id; key ? Array(key) : nil`.
    // `Array(key)` is what keeps a composite `id` from being double-wrapped.
    const key = this.respondTo("id") ? this._readAttribute("id") : false;
    return key != null && key !== false ? wrap(key) : null;
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
  async validateBang(context?: string | string[] | ValidationContext | null): Promise<true> {
    if (!(await this.isValid(context))) {
      this.raiseValidationError();
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
      result[m] = this._readAttribute((this.constructor as typeof Model).resolveAttributeName(m));
    }
    return result;
  }

  /**
   * Return attribute values as an array.
   *
   * Mirrors: ActiveModel::Access#values_at
   */
  valuesAt(...methods: (string | string[])[]): unknown[] {
    return methods
      .flat()
      .map((m) => this._readAttribute((this.constructor as typeof Model).resolveAttributeName(m)));
  }

  /**
   * `run_callbacks` (callbacks.rb:96-104), mixed on by the
   * `include(Model, Callbacks.InstanceMethods)` at the bottom of this file.
   */
  declare runCallbacks: Included<typeof ASCallbacks.InstanceMethods>["runCallbacks"];
}

// Rails' `included do` block (attribute_methods.rb:70-73).
classAttribute.call(Model, "attributeAliases", { instanceWriter: false, default: {} });
classAttribute.call(Model, "attributeMethodPatterns", {
  instanceWriter: false,
  default: [new AttributeMethodPattern()],
});

// Ruby `include ActiveModel::Validations` brings ClassMethods#validates and
// friends (validations/validates.rb:111-178) onto the class.
extend(Model, WithClassMethods);
include(Model, { validatesWith: withValidatesWith });

extend(Model, {
  validates: Validates.validates,
  validatesBang: Validates.validatesBang,
  _validatesDefaultKeys: Validates._validatesDefaultKeys,
  _parseValidatesOptions: Validates._parseValidatesOptions,
});

// Ruby `extend ActiveModel::Translation` (translation.rb:22, via naming.rb).
extend(Model, { lookupAncestors: translationLookupAncestors });

// Ruby `include ActiveModel::AttributeRegistration` (attribute_registration.rb:8).
extend(Model, {
  pendingAttributeModifications: _pendingAttributeModificationsHelper,
  resetDefaultAttributesBang: _resetDefaultAttributesBangHelper,
  resolveTypeName: _resolveTypeNameHelper,
});
// `include ActiveModel::AttributeMethods` lands after AttributeRegistration
// (model.rb:12-14), so its alias-resolving `resolve_attribute_name` override
// (attribute_methods.rb:396-398) wins over the registration one. The module's
// ClassMethods land on the class and its instance methods on instances, which
// is what lets every ported body self-send them.
extend(Model, {
  attributeMethodPrefix: AttributeMethods.attributeMethodPrefix,
  attributeMethodSuffix: AttributeMethods.attributeMethodSuffix,
  attributeMethodAffix: AttributeMethods.attributeMethodAffix,
  aliasAttribute: AttributeMethods.aliasAttribute,
  eagerlyGenerateAliasAttributeMethods: AttributeMethods.eagerlyGenerateAliasAttributeMethods,
  defineAttributeMethods: AttributeMethods.defineAttributeMethods,
  defineAttributeMethod: AttributeMethods.defineAttributeMethod,
  defineAttributeMethodPattern: AttributeMethods.defineAttributeMethodPattern,
  undefineAttributeMethods: AttributeMethods.undefineAttributeMethods,
  resolveAttributeName: AttributeMethods.resolveAttributeName,
  generatedAttributeMethods: AttributeMethods.generatedAttributeMethods,
  isInstanceMethodAlreadyImplemented: AttributeMethods.isInstanceMethodAlreadyImplemented,
  attributeMethodPatternsCache: AttributeMethods.attributeMethodPatternsCache,
  attributeMethodPatternsMatching: AttributeMethods.attributeMethodPatternsMatching,
});
include(Model, {
  attributeMissing: AttributeMethods.attributeMissing,
  isAttributeMethod: AttributeMethods.isAttributeMethod,
  matchedAttributeMethod: AttributeMethods.matchedAttributeMethod,
  missingAttribute: AttributeMethods.missingAttribute,
  isRespondToWithoutAttributes: AttributeMethods.isRespondToWithoutAttributes,
});

// `include ActiveModel::Attributes` (attributes.rb:29) — its `included` hook
// issues `attribute_method_suffix "=", parameters: "value"` (attributes.rb:35),
// so it has to run after the `attributeMethodPatterns` class attribute exists.
extend(Model, AttributesClassMethods);
include(Model, Attributes);

// Ruby `include ActiveModel::Dirty`'s `included do` block (dirty.rb:241-245).
// The Ruby affixes are snake_case fragments of the generated name, trails' the
// camelCased halves of it, so a `?` disappears into the spelling; a `!` is kept
// and stripped by `AttributeMethodPattern`, which is how the mutator stays a
// zero-arg method rather than an accessor property.
Model.attributeMethodSuffix("PreviouslyChanged", "Changed", { parameters: "**options" });
Model.attributeMethodSuffix("Change", "WillChange!", "Was", { parameters: false });
Model.attributeMethodSuffix("PreviousChange", "PreviouslyWas", { parameters: false });
Model.attributeMethodAffix({ prefix: "restore", suffix: "!", parameters: false });
Model.attributeMethodAffix({ prefix: "clear", suffix: "Change", parameters: false });

// Ruby `include ActiveSupport::Callbacks` (callbacks.rb:733 ClassMethods, :96
// run_callbacks), which every ActiveModel callback module includes.
extend(Model, ASCallbacks.ClassMethods);
include(Model, ASCallbacks.InstanceMethods);

// Ruby `include ActiveModel::Validations::Callbacks`'s ClassMethods half
// (validations/callbacks.rb:32) and its `included do` block (:25-30).
extend(Model, ValidationsCallbacksClassMethods);
// Ruby `include ActiveModel::Validations`' `included do` block
// (validations.rb:48).
defineCallbacks(Model.prototype, "validate", { scope: ["name"] });

defineCallbacks(Model.prototype, "validation", {
  skipAfterCallbacksIfTerminated: true,
  scope: ["kind", "name"],
});

include(Model, ToJsonWithActiveSupportEncoder);

// Ruby `include ActiveModel::Validations` (validations.rb:52) and
// `include ActiveModel::ForbiddenAttributesProtection` (model.rb:12-14).
include(Model, {
  contextForValidation: validationsContextForValidation,
  runValidationsBang: validationsRunValidationsBang,
  raiseValidationError: validationsRaiseValidationError,
  readAttributeForValidation: validationsReadAttributeForValidation,
  sanitizeForbiddenAttributes: forbiddenSanitize,
});

// The `super`-opening halves of the Validations and Dirty modules: each
// defines `init_internals` / `initialize_dup` and opens with `super`
// (validations.rb:467-471 and :310-313, dirty.rb:371-376 and :248-251), so
// the chain IS the include order — with `Attributes#initialize_dup`
// (attributes.rb:111-114) at the bottom, since `include ActiveModel::API`
// (which includes Attributes) precedes both.
// `prepend()` is that chain — the later include wraps the earlier one and
// receives it as `super_`, with a no-op root where Ruby's only definition is
// `ActiveRecord::Core#init_internals` (core.rb:834).
prepend(Model.prototype, {
  initializeDup: attributesInitializeDup,
});
prepend(Model.prototype, {
  initInternals: validationsInitInternals,
  initializeDup: validationsInitializeDup,
});
prepend(Model.prototype, {
  initInternals: dirtyInitInternals,
  initializeDup: dirtyInitializeDup,
});

// model.rb:77 — `ActiveSupport.run_load_hooks(:active_model, Model)`.
runLoadHooks("active_model", Model);
