/**
 * AttributeMethods — methods for working with model attributes.
 *
 * Mirrors: ActiveRecord::AttributeMethods
 */
import { CodeGenerator, include, Module } from "@blazetrails/activesupport";
import { isEmpty } from "@blazetrails/activesupport/ruby-empty";
import {
  aliasesByAttributeName,
  missingAttribute,
  type AttributeMethodPattern,
  isInstanceMethodAlreadyImplemented as _amInstanceMethodAlreadyImplemented,
  aliasAttribute as amAliasAttribute,
  defineAttributeMethods as amDefineAttributeMethods,
  undefineAttributeMethods as amUndefineAttributeMethods,
  type InstanceHost as AttributeMethodsInstanceHost,
  type DirtyOptions,
} from "@blazetrails/activemodel";
import { DangerousAttributeError } from "./errors.js";
import { formatForInspect as _formatForInspect } from "./attribute-inspection.js";
import {
  attributeForInspect as _attrForInspect,
  initializeGeneratedModules as _coreInitializeGeneratedModules,
} from "./core.js";
import { queryAttribute as _queryAttribute } from "./attribute-methods/query.js";
import { reload as _reload } from "./persistence.js";
import { cachedTableExists, loadSchema } from "./model-schema.js";
import {
  serializableHash as _serializableHash,
  attributeNamesForSerialization as _attrNamesForSerialization,
} from "./serialization.js";

/**
 * The AttributeMethods module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods
 */
export interface AttributeMethods {
  hasAttribute(name: string): boolean;
  attributePresent(name: string): boolean;
  attributeNames(): string[];
}

interface AttributeRecord {
  _attributes: {
    isKey(name: string): boolean;
    keys(): Iterable<string>;
    fetchValue(name: string): unknown;
    accessed(): string[];
  };
  readAttribute(name: string): unknown;
  /** @internal */
  _readAttribute(name: string): unknown;
}

/**
 * Minimal shape required by instance methods that delegate to sub-modules or
 * access primary-key / attribute internals on `this`.
 *
 * Note: `constructor` is intentionally absent. Typing it conflicts with
 * TypeScript's built-in `constructor: Function` on class instances, causing
 * assignment errors at call sites (e.g. `Base`). Methods that need
 * `this.constructor.primaryKey` etc. use `(this.constructor as any)` instead.
 *
 * @internal
 */
interface InstanceMethodHost {
  _attributes?: {
    isKey(name: string): boolean;
    keys(): Iterable<string>;
    getAttribute?(name: string): { valueForDatabase?: unknown } | null;
    fetchValue?(name: string): unknown;
  };
  _primaryKey?: string | string[];
  id?: unknown;
  readAttribute(name: string, block?: (name: string) => unknown): unknown;
  writeAttribute(name: string, value: unknown): void;
  /** @internal */
  _readAttribute(name: string, block?: (name: string) => unknown): unknown;
  _writeAttribute(name: string, value: unknown): void;
}

/**
 * Check whether an attribute exists on a record.
 *
 * Mirrors: ActiveRecord::AttributeMethods#has_attribute?
 */
export function hasAttribute(this: AttributeRecord, name: string): boolean {
  let attrName = String(name);
  attrName =
    (this.constructor as unknown as { attributeAliases: Record<string, string> }).attributeAliases[
      attrName
    ] ?? attrName;
  return this._attributes.isKey(attrName);
}

/**
 * Check whether an attribute is present.
 *
 * Mirrors: ActiveRecord::AttributeMethods#attribute_present?
 * (attribute_methods.rb:387-392)
 */
export function attributePresent(this: AttributeRecord, name: string): boolean {
  let attrName = String(name);
  attrName =
    (this.constructor as unknown as { attributeAliases: Record<string, string> }).attributeAliases[
      attrName
    ] ?? attrName;
  const value = this._readAttribute(attrName);
  return value != null && !(respondsToEmpty(value) && isEmpty(value));
}

/**
 * Ruby's `value.respond_to?(:empty?)` (attribute_methods.rb:391): true for the
 * receivers whose `empty?` {@link isEmpty} answers on — a String, an Array, and
 * the Hash-like Set/Map/plain object — and false for everything else, so a
 * `Temporal` timestamp is present rather than an object with no own keys.
 * TypeScript has no `respond_to?`, so the receiver test is written out.
 */
function respondsToEmpty(value: unknown): value is readonly unknown[] | string | object {
  if (typeof value === "string" || Array.isArray(value)) return true;
  if (value instanceof Set || value instanceof Map) return true;
  return (
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Return all attribute names for a record.
 *
 * Mirrors: ActiveRecord::AttributeMethods#attribute_names
 */
export function attributeNames(this: AttributeRecord): string[] {
  return [...this._attributes.keys()];
}

/**
 * Return all attributes as a plain object.
 *
 * Mirrors: ActiveRecord::AttributeMethods#attributes
 */
export function attributes(this: AttributeRecord): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of this._attributes.keys()) {
    result[key] = this.readAttribute(key);
  }
  return result;
}

/**
 * Return the list of attribute names that have been read on this record.
 * Useful for identifying unused columns to optimize SELECT queries.
 *
 * Mirrors: ActiveRecord::AttributeMethods#accessed_fields
 */
export function accessedFields(this: AttributeRecord): string[] {
  return this._attributes.accessed();
}

