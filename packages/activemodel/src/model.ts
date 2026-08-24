import { Errors } from "./errors.js";
import {
  ValidationContext,
  Validations,
  ClassMethods as ValidationsClassMethods,
  initInternals as validationsInitInternals,
  initializeDup as validationsInitializeDup,
  contextForValidation as validationsContextForValidation,
  runValidationsBang as validationsRunValidationsBang,
  raiseValidationError as validationsRaiseValidationError,
  readAttributeForValidation as validationsReadAttributeForValidation,
} from "./validations.js";
import { HelperMethods } from "./validations/helper-methods.js";
import { sanitizeForbiddenAttributes as forbiddenSanitize } from "./forbidden-attributes-protection.js";
import {
  Callbacks as ASCallbacks,
  defineCallbacks,
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
} from "@blazetrails/activesupport";
import { humanAttributeName as translationHumanAttributeName } from "./translation.js";
import { Type } from "./type/value.js";
import { AttributeSet } from "./attribute-set.js";
import { ModelLike, ModelName } from "./naming.js";
import {
  Dirty,
  DirtyTracker,
  initInternals as dirtyInitInternals,
  initializeDup as dirtyInitializeDup,
} from "./dirty.js";
import { defineModelCallbacks as defineModelCallbacksImpl } from "./callbacks.js";
import {
  serializableHash,
  SerializeOptions,
  asJsonThenable,
  readAttributeForSerialization as serializationReadAttributeForSerialization,
  type SerializationRecord,
} from "./serialization.js";
import { EachValidator, Validator as ValidatorBase } from "./validator.js";
import type { ValidatableRecord } from "./validator.js";
import type { ConditionalOptions } from "./validations.js";
import type { AttrNameArg } from "./validations/helper-methods.js";
import * as AttributeMethods from "./attribute-methods.js";
import {
  AttributeMethodPattern,
  type AttributeMethodMatch,
  defineMethodAttribute,
  _resurrectAttributeMethods,
} from "./attribute-methods.js";
import * as AttributeAssignment from "./attribute-assignment.js";
import { isMassAssignmentEmpty, ArgumentError } from "./attribute-assignment.js";
import { sanitizeForMassAssignment as attrSanitize } from "./forbidden-attributes-protection.js";
import {
  ClassMethods as ValidationsCallbacksClassMethods,
  type ValidationCallbackFilter,
  type ValidationCallbackOptions,
} from "./validations/callbacks.js";
import * as Validates from "./validations/validates.js";
import {
  ClassMethods as WithClassMethods,
  validatesWith as withValidatesWith,
} from "./validations/with.js";
import {
  type AttributeDefinition,
  Attributes,
  attribute,
  attributeNames,
  setDefineMethodAttribute,
  _writeAttribute,
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
} from "./attribute-registration.js";
import { _toPartialPath } from "./conversion.js";

/**
 * Mirrors: ActiveModel::Attributes::ClassMethods (attributes.rb:38-101) — the
 * class half `include ActiveModel::Attributes` contributes, mixed onto `Model`
 * by the `extend()` at the bottom of this file.
 *
 */
const AttributesClassMethods = { attribute, setDefineMethodAttribute, attributeNames };

/**
 * Anything `validates_with` accepts: a full `Validator`/`EachValidator`
 * subclass, or any class that just implements `validate(record)`. Used by
 * `_validators` / `validators()` / `validatorsOn()` so the stored value
 * type matches what we actually accept at registration.
 */
