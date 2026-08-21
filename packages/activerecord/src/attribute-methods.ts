/**
 * AttributeMethods — methods for working with model attributes.
 *
 * Mirrors: ActiveRecord::AttributeMethods
 */
import { isBlank, include, Module } from "@blazetrails/activesupport";
import {
  MissingAttributeError,
  missingAttribute,
  isInstanceMethodAlreadyImplemented as _amInstanceMethodAlreadyImplemented,
  defineAttributeMethods as amDefineAttributeMethods,
  type InstanceHost as AttributeMethodsInstanceHost,
} from "@blazetrails/activemodel";
import { DangerousAttributeError } from "./errors.js";
import { formatForInspect as _formatForInspect } from "./attribute-inspection.js";
import {
  attributeForInspect as _attrForInspect,
  initializeGeneratedModules as _coreInitializeGeneratedModules,
} from "./core.js";
import { writeAttribute as _writeAttribute } from "./readonly-attributes.js";
import { queryAttribute as _queryAttribute } from "./attribute-methods/query.js";
// toKey/id: inline to avoid a circular dependency (primary-key.ts imports
// dangerousAttributeMethods from this file)
import { reload as _reload } from "./persistence.js";
import { cachedTableExists, loadSchema } from "./model-schema.js";
import {
  serializableHash as _serializableHash,
  attributeNamesForSerialization as _attrNamesForSerialization,
} from "./serialization.js";
// ActiveModel provides aliasAttribute and undefineAttributeMethods on Model.
// aliasAttribute delegates via the prototype chain. defineAttributeMethods
// is implemented here since AM doesn't expose it as a static on Model.

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
  _attributes: { has(name: string): boolean; keys(): Iterable<string>; get(name: string): unknown };
  _accessedFields: Set<string>;
  readAttribute(name: string): unknown;
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
    has(name: string): boolean;
    keys(): Iterable<string>;
    get?(name: string): unknown;
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

/** Minimal shape for inline property-descriptor get/set callbacks. */
interface AttributeAccessorHost {
  readAttribute(name: string): unknown;
  /** @internal */
  _readAttribute(name: string, block?: (name: string) => unknown): unknown;
  writeAttribute(name: string, value: unknown): void;
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
  return this._attributes.has(attrName);
}

/**
 * Check whether an attribute is present (not null, not undefined, not empty string).
 *
 * Mirrors: ActiveRecord::AttributeMethods#attribute_present?
 */
export function attributePresent(this: AttributeRecord, name: string): boolean {
  return !isBlank(this.readAttribute(name));
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
  return [...this._accessedFields];
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
  defineAttributeMethods?(): boolean;
  generateAliasAttributes?(): void;
}

const RESTRICTED_CLASS_METHODS = new Set(["allocate", "new", "name", "parent", "superclass"]);

let _dangerousMethodsCache: Set<string> | null = null;

/**
 * Rails: collects Base.instance_methods + private_instance_methods
 * minus superclass methods. These are method names that would conflict
 * with attribute accessors if a column had the same name.
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
 * Delegates to ActiveModel::AttributeMethods#alias_attribute which
 * handles aliases, getter/setter generation, and pattern-based methods.
 */
export function aliasAttribute(this: AttributeMethodsHost, newName: string, oldName: string): void {
  // Delegate to ActiveModel's aliasAttribute via prototype chain
  const amFn = Object.getPrototypeOf(this)?.aliasAttribute;
  if (typeof amFn === "function") {
    amFn.call(this, newName, oldName);
  } else {
    if (!this.attributeAliases) this.attributeAliases = {};
    this.attributeAliases[newName] = oldName;
  }
}

export function eagerlyGenerateAliasAttributeMethods(this: AttributeMethodsHost): void {
  this._aliasAttributesMassGenerated = true;
}

export function generateAliasAttributeMethods(
  this: AttributeMethodsHost,
  _newName: string,
  _oldName: string,
): void {
  // Alias attribute methods are defined eagerly via Object.defineProperty
  // in activemodel's aliasAttribute. This hook exists for Rails parity.
}