/**
 * The module generated attribute methods are defined into and which each
 * model class includes.
 *
 * Mirrors: ActiveRecord::AttributeMethods::GeneratedAttributeMethods
 * (attribute_methods.rb:14, `class GeneratedAttributeMethods < Module`).
 */
export class GeneratedAttributeMethods extends Module {
  /**
   * The owning model's name. Ruby gets it from
   * `const_set(:GeneratedAttributeMethods, GeneratedAttributeMethods.new)`
   * (attribute_methods.rb:43), which names the module after the class it is
   * set on; JS modules carry no such binding, so the owner stamps it at the
   * same point in `initialize_generated_modules`.
   * @internal
   */
  ownerName?: string;

  inspect(): string {
    return `${this.ownerName}::GeneratedAttributeMethods`;
  }
}

// ---------------------------------------------------------------------------
// Class methods — mirrors ActiveRecord::AttributeMethods::ClassMethods
// ---------------------------------------------------------------------------

interface AttributeMethodsHost {
  name: string;
  _attributeMethodsGenerated?: boolean;
  _aliasAttributesMassGenerated?: boolean;
  _generatedAttributeMethods?: GeneratedAttributeMethods;
  attributeAliases?: Record<string, string>;
  _dangerousAttributeMethods?: Set<string>;
  _ignoredColumns?: string[];
  prototype: any;
  isBaseClass?(): boolean;
  attributeNames(): string[];
  abstractClass?: boolean;
  aliasAttribute(newName: string, oldName: string): void;
  _hasAttribute(attrName: string): boolean;
  attributeMethodPatterns: AttributeMethodPattern[];
  /** @internal */
  attributeMethodPatternsCache(): Map<string, unknown>;
  /** @internal */
  generatedAttributeMethods(): Module;
  defineAttributeMethodPattern(
    pattern: AttributeMethodPattern,
    attrName: string,
    options: { owner: CodeGenerator; as: string; override?: boolean },
  ): void;
  defineAttributeMethods?(): boolean;
  generateAliasAttributeMethods?(
    codeGenerator: CodeGenerator,
    newName: string,
    oldName: string,
  ): void;
  generateAliasAttributes?(): void;
}

// Rails threads `__FILE__, __LINE__` into every `CodeGenerator.batch`; the pair
// is inert here for the reason activemodel/attribute-methods.ts:30-38 gives.
const __FILE__ = import.meta.url;
const __LINE__ = 0;

const RESTRICTED_CLASS_METHODS = new Set(["allocate", "new", "name", "parent", "superclass"]);

let _dangerousMethodsCache: Set<string> | null = null;

/**
 * Rails: collects Base.instance_methods + private_instance_methods
 * minus superclass methods. These are method names that would conflict
 * with attribute accessors if a column had the same name.
 *
 * @missingRailsCall map — PERMANENT: Deviation (RFC 0106): Rails builds the set
 *   by reflecting over `Base.instance_methods -
 *   Base.superclass.instance_methods` and `map`ping each Symbol to a frozen
 *   String. JS has no equivalent of Ruby's owner-scoped `instance_methods`, so
 *   trails enumerates the same names as a literal list; the `map` has nothing to
 *   map over.
 */
export function dangerousAttributeMethods(): Set<string> {
  if (_dangerousMethodsCache) return _dangerousMethodsCache;
  _dangerousMethodsCache = new Set([
    "save",
    "saveBang",
    "destroy",
    "delete",
    "reload",
    "update",
    "increment",
    "decrement",
    "toggle",
    "touch",
    "lock",
    "freeze",
    "dup",
    "clone",
    "becomes",
    "createOrUpdate",
    "isFrozen",
    "inspect",
    "toJSON",
    "isNewRecord",
    "isPersisted",
    "isDestroyed",
    "isReadonly",
    "isChanged",
    "isValid",
    "errors",
    "validate",
    "readAttribute",
    "writeAttribute",
    "assignAttributes",
    "encrypt",
    "decrypt",
    "encryptedAttribute",
    "ciphertextFor",
    // Framework readers hosted off the curated list above but still part of
    // Rails' `Base.instance_methods` — an attribute (or enum) named after one of
    // these must be treated as dangerous, mirroring `dangerous_attribute_method?`.
    "attributes",
    "logger",
  ]);
  return _dangerousMethodsCache;
}

/**
 * Rails (attribute_methods.rb ClassMethods#initialize_generated_modules):
 *
 *   @generated_attribute_methods = const_set(:GeneratedAttributeMethods, GeneratedAttributeMethods.new)
 *   private_constant :GeneratedAttributeMethods
 *   @attribute_methods_generated = false
 *   @alias_attributes_mass_generated = false
 *   include @generated_attribute_methods
 *   super
 *
 * trails has no `const_set`, so the module is held on the class under the
 * Rails ivar name rather than as a namespaced constant; it is included the
 * same way, which splices it below the class prototype so the class body still
 * outranks a generated accessor. Resetting both flags to `false` re-arms the
 * lazy generation paths so the next accessor read regenerates against this
 * class's schema.
 *
 * Rails chains this to `Core`'s `initialize_generated_modules` via `super`;
 * this port mirrors that by delegating to the core version at the end. `Base`
 * wires this attribute-methods entry point as the single static (see base.ts),
 * so the super call reaches `generatedAssociationMethods` just as Rails' method
 * ancestry does.
 *
 * Rails runs this from `inherited`, so the ivar is always empty and the
 * `include` is the class's only generated-methods entry. trails has no
 * `inherited` hook, so the seeding is driven from the AR-owned entry points a
 * class body has to pass through to generate anything — `Base.attribute`
 * (base.ts) and `aliasAttribute` below — which get there before ActiveModel's
 * lazy `generated_attribute_methods` (attribute_methods.rb:400-402) can seat a
 * bare `Module`. So this never replaces an already-included module.
 */
