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
  freeze as validationsFreeze,
} from "./validations.js";
import { HelperMethods } from "./validations/helper-methods.js";
import {
  sanitizeForMassAssignment as attrSanitize,
  sanitizeForbiddenAttributes as forbiddenSanitize,
} from "./forbidden-attributes-protection.js";
import {
  Callbacks as ASCallbacks,
  defineCallbacks,
  runCallbacks,
  extend,
  include,
  prepend,
  runLoadHooks,
  ToJsonWithActiveSupportEncoder,
  type Included,
  type Extended,
  type CodeGenerator,
  Module,
} from "@blazetrails/activesupport";
import { humanAttributeName as translationHumanAttributeName } from "./translation.js";
import { AttributeSet } from "./attribute-set.js";
import { ModelName } from "./naming.js";
import {
  Dirty,
  initInternals as dirtyInitInternals,
  initializeDup as dirtyInitializeDup,
} from "./dirty.js";
import { defineModelCallbacks as defineModelCallbacksImpl } from "./callbacks.js";
import { Serialization } from "./serialization.js";
import { JSON as SerializersJSON } from "./serializers/json.js";
import { EachValidator, Validator as ValidatorBase } from "./validator.js";
import type { ValidatableRecord } from "./validator.js";
import type { ConditionalOptions } from "./validations.js";
import type { AttrNameArg } from "./validations/helper-methods.js";
import * as AttributeMethods from "./attribute-methods.js";
import {
  AttributeMethodPattern,
  type AttributeMethod,
  defineMethodAttribute,
  _resurrectAttributeMethods,
} from "./attribute-methods.js";
import * as AttributeAssignment from "./attribute-assignment.js";
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
import { Conversion, ClassMethods as ConversionClassMethods } from "./conversion.js";
import { Access } from "./access.js";
import { Naming } from "./naming.js";

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
export interface Model extends Dirty, Access, Conversion, Serialization, Naming, SerializersJSON {
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
  attributeMissing(match: AttributeMethod, ...args: unknown[]): unknown;
  isAttributeMethod(attrName: string): boolean;
  matchedAttributeMethod(methodName: string): AttributeMethod | null;
  missingAttribute(attrName: string, stack?: string): never;
  isRespondToWithoutAttributes(method: string): boolean;
  respondTo(method: string, includePrivateMethods?: boolean): boolean;
  /** @internal */
  _readAttribute(attr: string): unknown;

  /**
   * The private instance reader `ActiveModel::Attributes` defines
   * (attributes.rb:161-163), which the generated bare-pattern reader
   * dispatches to (attribute_methods.rb:333-346). Installed by the
   * `include(Model, Attributes)` at the bottom of this file.
   *
   * @internal
   */
  attribute(attrName: string): unknown;

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
  /** @internal */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown>;
  freeze(): this;

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

  /**
   * `class_attribute :include_root_in_json, instance_writer: false,
   * default: false` (json.rb:15), installed by `JSON.[included]`.
   */
  declare static includeRootInJson: boolean | string;
  /**
   * `class_attribute :param_delimiter, instance_reader: false, default: "-"`
   * (conversion.rb:32), installed by `Conversion.[included]`.
   */
  declare static paramDelimiter: string;
  static _attributeDefinitions: Map<string, AttributeDefinition> = new Map();
  declare private static _modelName: ModelName | null;
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

  declare static attribute: Extended<typeof AttributesClassMethods>["attribute"];
  declare static setDefineMethodAttribute: Extended<
    typeof AttributesClassMethods
  >["setDefineMethodAttribute"];
  /** Mirrors: ActiveModel::Conversion::ClassMethods#_to_partial_path (conversion.rb:108-117). */
  declare static _toPartialPath: Extended<typeof ConversionClassMethods>["_toPartialPath"];

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

  /** `extend ActiveModel::Translation` (validations.rb:43) — translation.rb:20-22. */
  declare static i18nScope: string;

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
  declare static attributeMethodPatternsCache: () => Map<string, Array<AttributeMethod>>;
  declare static attributeMethodPatternsMatching: (methodName: string) => Array<AttributeMethod>;

  declare static lookupAncestors: () => Array<{
    new (...args: never[]): unknown;
    modelName: ModelName;
  }>;