export function aliasAttributeMethodDefinition(
  this: AttributeMethodsHost,
  newName: string,
  oldName: string,
): void {
  // Rails generates pattern-based alias methods for a single pattern.
  // Define a direct getter/setter for the alias name.
  if (this.prototype && !(newName in this.prototype)) {
    Object.defineProperty(this.prototype, newName, {
      get(this: AttributeAccessorHost) {
        // Rails' generated alias reader is `_read_attribute(canonical) { |n|
        // missing_attribute(n, caller) }` — a known-but-unselected column yields
        // to the block and raises, matching `record[attr]`.
        return this._readAttribute(oldName, (n) => {
          throw new MissingAttributeError(
            `missing attribute '${n}' for ${(this.constructor as { name?: string }).name ?? "unknown"}`,
          );
        });
      },
      set(this: AttributeAccessorHost, value: unknown) {
        this.writeAttribute(oldName, value);
      },
      configurable: true,
    });
  }
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
  // class body can reach `generated_attribute_methods`; here a class-body
  // `alias_attribute` gets there first and ActiveModel builds a bare `Module`
  // under the same ivar name (attribute_methods.rb:400-402), so the gate also
  // checks the class — Rails' AR override is what names the module
  // (`const_set`), and it is the one this class must end up with.
  if (
    !Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods") ||
    !(this._generatedAttributeMethods instanceof GeneratedAttributeMethods)
  ) {
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
      if (this._hasAttribute("id")) this.aliasAttribute("idValue", "id");
    }
  }
  generateAliasAttributes.call(this);
  this._attributeMethodsGenerated = true;
  return true;
}

export function generateAliasAttributes(this: AttributeMethodsHost): void {
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
  if (this.attributeAliases) {
    for (const [newName, oldName] of Object.entries(this.attributeAliases)) {
      aliasAttributeMethodDefinition.call(this, newName, oldName);
    }
  }
  this._aliasAttributesMassGenerated = true;
}