export function initializeGeneratedModules(this: AttributeMethodsHost): void {
  this._generatedAttributeMethods = new GeneratedAttributeMethods();
  this._generatedAttributeMethods.ownerName = this.name;
  this._attributeMethodsGenerated = false;
  this._aliasAttributesMassGenerated = false;
  include(this as unknown as new (...args: unknown[]) => unknown, this._generatedAttributeMethods);
  _coreInitializeGeneratedModules.call(
    this as unknown as ThisParameterType<typeof _coreInitializeGeneratedModules>,
  );
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#alias_attribute
 * (attribute_methods.rb:66-74). `super` is ActiveModel's
 * (activemodel/attribute_methods.rb:203-209), called directly rather than
 * through the prototype chain: for a subclass that chain reaches `Base`, whose
 * static IS this function.
 *
 * The `@alias_attributes_mass_generated` arm re-generates an alias declared
 * AFTER the class's mass generation already ran. The ivar is per-class, so only
 * an *own* truthy flag counts as generated (an inherited `true` belongs to the
 * parent).
 *
 * Seeds the generated-methods module first, standing in for the `inherited`
 * hook Rails seeds it from (attribute_methods.rb:265-272), so ActiveModel's
 * lazy `generated_attribute_methods` (:400-402) never seats a bare `Module`
 * here.
 */
export function aliasAttribute(this: AttributeMethodsHost, newName: string, oldName: string): void {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    initializeGeneratedModules.call(this);
  }
  amAliasAttribute.call(this as never, newName, oldName);

  if (
    Object.prototype.hasOwnProperty.call(this, "_aliasAttributesMassGenerated") &&
    this._aliasAttributesMassGenerated
  ) {
    CodeGenerator.batch(this.generatedAttributeMethods(), __FILE__, __LINE__, (codeGenerator) => {
      generateAliasAttributeMethods.call(this, codeGenerator, newName, oldName);
    });
  }
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#eagerly_generate_alias_attribute_methods
 * (attribute_methods.rb:76-78) — deliberately empty. "alias attributes in
 * Active Record are lazily generated", by `generate_alias_attributes` off
 * `define_attribute_methods`. This overrides ActiveModel's eager version
 * (activemodel/attribute_methods.rb:211-215), so it is assigned onto `Base`
 * for `alias_attribute` to reach this arm instead of that one.
 */
export function eagerlyGenerateAliasAttributeMethods(
  this: AttributeMethodsHost,
  _newName: string,
  _oldName: string,
): void {}

/**
 * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#generate_alias_attribute_methods
 * (attribute_methods.rb:80-85) — one alias definition per attribute-method
 * pattern, then the pattern cache is cleared so the alias' names resolve.
 */
export function generateAliasAttributeMethods(
  this: AttributeMethodsHost,
  codeGenerator: CodeGenerator,
  newName: string,
  oldName: string,
): void {
  for (const pattern of this.attributeMethodPatterns) {
    aliasAttributeMethodDefinition.call(this, codeGenerator, pattern, newName, oldName);
  }
  this.attributeMethodPatternsCache().clear();
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#alias_attribute_method_definition
 * (attribute_methods.rb:87-96) — the alias is generated by the same pattern
 * path as a regular attribute method, under the alias' name, with the override
 * arm on.
 *
 * Rails' `!abstract_class? && !has_attribute?(old_name)` ArgumentError
 * (:90-92) is NOT ported, and cannot be: it is guarded by WHEN Rails
 * generates. Ruby defers generation to the first call via `method_missing`, so
 * a model that is only introspected never reaches this method — which is why
 * `attributes_test.rb:54` can `alias_attribute :overloaded_float, :x` against
 * a column `overloaded_types` does not have (schema.rb:1408-1415), call only
 * `type_for_attribute`, and pass. A JS property has to exist before it is
 * read, so trails generates at the end of every schema load
 * (`defineAttributeMethodsAfterLoad`, model-schema.ts:1159, itself tagged
 * `@noRailsEquivalent` against CLAUDE.md's "Generated attribute readers are
 * properties"). `type_for_attribute` loads the schema, so trails DOES reach
 * this method there, and the guard would raise on a Rails test Rails passes.
 * The generation point is language-forced; the guard is downstream of it.
 *
 * @missingRailsCall has_attribute? — PERMANENT: Language shortcoming (RFC 0106):
 *   Rails' `!abstract_class? && !has_attribute?(old_name)` ArgumentError
 *   (attribute_methods.rb:90-92) is guarded by WHEN Rails generates. Ruby defers
 *   generation to the first call via `method_missing`, so a model that is only
 *   introspected never reaches `alias_attribute_method_definition` — which is
 *   why `attributes_test.rb:54` aliases `:overloaded_float, :x` against a column
 *   `overloaded_types` does not have (schema.rb:1408-1415), calls only
 *   `type_for_attribute`, and passes. A JS property must exist before it is
 *   read, so trails generates at the end of every schema load
 *   (`defineAttributeMethodsAfterLoad`, model-schema.ts:1159), a generation point
 *   CLAUDE.md ratifies repo-wide under "Generated attribute readers are
 *   properties";
 *   `type_for_attribute` loads the schema, so trails reaches this method there
 *   and the guard would raise on a Rails test Rails passes. Verified by porting
 *   it: it reds `attributes_test.rb:54` and the ignored-columns case in
 *   base.trails.test.ts. Documented at the call site.
 */
export function aliasAttributeMethodDefinition(
  this: AttributeMethodsHost,
  codeGenerator: CodeGenerator,
  pattern: AttributeMethodPattern,
  newName: string,
  oldName: string,
): void {
  oldName = String(oldName);

  this.defineAttributeMethodPattern(pattern, oldName, {
    owner: codeGenerator,
    as: newName,
    override: true,
  });
}

export function isAttributeMethodsGenerated(this: AttributeMethodsHost): boolean {
  return this._attributeMethodsGenerated ?? false;
}

export function defineAttributeMethods(this: AttributeMethodsHost): boolean {
  // Rails runs `initialize_generated_modules` once per class from the
  // `inherited` hook (attribute_methods.rb:265-272), seeding
  // `@generated_attribute_methods` and the two generation flags before any
  // accessor is defined. JS has no `inherited` hook, so — mirroring how
  // `cachedFindByStatement` lazily calls `initializeFindByCache` — we run it
  // here the first time a class generates its methods, gated on an *own*
  // `_generatedAttributeMethods` so each subclass initializes exactly once.
  // Rails runs it from `included do` (attribute_methods.rb:10-11), before any
  // class body can reach `generated_attribute_methods`; the AR-owned entry
  // points a class body passes through (`Base.attribute`, `aliasAttribute`) do
  // the same here, so by this point the module is usually already seated.
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    initializeGeneratedModules.call(this);
  }
  // Rails' @attribute_methods_generated is a per-class ivar (nil for every
  // class regardless of superclass). JS properties are inheritable, so only an
  // *own* truthy flag counts as already-generated — an inherited `true` from a
  // parent class must not short-circuit a subclass's own generation.
  if (
    Object.prototype.hasOwnProperty.call(this, "_attributeMethodsGenerated") &&
    this._attributeMethodsGenerated
  ) {
    return false;
  }
  // Rails: `superclass.define_attribute_methods unless base_class?` — a parent's
  // methods must exist before the subclass generates its own. The own-flag check
  // above keeps the cascade idempotent (each class generates once).
  if (typeof this.isBaseClass === "function" && !this.isBaseClass()) {
    const superclass = Object.getPrototypeOf(this) as AttributeMethodsHost | null;
    if (superclass && typeof superclass.defineAttributeMethods === "function") {
      superclass.defineAttributeMethods();
    }
  }
  // Rails gates the schema-load + accessor-generation body behind
  // `unless abstract_class?` (attribute_methods.rb:113): an abstract class has
  // no table, so it generates no per-attribute accessors and no id_value alias —
  // only the superclass cascade (above) and generateAliasAttributes (below) run.
  if (this.abstractClass !== true) {
    loadSchema.call(this as never);
    // Rails re-checks `@attribute_methods_generated` after the step that can
    // yield to another generator — the mutex it takes at attribute_methods.rb:108-110.
    // trails' yielding step is `load_schema` itself: a cold load ends in the
    // post-load generation trigger (model-schema.ts), which runs this whole
    // body first, so the same re-check is what keeps generation single. The
    // methods still came from this call, so it answers `true` below as the
    // first generating pass does (attribute_methods.rb:104-125) — only a call
    // that found them already generated returns false, and that arm is the
    // flag check above `load_schema`.
    const generatedByNestedLoad =
      Object.prototype.hasOwnProperty.call(this, "_attributeMethodsGenerated") &&
      this._attributeMethodsGenerated;
    if (!generatedByNestedLoad) {
      amDefineAttributeMethods.call(this as never, ...this.attributeNames());
      if (this._hasAttribute("id")) this.aliasAttribute("id_value", "id");
    }
  }
  generateAliasAttributes.call(this);
  this._attributeMethodsGenerated = true;
  return true;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#generate_alias_attributes
 * (attribute_methods.rb:76-84).
 *
 * Seeds the module for the same reason {@link aliasAttribute} does: Rails'
 * superclass already holds the one its `inherited` hook seeded, and a parent
 * reached through the recursion below may never have declared an attribute of
 * its own.
 */
export function generateAliasAttributes(this: AttributeMethodsHost): void {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    initializeGeneratedModules.call(this);
  }
  // Rails: `superclass.generate_alias_attributes unless superclass == Base`.
  const superclass = Object.getPrototypeOf(this) as AttributeMethodsHost | null;
  if (
    superclass &&
    !Object.prototype.hasOwnProperty.call(superclass, "_isActiveRecordBase") &&
    typeof superclass.generateAliasAttributes === "function"
  ) {
    superclass.generateAliasAttributes();
  }
  // Rails guards on the per-class @alias_attributes_mass_generated ivar; JS
  // properties inherit, so only an *own* truthy flag counts as done.
  if (
    Object.prototype.hasOwnProperty.call(this, "_aliasAttributesMassGenerated") &&
    this._aliasAttributesMassGenerated
  ) {
    return;
  }
  CodeGenerator.batch(this.generatedAttributeMethods(), __FILE__, __LINE__, (codeGenerator) => {
    for (const [oldName, newNames] of aliasesByAttributeName(this as never)) {
      for (const newName of newNames) {
        generateAliasAttributeMethods.call(this, codeGenerator, newName, oldName);
      }
    }
  });
  this._aliasAttributesMassGenerated = true;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#undefine_attribute_methods
 * (attribute_methods.rb:143-149). `GeneratedAttributeMethods::LOCK.synchronize`
 * has no seat — JS is single-threaded — but the `super if
 * @attribute_methods_generated` guard does: without generated methods there is
 * nothing to undefine, and ActiveModel's `super` would otherwise clear a
 * module this class never generated into. Both ivars are per-class, so only an
 * *own* truthy flag counts as generated (an inherited `true` belongs to the
 * parent).
 */
export function undefineAttributeMethods(this: AttributeMethodsHost): void {
  if (
    Object.prototype.hasOwnProperty.call(this, "_attributeMethodsGenerated") &&
    this._attributeMethodsGenerated
  ) {
    amUndefineAttributeMethods.call(this as never);
  }
  this._attributeMethodsGenerated = false;
  this._aliasAttributesMassGenerated = false;
}

/**
 * Ruby's `superclass.instance_method(name).owner.is_a?(GeneratedAttributeMethods)`
 * (attribute_methods.rb:176). JS has no `UnboundMethod#owner`, so we walk the
 * ancestry the way method lookup does — `include()` splices a module's carrier
 * into the prototype chain directly below the including class's prototype, so
 * per ancestor the class body outranks its generated module — and report which
 * kind of link defines the name first: `is_a?(GeneratedAttributeMethods)` reads
 * as "the owner IS the `_generatedAttributeMethods` field", since ActiveModel's
 * lazy `generated_attribute_methods` seats a plain `Module` there where
 * ActiveRecord seats the subclass — the field, not the constructor, is the
 * discriminator.
 */
function isOwnedByGeneratedAttributeMethods(klass: any, name: string): boolean {
  return instanceMethodOwner(klass, name) instanceof Module;
}

/**
 * Ruby's `klass.instance_method(name).owner` — the ancestor that defines
 * `name`, or `undefined` when none does. A class prototype outranks the class's
 * own generated-attribute-methods module, matching how `include()` splices a
 * module's carrier directly below the including class's prototype.
 */
function instanceMethodOwner(klass: any, name: string): unknown {
  for (let c = klass; typeof c === "function"; c = Object.getPrototypeOf(c)) {
    if (c.prototype && Object.prototype.hasOwnProperty.call(c.prototype, name)) return c.prototype;
    const mod = Object.prototype.hasOwnProperty.call(c, "_generatedAttributeMethods")
      ? c._generatedAttributeMethods
      : undefined;
    if (mod instanceof Module && mod.isMethodDefined(name)) return mod;
  }
  return undefined;
}

/**
 * Mirrors: ClassMethods#instance_method_already_implemented?
 * (attribute_methods.rb:165-179) — the dangerous-method raise comes first, so
 * `alias_attribute :save, :name` raises rather than generating an accessor
 * over Active Record's own method.
 *
 * `Base` is found by the `_isActiveRecordBase` own-property sentinel rather
 * than imported, which would close a module-init cycle.
 *
 * Seeds the generated-methods module for the same reason {@link aliasAttribute}
 * does, and closes the last hole in that seeding: both arms below reach
 * ActiveModel's lazy `generated_attribute_methods`
 * (activemodel/attribute_methods.rb:400-402), which would seat a bare `Module`
 * for a class that declares nothing of its own — an empty
 * `class Leaf extends Middle {}`. Rails cannot get there: its `inherited` hook
 * (attribute_methods.rb:265-272) has already seated a `GeneratedAttributeMethods`
 * for every class from the moment it exists.
 */
export function isInstanceMethodAlreadyImplemented(
  this: AttributeMethodsHost,
  methodName: string,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    initializeGeneratedModules.call(this);
  }
  if (isDangerousAttributeMethod.call(this, methodName)) {
    throw new DangerousAttributeError(
      `${methodName} is defined by Active Record. Check to make sure that you don't have an attribute or method with the same name.`,
    );
  }

  const superclass = Object.getPrototypeOf(this);
  if (Object.prototype.hasOwnProperty.call(superclass ?? {}, "_isActiveRecordBase")) {
    return _amInstanceMethodAlreadyImplemented.call(this as any, methodName);
  } else {
    const base = frameworkBase(this);
    const defined =
      base != null &&
      isMethodDefinedWithin.call(this, methodName, superclass, base) &&
      !isOwnedByGeneratedAttributeMethods(superclass, methodName);
    return defined || _amInstanceMethodAlreadyImplemented.call(this as any, methodName);
  }
}

/**
 * Find the framework `Base` class in `klass`'s prototype chain without
 * importing the `Base` value (which would close a module-init cycle). `Base` is
 * the single class that *owns* the `_isActiveRecordBase` sentinel.
 */
function frameworkBase(klass: unknown): any {
  let c: unknown = klass;
  while (typeof c === "function" && c !== Function.prototype) {
    if (Object.prototype.hasOwnProperty.call(c, "_isActiveRecordBase")) return c;
    c = Object.getPrototypeOf(c);
  }
  return null;
}

export function isDangerousAttributeMethod(this: AttributeMethodsHost, name: string): boolean {
  return dangerousAttributeMethods().has(name);
}

/**
 * Mirrors: ClassMethods#method_defined_within?
 * (attribute_methods.rb:187-198). Ruby's `method_defined?` /
 * `private_method_defined?` pair is one `name in klass.prototype` here — JS has
 * no private-method reflection over the prototype chain, so the `in` test
 * already covers both Ruby visibilities.
 */
export function isMethodDefinedWithin(
  this: AttributeMethodsHost,
  name: string,
  klass: any,
  superklass: any = Object.getPrototypeOf(klass),
): boolean {
  if (name in klass.prototype) {
    if (superklass?.prototype != null && name in superklass.prototype) {
      return instanceMethodOwner(klass, name) !== instanceMethodOwner(superklass, name);
    } else {
      return true;
    }
  } else {
    return false;
  }
}

export function isDangerousClassMethod(this: AttributeMethodsHost, methodName: string): boolean {
  if (RESTRICTED_CLASS_METHODS.has(methodName)) return true;
  return typeof (this as any)[methodName] === "function";
}

/**
 * Mirrors: ActiveRecord::AttributeMethods#attribute_method?
 * (attribute_methods.rb:499-501) — `@attributes&.key?(attr_name)`. The private
 * *instance* predicate, which is what `matched_attribute_method` filters with;
 * the ClassMethods predicate of the same name (attribute_methods.rb:224) reads
 * the class's attribute definitions instead.
 */
export function isAttributeMethod(
  this: { _attributes?: { isKey(name: string): boolean } },
  attrName: string,
): boolean {
  return this._attributes?.isKey(attrName) ?? false;
}

/**
 * Mirrors ActiveRecord::AttributeMethods#_has_attribute? (instance method):
 * a bare `@attributes.key?(attr_name)` with no alias resolution. Wired onto
 * the prototype as an instance method, so `this` is a record and reads its
 * attribute set — not the class's `attribute_types`, which the ClassMethods
 * predicate of the same name reads.
 *
 * @internal
 */
export function _hasAttribute(this: InstanceMethodHost, attrName: string): boolean {
  return this._attributes?.isKey(attrName) ?? false;
}

// ---------------------------------------------------------------------------
// Private instance helpers — mirrors ActiveRecord::AttributeMethods private block
// ---------------------------------------------------------------------------

function attributeMethod(this: InstanceMethodHost, attrName: string): boolean {
  return this._attributes != null && (this._attributes.isKey(attrName) ?? false);
}

/** @internal */
export function attributesWithValues(
  this: InstanceMethodHost,
  attributeNames: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const attributes = this._attributes;
  if (attributes == null) return result;
  for (const name of attributeNames) {
    // Rails' `attribute_names.index_with { |name| @attributes[name] }` — the
    // map carries the `ActiveModel::Attribute` objects themselves, not their
    // values, so `_insert_record`/`_update_record` hand Arel a typed bind whose
    // `value_for_database` the adapter's `type_casted_binds` reads. The `isKey`
    // guard keeps a name with no attribute out of the write entirely rather
    // than writing the uninitialized default's NULL.
    if (attributes.isKey(name)) result[name] = attributes.getAttribute?.(name);
  }
  return result;
}

/** @internal */
export function attributesForUpdate(this: InstanceMethodHost, attributeNames: string[]): string[] {
  const mc = this.constructor as any;
  const colNames = new Set<string>(mc.columnNames?.() ?? []);
  return attributeNames.filter((name) => {
    if (!colNames.has(name)) return false;
    if (mc.readonlyAttributeQ?.(name)) return false;
    if (mc.isCounterCacheColumn?.(name)) return false;
    // Rails: column_for_attribute(name).virtual?
    const col = mc.columnForAttribute?.(name);
    if (col?.virtual || col?.isVirtual?.()) return false;
    return true;
  });
}

/** @internal */
export function attributesForCreate(this: InstanceMethodHost, attributeNames: string[]): string[] {
  const mc = this.constructor as any;
  const colNames = new Set<string>(mc.columnNames?.() ?? []);

  // Rails Persistence#attributes_for_create: & column_names, drop the nil pk,
  // drop virtual columns (persistence.rb / attribute_methods.rb:519-524). The
  // partial-inserts selection (attribute_names_for_partial_inserts) and the
  // Locking::Optimistic locking-column union happen UPSTREAM in the create
  // path (persistence.ts._createRecord), mirroring the Rails super chain
  // Dirty#_create_record → Locking::Optimistic#_create_record → Persistence —
  // so this function stays the generic, locking-agnostic filter Rails ships.
  return attributeNames.filter((name) => {
    if (!colNames.has(name)) return false;
    // Rails: pk_attribute?(name) && id.nil?
    if (pkAttribute.call(this, name) && this.id == null) return false;
    // Rails: column_for_attribute(name).virtual?
    const col = mc.columnForAttribute?.(name);
    if (col?.virtual || col?.isVirtual?.()) return false;
    return true;
  });
}

/** @internal */
export function formatForInspect(this: InstanceMethodHost, attr: string, value: unknown): string {
  return _formatForInspect.call(this as any, attr, value);
}

/** @internal */
export function pkAttribute(this: InstanceMethodHost, name: string): boolean {
  const pk = (this.constructor as any)?.primaryKey ?? this._primaryKey;
  return name === pk;
}

interface AttributeNamesHost {
  attributeTypes(): Record<string, unknown>;
  abstractClass?: boolean;
  _attributeNamesMemo?: { names: readonly string[] };
}

/**
 * Returns an array of column names as strings if it's not an abstract class and
 * table exists. Otherwise it returns an empty array.
 *
 * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#attribute_names
 * (attribute_methods.rb:236-242).
 */
function classAttributeNames(this: AttributeNamesHost): string[] {
  // Rails' `@attribute_names ||= ...freeze` memo, own-property per class (a
  // subclass never reads its parent's memo — Rails nils `@attribute_names` in
  // `inherited`). The reset paths that clear `_columns`/`_columnsHash`
  // (resetColumnInformation, applyColumnsHash) drop it through
  // `clearAttributeNamesMemo`, which recurses into descendants exactly as
  // `reload_schema_from_cache` does (model_schema.rb:553-568).
  const memo = Object.prototype.hasOwnProperty.call(this, "_attributeNamesMemo")
    ? this._attributeNamesMemo
    : undefined;
  if (memo) return memo.names as string[];
  // Rails attribute_methods.rb:236-241: `if !abstract_class? && table_exists?`.
  // trails' tableExists is async, so the table_exists? half runs off the schema
  // cache's already-resolved answer — `false` only after a dataSourceExists
  // miss; a cold/unknown table (`undefined`) falls through. Accepted inherent
  // deviation from Rails' sync-DB-hit `[]`: a sync API cannot make the DB hit,
  // and failing closed would break every adapter-less attribute-only model.
  // The async pipeline (loadSchemaFromAdapter → dataSourceExists) seeds the
  // negative entry, closing the guard once `loadSchema()` has been awaited —
  // which is why the fail-open answer must never be memoized: that resolution
  // happens without any invalidation to drop the memo.
  const exists = cachedTableExists.call(this as never);
  if (this.abstractClass || exists === false) {
    const frozen = Object.freeze([] as string[]);
    this._attributeNamesMemo = { names: frozen };
    return frozen as string[];
  }
  const names = Object.keys(this.attributeTypes());
  if (exists !== undefined) {
    const frozen = Object.freeze(names);
    this._attributeNamesMemo = { names: frozen };
    return frozen as string[];
  }
  return names;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#_has_attribute?
 * (attribute_methods.rb:260-262).
 *
 * @internal Rails-private helper.
 */
function classHasAttribute(
  this: { attributeTypes(): Record<string, unknown> },
  attrName: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(this.attributeTypes(), attrName);
}

export const ClassMethods = {
  attributeNames: classAttributeNames,
  _hasAttribute: classHasAttribute,
};

// ---------------------------------------------------------------------------
// Instance methods mirrored from attribute_methods.rb
// ---------------------------------------------------------------------------

/** Mirrors: ActiveRecord::AttributeMethods#attribute_for_inspect */
export function attributeForInspect(this: InstanceMethodHost, attr: string): string {
  return _attrForInspect.call(this as any, attr);
}

/**
 * Mirrors: ActiveRecord::AttributeMethods#[] (attribute_methods.rb:415-417)
 *
 *   def [](attr_name)
 *     read_attribute(attr_name) { |n| missing_attribute(n, caller) }
 *   end
 */
export function get(this: InstanceMethodHost, attrName: string): unknown {
  return this.readAttribute(attrName, (n) =>
    missingAttribute.call(this as unknown as AttributeMethodsInstanceHost, n),
  );
}

/**
 * Mirrors: ActiveRecord::AttributeMethods#[]= (attribute_methods.rb:428-430)
 *
 *   def []=(attr_name, value)
 *     write_attribute(attr_name, value)
 *   end
 */
export function set(this: InstanceMethodHost, attrName: string, value: unknown): void {
  this.writeAttribute(attrName, value);
}

/** Mirrors: ActiveRecord::AttributeMethods#query_attribute */
export function queryAttribute(this: InstanceMethodHost, name: string): boolean {
  return _queryAttribute.call(this as any, name);
}

/** Mirrors: ActiveRecord::AttributeMethods#to_key */
export function toKey(this: InstanceMethodHost): unknown[] | null {
  const pk = this.id;
  if (pk == null) return null;
  const arr = Array.isArray(pk) ? pk : [pk];
  return arr.some((v: unknown) => v == null) ? null : arr;
}

/** Mirrors: ActiveRecord::AttributeMethods#id, id= */
export function id(this: InstanceMethodHost, value?: unknown): unknown {
  const ctor = this.constructor as any;
  const pk = ctor.primaryKey as string | string[];
  if (value !== undefined) {
    if (Array.isArray(pk)) {
      if (!Array.isArray(value)) {
        throw new TypeError(
          `Expected an array for composite primary key [${pk.join(", ")}], got ${value === null ? "null" : typeof value}`,
        );
      }
      pk.forEach((col: string, i: number) => this._writeAttribute(col, (value as unknown[])[i]));
    } else {
      this._writeAttribute(pk, value);
    }
    return value;
  }
  if (Array.isArray(pk)) return pk.map((col: string) => this._readAttribute(col));
  return this._readAttribute(pk);
}

/** Mirrors: ActiveRecord::AttributeMethods#reload */
export async function reload<T>(this: T): Promise<T> {
  return _reload.call(this as any) as unknown as Promise<T>;
}

/** Mirrors: ActiveRecord::AttributeMethods#serializable_hash */
export function serializableHash(
  this: InstanceMethodHost,
  options?: unknown,
): Record<string, unknown> {
  return _serializableHash.call(this as any, options as any);
}

/**
 * Mirrors: ActiveRecord::AttributeMethods#attribute_names_for_serialization
 *
 * @internal
 */
export function attributeNamesForSerialization(this: InstanceMethodHost): string[] {
  return _attrNamesForSerialization.call(this as any);
}

// ---------------------------------------------------------------------------
// Sub-module method delegates — parity:api requires exported function
// declarations (not re-export statements) to count a method as present in
// this file. Each function below delegates to the canonical implementation in
// the relevant sub-module file so attribute_methods.rb reaches 100%.
// ---------------------------------------------------------------------------

import {
  readAttributeBeforeTypeCast as _readAttributeBeforeTypeCast,
  readAttributeForDatabase as _readAttributeForDatabase,
  attributesBeforeTypeCast as _attributesBeforeTypeCast,
  attributesForDatabase as _attributesForDatabase,
  attributeBeforeTypeCast as _attributeBeforeTypeCast,
  attributeForDatabase as _attributeForDatabase,
  attributeCameFromUser as _attributeCameFromUser,
} from "./attribute-methods/before-type-cast.js";
import { queryCastAttribute as _queryCastAttribute } from "./attribute-methods/query.js";
import {
  isSavedChangeToAttribute as _isSavedChangeToAttribute,
  savedChangeToAttribute as _savedChangeToAttribute,
  attributeBeforeLastSave as _attributeBeforeLastSave,
  isSavedChanges as _isSavedChanges,
  isWillSaveChangeToAttribute as _isWillSaveChangeToAttribute,
  attributeChangeToBeSaved as _attributeChangeToBeSaved,
  attributeInDatabase as _attributeInDatabase,
  attributeNamesForPartialUpdates as _attributeNamesForPartialUpdates,
  attributeNamesForPartialInserts as _attributeNamesForPartialInserts,
} from "./attribute-methods/dirty.js";

/** @internal */
export function readAttributeBeforeTypeCast(this: InstanceMethodHost, name: string): unknown {
  return _readAttributeBeforeTypeCast(this as any, name);
}
/** @internal */
export function readAttributeForDatabase(this: InstanceMethodHost, attrName: string): unknown {
  return _readAttributeForDatabase(this as any, attrName);
}
/** @internal */
export function attributesBeforeTypeCast(this: InstanceMethodHost): Record<string, unknown> {
  return _attributesBeforeTypeCast.call(this as any);
}
/** @internal */
export function attributesForDatabase(this: InstanceMethodHost): Record<string, unknown> {
  return _attributesForDatabase(this as any);
}
/** @internal */
export function attributeBeforeTypeCast(this: InstanceMethodHost, attrName: string): unknown {
  return _attributeBeforeTypeCast.call(this as any, attrName);
}
/** @internal */
export function attributeForDatabase(this: InstanceMethodHost, attrName: string): unknown {
  return _attributeForDatabase.call(this as any, attrName);
}
/** @internal */
export function attributeCameFromUser(this: InstanceMethodHost, attrName: string): boolean {
  return _attributeCameFromUser.call(this as any, attrName);
}
/** @internal */
export function queryCastAttribute(
  this: InstanceMethodHost,
  attrName: string,
  value: unknown,
): unknown {
  return _queryCastAttribute.call(this as any, attrName, value);
}
/** @internal */
export function isSavedChangeToAttribute(
  this: InstanceMethodHost,
  attr: string,
  options?: DirtyOptions,
): boolean {
  return _isSavedChangeToAttribute(this as any, attr, options);
}
/** @internal */
export function savedChangeToAttribute(
  this: InstanceMethodHost,
  attr: string,
): [unknown, unknown] | null {
  return _savedChangeToAttribute(this as any, attr);
}
/** @internal */
export function attributeBeforeLastSave(this: InstanceMethodHost, attr: string): unknown {
  return _attributeBeforeLastSave(this as any, attr);
}
/** @internal */
export function isSavedChanges(this: InstanceMethodHost): boolean {
  return _isSavedChanges(this as any);
}
/** @internal */
export function isWillSaveChangeToAttribute(
  this: InstanceMethodHost,
  attr: string,
  options?: DirtyOptions,
): boolean {
  return _isWillSaveChangeToAttribute(this as any, attr, options);
}
/** @internal */
export function attributeChangeToBeSaved(
  this: InstanceMethodHost,
  attr: string,
): [unknown, unknown] | null {
  return _attributeChangeToBeSaved(this as any, attr);
}
/** @internal */
export function attributeInDatabase(this: InstanceMethodHost, attr: string): unknown {
  return _attributeInDatabase(this as any, attr);
}
/** @internal */
export function attributeNamesForPartialUpdates(this: InstanceMethodHost): string[] {
  return _attributeNamesForPartialUpdates.call(this as any);
}
/** @internal */
export function attributeNamesForPartialInserts(this: InstanceMethodHost): string[] {
  return _attributeNamesForPartialInserts.call(this as any);
}