  /**
   * Optional `::`-joined Ruby module path for a namespaced model (e.g.
   * `"Admin"` for `Admin::User`, `"MyApplication::Business"`). JS class names
   * carry no module path, so this carrier lets STI/polymorphic `type` values
   * and `modelName` reconstruct the qualified Rails constant name.
   *
   * @noRailsEquivalent PERMANENT — Ruby reads the module path off the constant
   * itself (`module_parents`); a JS class name carries no module path, so a
   * namespaced model declares it. Same carrier as `JSON.moduleName`.
   */
  declare static moduleName?: string;

  /** `extend ActiveModel::Naming` (api.rb:66) — naming.rb:270-277. */
  declare static modelName: ModelName;

  _attributes: AttributeSet = new AttributeSet();
  errors!: Errors<this>;

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
   * Mirrors: ActiveModel::API#initialize (api.rb:82-85) →
   * ActiveModel::Attributes#initialize (attributes.rb:106-109)
   *
   *   Attributes#initialize: @attributes = self.class._default_attributes.deep_dup
   *   API#initialize:        assign_attributes(attributes) if attributes; super()
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

    this._initializingAttributes = true;
    try {
      // AR's override of `_assign_attributes` can owe I/O; Rails' `initialize`
      // does not await it either — the writes drain on save (RFC 0087).
      if (attrs != null) void this.assignAttributes(attrs);
    } finally {
      this._initializingAttributes = false;
    }

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
   * Whether this model instance has been persisted.
   * ActiveModel returns false; ActiveRecord overrides.
   *
   * Mirrors: ActiveModel::API#persisted?
   */
  isPersisted(): boolean {
    return false;
  }

  /**
   * `run_callbacks` (callbacks.rb:96-104), mixed on by the
   * `ActiveModel::Callbacks`' `extended` hook (callbacks.rb:66-70).
   */
  declare runCallbacks: Included<typeof ASCallbacks.InstanceMethods>["runCallbacks"];
}

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
// Its `included do` block (attribute_methods.rb:70-73) rides along, issued from
// the module's own `[included]` hook.
include(Model, AttributeMethods.InstanceMethods);

// `include ActiveModel::Attributes` (attributes.rb:29) — its `included` hook
// issues `attribute_method_suffix "=", parameters: "value"` (attributes.rb:35),
// so it has to run after the `attributeMethodPatterns` class attribute exists.
extend(Model, AttributesClassMethods);
extend(Model, { defineMethodAttribute });
include(Model, Attributes);
// attributes.rb:156-159 — `_write_attribute` and `alias :attribute= :_write_attribute`.
include(Model, { _writeAttribute, "attribute=": _writeAttribute });

// api.rb:65-68 — `included do extend ActiveModel::Naming; extend ActiveModel::Translation end`.
// The Translation half is issued from `Validations.[included]` (validations.rb:43);
// the `Naming.extended` hook (naming.rb:253-256) installs the instance delegate.
extend(Model, Naming);

// Ruby `include ActiveModel::Conversion` (api.rb:16) and its ClassMethods half
// (conversion.rb:105-118); the `included do` block (:28-33) rides along from
// the module's own `[included]` hook.
include(Model, Conversion);
extend(Model, ConversionClassMethods);

// Ruby `include ActiveModel::Serialization` (serialization.rb:127), which
// `ActiveModel::Serializers::JSON` pulls in (json.rb:11); its `included do`
// block (json.rb:12-16) extends Naming and issues the
// `class_attribute :include_root_in_json`.
include(Model, Serialization);
include(Model, SerializersJSON);

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
  freeze: validationsFreeze,
  sanitizeForMassAssignment: attrSanitize,
  sanitizeForbiddenAttributes: forbiddenSanitize,
});

// model.rb:44 — `include ActiveModel::Access`, the one thing `model.rb` does
// beyond `include ActiveModel::API`.
include(Model, Access);

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
// `Dirty#as_json` (dirty.rb:264-268) is deliberately NOT in that chain:
// `ActiveModel::Serializers::JSON#as_json` (json.rb:96-108) is included after
// Dirty and does not call `super`, so Ruby's lookup never reaches the Dirty
// body on a model that serializes through `serializable_hash`. It applies to a
// Dirty-including model whose `as_json` is still `Object`'s — Rails'
// `DirtyTest::DirtyModel` (dirty_test.rb:6-43).

// model.rb:77 — `ActiveSupport.run_load_hooks(:active_model, Model)`.
runLoadHooks("active_model", Model);