export function undefineAttributeMethods(this: AttributeMethodsHost): void {
  const amFn = Object.getPrototypeOf(this)?.undefineAttributeMethods;
  if (typeof amFn === "function") amFn.call(this);
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
 */
export function isInstanceMethodAlreadyImplemented(
  this: AttributeMethodsHost,
  methodName: string,
): boolean {
  if (isDangerousAttributeMethod.call(this, methodName)) {
    throw new DangerousAttributeError(
      `${methodName} is defined by Active Record. Check to make sure that you don't have an attribute or method with the same name.`,
    );
  }

  const superclass = Object.getPrototypeOf(this);
  if (Object.prototype.hasOwnProperty.call(superclass ?? {}, "_isActiveRecordBase")) {
    return _amInstanceMethodAlreadyImplemented.call(this as any, methodName);
  } else {
    // If ThisClass < ... < SomeSuperClass < ... < Base and SomeSuperClass
    // defines its own attribute method, then we don't want to override that.
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
  return this._attributes?.has(attrName) ?? false;
}

// ---------------------------------------------------------------------------
// Private instance helpers — mirrors ActiveRecord::AttributeMethods private block
// ---------------------------------------------------------------------------

function attributeMethod(this: InstanceMethodHost, attrName: string): boolean {
  return this._attributes != null && (this._attributes.has(attrName) ?? false);
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
    // `value_for_database` the adapter's `type_casted_binds` reads. The `has`
    // guard keeps a name with no attribute out of the write entirely rather
    // than writing the uninitialized default's NULL.
    if (attributes.has(name)) result[name] = attributes.getAttribute?.(name);
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
    // Rails: pk_attribute?(name) && id.nil? — check per-column PK value so
    // composite PKs work correctly (this.id would be an array, not null).
    if (pkAttribute.call(this, name) && this._attributes?.get?.(name) == null) return false;
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
  return Array.isArray(pk) ? pk.includes(name) : name === pk;
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

/** Mirrors: ActiveRecord::AttributeMethods#read_attribute (read.rb:31-34) */
export function readAttribute(
  this: InstanceMethodHost,
  name: string,
  block?: (name: string) => unknown,
): unknown {
  return this._readAttribute(
    (
      this.constructor as unknown as { resolveAttributeName(n: string): string }
    ).resolveAttributeName(name),
    block,
  );
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

/** Mirrors: ActiveRecord::AttributeMethods#write_attribute (write.rb:31-34) */
export function writeAttribute(this: InstanceMethodHost, name: string, value: unknown): void {
  _writeAttribute.call(
    this as any,
    (
      this.constructor as unknown as { resolveAttributeName(n: string): string }
    ).resolveAttributeName(name),
    value,
  );
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
// primary-key.ts imports dangerousAttributeMethods from this file, so we cannot
// import from it here (cycle). These 5 delegates are inlined the same way
// toKey/id are inlined above (see comment near line 12).
import {
  type DirtyOptions,
  isSavedChangeToAttribute as _isSavedChangeToAttribute,
  savedChangeToAttribute as _savedChangeToAttribute,
  attributeBeforeLastSave as _attributeBeforeLastSave,
  isSavedChanges as _isSavedChanges,
  savedChanges as _savedChanges,
  isWillSaveChangeToAttribute as _isWillSaveChangeToAttribute,
  attributeChangeToBeSaved as _attributeChangeToBeSaved,
  attributeInDatabase as _attributeInDatabase,
  isHasChangesToSave,
  changesToSave as _changesToSave,
  changedAttributeNamesToSave as _changedAttributeNamesToSave,
  attributesInDatabase as _attributesInDatabase,
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
  return _attributesBeforeTypeCast(this as any);
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
export function isPrimaryKeyValuesPresent(this: InstanceMethodHost): boolean {
  const pk = (this.constructor as any).primaryKey;
  if (Array.isArray(pk)) {
    return pk.every((col: string) => {
      const v = this._readAttribute(col);
      return v !== null && v !== undefined;
    });
  }
  return this.id != null;
}

function _readPkWith(record: InstanceMethodHost, method: string): unknown {
  const pk = (record.constructor as any).primaryKey;
  const fn = (record as any)[method];
  if (typeof fn === "function") {
    if (Array.isArray(pk)) return pk.map((k: string) => fn.call(record, k));
    return fn.call(record, pk);
  }
  if (Array.isArray(pk)) return pk.map((k: string) => record._readAttribute(k));
  return record._readAttribute(pk);
}

/** @internal */
export function idBeforeTypeCast(this: InstanceMethodHost): unknown {
  return _readPkWith(this, "readAttributeBeforeTypeCast");
}
/** @internal */
export function idWas(this: InstanceMethodHost): unknown {
  return _readPkWith(this, "attributeWas");
}
/** @internal */
export function idInDatabase(this: InstanceMethodHost): unknown {
  return _readPkWith(this, "attributeInDatabase");
}
/** @internal */
export function idForDatabase(this: InstanceMethodHost): unknown {
  const pk = (this.constructor as any).primaryKey;
  const attrs = this._attributes;
  if (attrs?.getAttribute) {
    if (Array.isArray(pk)) {
      return pk.map((k: string) => {
        const attr = attrs.getAttribute!(k);
        return attr != null && "valueForDatabase" in attr
          ? attr.valueForDatabase
          : this._readAttribute(k);
      });
    }
    const attr = attrs.getAttribute(pk);
    if (attr != null && "valueForDatabase" in attr) return attr.valueForDatabase;
  }
  if (Array.isArray(pk)) return pk.map((k: string) => this._readAttribute(k));
  return this._readAttribute(pk);
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
export function savedChanges(this: InstanceMethodHost): Record<string, [unknown, unknown]> {
  return _savedChanges(this as any);
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
export function hasChangesToSave(this: InstanceMethodHost): boolean {
  return isHasChangesToSave(this as any);
}
/** @internal */
export function changesToSave(this: InstanceMethodHost): Record<string, [unknown, unknown]> {
  return _changesToSave(this as any);
}
/** @internal */
export function changedAttributeNamesToSave(this: InstanceMethodHost): string[] {
  return _changedAttributeNamesToSave(this as any);
}
/** @internal */
export function attributesInDatabase(this: InstanceMethodHost): Record<string, unknown> {
  return _attributesInDatabase(this as any);
}
/** @internal */
export function attributeNamesForPartialUpdates(this: InstanceMethodHost): string[] {
  return _attributeNamesForPartialUpdates.call(this as any);
}
/** @internal */
export function attributeNamesForPartialInserts(this: InstanceMethodHost): string[] {
  return _attributeNamesForPartialInserts.call(this as any);
}