type ValidatorLike = ValidatorBase | EachValidator | { validate(record: ValidatableRecord): void };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export interface Model extends Dirty {
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
  respondTo(method: string, includePrivateMethods?: boolean): boolean;
  /** @internal */
  _readAttribute(name: string, block?: (name: string) => unknown): unknown;

  /**
   * The instance half of Ruby `include ActiveModel::Attributes` (api.rb:15) —
   * `_write_attribute` (attributes.rb:156-158) and the `attribute=` alias it
   * carries (attributes.rb:159), installed by the `include(Model, …)` at the
   * bottom of this file.
   *
   * @internal
   */
  _writeAttribute(name: string, value: unknown): void;
  /** @internal */
  "attribute="(name: string, value: unknown): void;

  /**
   * The instance half of Ruby `include ActiveModel::AttributeAssignment`
   * (api.rb:14), installed by the `include(Model, AttributeAssignment)` at the
   * bottom of this file.
   */
  assignAttributes(newAttributes: unknown): Promise<void> | void;
  setAttributes(newAttributes: unknown): Promise<void> | void;
  attributeWriterMissing(name: string, value: unknown): void;
  /** @internal */
  _assignAttributes(attributes: Record<string, unknown>): Promise<void> | void;
  /** @internal */
  _assignAttribute(k: string, v: unknown): Promise<void> | void;

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
  isValid(context?: string | string[] | ValidationContext | null): Promise<boolean>;
  validate(context?: string | string[] | ValidationContext | null): Promise<boolean>;
  isInvalid(context?: string | string[] | ValidationContext | null): Promise<boolean>;
  validateBang(context?: string | string[] | ValidationContext | null): Promise<true>;
  readonly validationContext: string | string[] | null;
  /** @internal */
  _validationContext: string | string[] | null;
  /** @internal */
  _runValidateCallbacks(): Promise<void>;
  /** @internal */
  sanitizeForbiddenAttributes(attributes: Record<string, unknown>): Record<string, unknown>;

  /**
   * The instance halves of `include HelperMethods` (validations.rb:46) that a
   * `validate do … end` body calls; the instance `validates_with` is async
   * (RFC 0063), so these settle where Ruby's return straight away.
   */
  validatesPresenceOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesAbsenceOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesLengthOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesSizeOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesNumericalityOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesInclusionOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesExclusionOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesFormatOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesAcceptanceOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesConfirmationOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesComparisonOf(...attrNames: AttrNameArg[]): Promise<void>;

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
  // Runtime accessor comes from the `classAttribute()` call at the bottom of
  // this file (validations.rb:50). Keyed by attribute name (or `null` for
  // validators registered without `attributes:`), as Ruby's Hash-of-Arrays is.
  declare static _validators: Map<string | null, Array<ValidatorLike>>;
  declare private static _modelName: ModelName | null;

  declare static attribute: Extended<typeof AttributesClassMethods>["attribute"];
  declare static setDefineMethodAttribute: Extended<
    typeof AttributesClassMethods
  >["setDefineMethodAttribute"];
  static _toPartialPath = _toPartialPath;

  /** @internal Rails-private helper (CLAUDE.md § "Generated attribute readers are properties"). */
  declare static defineMethodAttribute: typeof defineMethodAttribute;

  /** @internal Rails-private helper. */
  declare static _defaultAttributes: typeof _defaultAttributes;

  declare static decorateAttributes: typeof decorateAttributes;
  declare static attributeTypes: typeof attributeTypes;
  declare static typeForAttribute: typeof staticTypeForAttribute;

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
  declare static hookAttributeType: typeof _hookAttributeTypeHelper;

  /** Mirrors: ActiveModel::Attributes::ClassMethods#attribute_names (attributes.rb:74-76). */
  declare static attributeNames: Extended<typeof AttributesClassMethods>["attributeNames"];

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

  /** Mirrors: validations.rb:246-249, mixed on by the `extend()` below. */
  declare static clearValidatorsBang: Extended<
    typeof ValidationsClassMethods
  >["clearValidatorsBang"];

  /**
   * Mirrors: ActiveModel::Validations::ClassMethods#attribute_method?
   * (validations.rb:282-284) — `method_defined?(attribute)`. Ruby's
   * `method_defined?` walks the ancestor chain, which `in` does for a prototype.
   */
  static isAttributeMethod(attribute: string): boolean {
    return attribute in this.prototype;
  }

  /**
   * Adds a validation method or block to the class (validations.rb:160-185),
   * mixed on by the `extend()` below.
   */
  declare static validate: <T extends ValidatableRecord = ValidatableRecord>(
    methodOrFn: string | ((record: T) => unknown),
    options?: ConditionalOptions,
  ) => void;

  /**
   * Validates each of the specified attributes with a block
   * (validations.rb:88-90), mixed on by the `extend()` below.
   */
  declare static validatesEach: <T extends ValidatableRecord = ValidatableRecord>(
    attrNames: Array<string | string[]>,
    block: (record: T, attribute: string, value: unknown) => void,
    options?: ConditionalOptions,
  ) => void;

  /**
   * Validates using a custom validator class instance.
   * The validator must implement validate(record).
   *
   * Mirrors: ActiveModel::Validations::ClassMethods#validates_with
   * (validations/with.rb:88-105), mixed on by the `extend(Model, …)` at the
   * bottom of this file.
   */
  declare static validatesWith: Extended<typeof WithClassMethods>["validatesWith"];

  /** List all validators used to validate the model (validations.rb:204-206). */
  declare static validators: Extended<typeof ValidationsClassMethods>["validators"];

  /** List all validators used to validate one attribute (validations.rb:266-270). */
  declare static validatorsOn: Extended<typeof ValidationsClassMethods>["validatorsOn"];

  // The `validates_*_of` shorthands, mixed on by `Validations.[included]`'s
  // `extend HelperMethods` / `include HelperMethods` (validations.rb:45-46).
  // Declared here only for their types; each body lives in the `.ts` matching
  // the `.rb` that reopens the module.
  declare static validatesPresenceOf: Extended<typeof HelperMethods>["validatesPresenceOf"];
  declare static validatesAbsenceOf: Extended<typeof HelperMethods>["validatesAbsenceOf"];
  declare static validatesLengthOf: Extended<typeof HelperMethods>["validatesLengthOf"];
  declare static validatesSizeOf: Extended<typeof HelperMethods>["validatesSizeOf"];
  declare static validatesNumericalityOf: Extended<typeof HelperMethods>["validatesNumericalityOf"];
  declare static validatesInclusionOf: Extended<typeof HelperMethods>["validatesInclusionOf"];
  declare static validatesExclusionOf: Extended<typeof HelperMethods>["validatesExclusionOf"];
  declare static validatesFormatOf: Extended<typeof HelperMethods>["validatesFormatOf"];
  declare static validatesAcceptanceOf: Extended<typeof HelperMethods>["validatesAcceptanceOf"];
  declare static validatesConfirmationOf: Extended<typeof HelperMethods>["validatesConfirmationOf"];
  declare static validatesComparisonOf: Extended<typeof HelperMethods>["validatesComparisonOf"];

  /** @internal Rails-private helper (helper_methods.rb:7-11). */
  declare static _mergeAttributes: Extended<typeof HelperMethods>["_mergeAttributes"];

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
   * mixed on by `ActiveModel::Callbacks`' `extended` hook (callbacks.rb:66-70),
   * which `Validations.[included]` reaches with `extend(base, Callbacks)`, and typed from that module object rather than restated here.
   */
  declare static setCallback: Extended<typeof ASCallbacks.ClassMethods>["setCallback"];
  declare static skipCallback: Extended<typeof ASCallbacks.ClassMethods>["skipCallback"];
  declare static resetCallbacks: Extended<typeof ASCallbacks.ClassMethods>["resetCallbacks"];

  /**
   * Define custom model callbacks.
   * Creates beforeX(), afterX(), and aroundX() class methods for each event name.
   *
   * Mirrors: ActiveModel::Callbacks.define_model_callbacks
   */
  /**
   * Define custom model callbacks — `extend ActiveModel::Callbacks`
   * (validations.rb:42), issued from `Validations.[included]`.
   */
  declare static defineModelCallbacks: typeof defineModelCallbacksImpl;

  /** `extend ActiveModel::Translation` (validations.rb:43). */
  declare static humanAttributeName: typeof translationHumanAttributeName;

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

  /** @internal Rails-private helper (validations.rb:296-306). */
  declare static predicateForValidationContext: Extended<
    typeof ValidationsClassMethods
  >["predicateForValidationContext"];

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
        // AR's override can owe I/O; Rails' `initialize` does not await it
        // either — the deferred writes drain on save (RFC 0087).
        void this._assignAttributes(this.sanitizeForMassAssignment(attrs));
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

  /**
   * Lazy-initialized `ValidationContext`, which owns the active context. Set on
   * first `contextForValidation()` call and cleared by `initInternals()`.
   *
   * @internal
   */
  _contextForValidation?: ValidationContext;

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
   * Returns the type of the attribute (the Type object).
   *
   * Mirrors: ActiveModel::Attributes#attribute_for_inspect
   */
  typeForAttribute(name: string, block?: () => Type): Type {
    return (this.constructor as typeof Model).typeForAttribute(name, block);
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
   * `ActiveModel::Callbacks`' `extended` hook (callbacks.rb:66-70).
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
// friends (validations.rb:57-307, validations/validates.rb:111-178) onto the
// class; `with.rb:87` reopens the same `ClassMethods`, hence the second extend.
extend(Model, ValidationsClassMethods);
extend(Model, WithClassMethods);
include(Model, { validatesWith: withValidatesWith });

extend(Model, {
  validates: Validates.validates,
  validatesBang: Validates.validatesBang,
  _validatesDefaultKeys: Validates._validatesDefaultKeys,
  _parseValidatesOptions: Validates._parseValidatesOptions,
});

// Ruby `include ActiveModel::AttributeRegistration` (attribute_registration.rb:8).
extend(Model, {
  decorateAttributes,
  attributeTypes,
  typeForAttribute: staticTypeForAttribute,
  _defaultAttributes,
  pendingAttributeModifications: _pendingAttributeModificationsHelper,
  resetDefaultAttributesBang: _resetDefaultAttributesBangHelper,
  resolveTypeName: _resolveTypeNameHelper,
  hookAttributeType: _hookAttributeTypeHelper,
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
  respondTo: AttributeMethods.respondTo,
  _readAttribute: AttributeMethods._readAttribute,
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
extend(Model, { defineMethodAttribute });
include(Model, Attributes);
// attributes.rb:156-159 — `_write_attribute` and `alias :attribute= :_write_attribute`.
include(Model, { _writeAttribute, "attribute=": _writeAttribute });

// Ruby `include ActiveModel::AttributeAssignment` (api.rb:14).
include(Model, {
  assignAttributes: AttributeAssignment.assignAttributes,
  setAttributes: AttributeAssignment.setAttributes,
  attributeWriterMissing: AttributeAssignment.attributeWriterMissing,
  _assignAttributes: AttributeAssignment._assignAttributes,
  _assignAttribute: AttributeAssignment._assignAttribute,
});

// Ruby `include ActiveModel::Dirty` (model.rb:12-14) — a class module, since
// only `include()`'s class branch carries the accessor descriptors the module's
// zero-arg readers port to.
include(Model, Dirty);

// Its `included do` block (dirty.rb:241-245).
// The Ruby affixes are snake_case fragments of the generated name, trails' the
// camelCased halves of it, so a `?` disappears into the spelling; a `!` is kept
// and stripped by `AttributeMethodPattern`, which is how the mutator stays a
// zero-arg method rather than an accessor property.
Model.attributeMethodSuffix("PreviouslyChanged", "Changed", { parameters: "**options" });
Model.attributeMethodSuffix("Change", "WillChange!", "Was", { parameters: false });
Model.attributeMethodSuffix("PreviousChange", "PreviouslyWas", { parameters: false });
Model.attributeMethodAffix({ prefix: "restore", suffix: "!", parameters: false });
Model.attributeMethodAffix({ prefix: "clear", suffix: "Change", parameters: false });

// Ruby `include ActiveModel::Validations::Callbacks`'s ClassMethods half
// (validations/callbacks.rb:32) and its `included do` block (:25-30).
extend(Model, ValidationsCallbacksClassMethods);
// Ruby `include ActiveModel::Validations` (validations.rb:52); its `included do`
// block (:40-50) runs from the module's own `[included]` hook.
include(Model, Validations);

defineCallbacks(Model.prototype, "validation", {
  skipAfterCallbacksIfTerminated: true,
  scope: ["kind", "name"],
});

include(Model, ToJsonWithActiveSupportEncoder);

// The remaining `include ActiveModel::Validations` members (validations.rb:52)
// and `include ActiveModel::ForbiddenAttributesProtection` (model.rb:12-14).
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
