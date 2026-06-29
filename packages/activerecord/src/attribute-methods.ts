/**
 * AttributeMethods — methods for working with model attributes.
 *
 * Mirrors: ActiveRecord::AttributeMethods
 */
import { isBlank } from "@blazetrails/activesupport";
import { MissingAttributeError, resolveAliasName } from "@blazetrails/activemodel";
import { formatForInspect as _formatForInspect } from "./attribute-inspection.js";
import { attributeForInspect as _attrForInspect } from "./core.js";
import { writeAttribute as _writeAttribute } from "./readonly-attributes.js";
import { queryAttribute as _queryAttribute } from "./attribute-methods/query.js";
// toKey/id: inline to avoid a circular dependency (primary-key.ts imports
// dangerousAttributeMethods from this file)
import { reload as _reload } from "./persistence.js";
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
  attributeNamesList: string[];
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
  /** @internal */
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, value: unknown): void;
}

/** Minimal shape for inline property-descriptor get/set callbacks. */
interface AttributeAccessorHost {
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
}

/**
 * Check whether an attribute exists on a record.
 *
 * Mirrors: ActiveRecord::AttributeMethods#has_attribute?
 */
export function hasAttribute(this: AttributeRecord, name: string): boolean {
  // Rails `has_attribute?` resolves attribute_aliases before hitting the
  // attribute set (active_record/attribute_methods.rb).
  const resolved = resolveAliasName(
    (this as unknown as { constructor: unknown }).constructor as Parameters<
      typeof resolveAliasName
    >[0],
    name,
  );
  return this._attributes.has(resolved);
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
export function attributeNamesList(this: AttributeRecord): string[] {
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
 * Generated attribute methods placeholder.
 * Model classes mix dynamically-generated accessors into this module.
 *
 * Mirrors: ActiveRecord::AttributeMethods::GeneratedAttributeMethods
 */
export class GeneratedAttributeMethods {}

// ---------------------------------------------------------------------------
// Class methods — mirrors ActiveRecord::AttributeMethods::ClassMethods
// ---------------------------------------------------------------------------

interface AttributeMethodsHost {
  name: string;
  _attributeDefinitions: Map<string, any>;
  _attributeMethodsGenerated?: boolean;
  _aliasAttributesMassGenerated?: boolean;
  _attributeAliases?: Record<string, string>;
  _dangerousAttributeMethods?: Set<string>;
  _ignoredColumns?: string[];
  prototype: any;
  isBaseClass?(): boolean;
  abstractClass?: boolean;
  aliasAttribute?(newName: string, oldName: string): void;
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
  ]);
  return _dangerousMethodsCache;
}

export function initializeGeneratedModules(this: AttributeMethodsHost): void {
  if (!this._attributeMethodsGenerated) {
    this._attributeMethodsGenerated = false;
  }
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
    if (!this._attributeAliases) this._attributeAliases = {};
    this._attributeAliases[newName] = oldName;
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
      get(
        this: AttributeAccessorHost & {
          _attributes: { getAttribute(n: string): { isInitialized(): boolean } };
        },
      ) {
        if (!this._attributes.getAttribute(oldName).isInitialized()) {
          throw new MissingAttributeError(
            `missing attribute '${oldName}' for ${(this.constructor as { name?: string }).name ?? "unknown"}`,
          );
        }
        return this.readAttribute(oldName);
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
    generateConcreteAttributeMethods.call(this);
  }
  generateAliasAttributes.call(this);
  this._attributeMethodsGenerated = true;
  return true;
}

function generateConcreteAttributeMethods(this: AttributeMethodsHost): void {
  // Generate getter/setter for each attribute definition that doesn't
  // already have one on the prototype (mirrors Rails' define_attribute_methods).
  // This is the single generation path: the declaration sites
  // (Attributes#defineAttribute, ModelSchema#applyColumnsHash) invalidate
  // `_attributeMethodsGenerated` and route here rather than installing
  // accessors inline, mirroring Rails' lazy `define_attribute_methods`.
  const proto = this.prototype;
  const ignored = new Set(this._ignoredColumns ?? []);
  for (const name of this._attributeDefinitions.keys()) {
    // ignored columns keep their (possibly user-declared) definition but expose
    // no accessor — mirrors applyColumnsHash's strip-accessor-keep-def behavior.
    if (ignored.has(name)) continue;
    // `id` is left to Base.prototype.id (the CPK-aware getter), never a plain
    // attribute accessor — matches the id-skip in the declaration sites.
    if (name === "id") {
      if (Object.prototype.hasOwnProperty.call(proto, "id")) {
        delete (proto as Record<string, unknown>)["id"];
      }
      continue;
    }
    // Gate get and set independently: a user-defined setter should not suppress
    // the generated reader, and vice versa — mirrors Rails' per-method generation.
    // Walk the full prototype chain to find an existing descriptor for this name.
    const existingDesc = (() => {
      let p: object | null = proto;
      while (p != null) {
        const d = Object.getOwnPropertyDescriptor(p, name);
        if (d) return d;
        p = Object.getPrototypeOf(p) as object | null;
      }
      return undefined;
    })();
    const needsGetter =
      existingDesc == null || (existingDesc.get == null && !("value" in existingDesc));
    const needsSetter =
      existingDesc == null || (existingDesc.set == null && !("value" in existingDesc));
    if (needsGetter || needsSetter) {
      // If a partial accessor already exists on the proto, we must redefine it to
      // add the missing half; otherwise install a fresh descriptor.
      const ownDesc = Object.getOwnPropertyDescriptor(proto, name);
      const newDesc: PropertyDescriptor = { configurable: true };
      if (needsGetter) {
        newDesc.get = function (
          this: AttributeAccessorHost & {
            _attributes: { getAttribute(n: string): { isInitialized(): boolean } };
          },
        ) {
          if (!this._attributes.getAttribute(name).isInitialized()) {
            throw new MissingAttributeError(
              `missing attribute '${name}' for ${(this.constructor as { name?: string }).name ?? "unknown"}`,
            );
          }
          return this.readAttribute(name);
        };
      } else if (ownDesc?.get) {
        newDesc.get = ownDesc.get;
      }
      if (needsSetter) {
        newDesc.set = function (this: AttributeAccessorHost, value: unknown) {
          this.writeAttribute(name, value);
        };
      } else if (ownDesc?.set) {
        newDesc.set = ownDesc.set;
      }
      Object.defineProperty(proto, name, newDesc);
    }
    // Per-attribute *BeforeTypeCast / *ForDatabase aliases. Rails generates
    // these via `attribute_method_suffix "_before_type_cast", "_for_database"`
    // in AttributeMethods::BeforeTypeCast.
    const btcName = `${name}BeforeTypeCast`;
    if (!Object.prototype.hasOwnProperty.call(this.prototype, btcName)) {
      Object.defineProperty(this.prototype, btcName, {
        get(this: { readAttributeBeforeTypeCast(n: string): unknown }) {
          return this.readAttributeBeforeTypeCast(name);
        },
        configurable: true,
      });
    }
    const fdName = `${name}ForDatabase`;
    if (!Object.prototype.hasOwnProperty.call(this.prototype, fdName)) {
      Object.defineProperty(this.prototype, fdName, {
        get(this: { readAttributeForDatabase(n: string): unknown }) {
          return this.readAttributeForDatabase(name);
        },
        configurable: true,
      });
    }
  }
  // Rails: `alias_attribute :id_value, :id if _has_attribute?("id")` — inside the
  // `unless abstract_class?` block, so it only runs for concrete classes (this
  // helper is only invoked when not abstract). Routed through aliasAttribute so
  // it composes with generateAliasAttributes and the alias getter reads the
  // (CPK-aware) id column.
  if (this._attributeDefinitions.has("id") && typeof this.aliasAttribute === "function") {
    this.aliasAttribute("idValue", "id");
  }
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
  if (this._attributeAliases) {
    for (const [newName, oldName] of Object.entries(this._attributeAliases)) {
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

export function isInstanceMethodAlreadyImplemented(
  this: AttributeMethodsHost,
  methodName: string,
): boolean {
  return methodName in this.prototype;
}

export function isDangerousAttributeMethod(this: AttributeMethodsHost, name: string): boolean {
  return dangerousAttributeMethods().has(name);
}

export function isMethodDefinedWithin(
  this: AttributeMethodsHost,
  name: string,
  klass: any,
  superklass?: any,
): boolean {
  if (!(name in klass.prototype)) return false;
  if (!superklass) return true;
  return !(name in superklass.prototype);
}

export function isDangerousClassMethod(this: AttributeMethodsHost, methodName: string): boolean {
  if (RESTRICTED_CLASS_METHODS.has(methodName)) return true;
  return typeof (this as any)[methodName] === "function";
}

export function isAttributeMethod(this: AttributeMethodsHost, name: string): boolean {
  return this._attributeDefinitions.has(name);
}

/**
 * Mirrors ActiveRecord::AttributeMethods#_has_attribute? (instance method):
 * a bare `@attributes.key?(attr_name)` with no alias resolution. Wired onto
 * the prototype as an instance method, so `this` is a record and reads its
 * attribute set — not `_attributeDefinitions`, which lives on the class.
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
    if (attributes.has(name)) result[name] = attributes.fetchValue?.(name);
  }
  return result;
}

/** @internal */
export function attributesForUpdate(this: InstanceMethodHost, attributeNames: string[]): string[] {
  const mc = this.constructor as any;
  const colNames = new Set<string>(mc.columnNames?.() ?? []);
  return attributeNames.filter((name) => {
    if (!colNames.has(name)) return false;
    if (mc._readonlyAttributes?.has?.(name)) return false;
    if (mc._counterCacheColumns?.has?.(name)) return false;
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
  // path (base.ts._performInsert), mirroring the Rails super chain
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
  _attributeDefinitions: { keys(): Iterable<string>; has(name: string): boolean };
  columnNames?(): string[];
}

/**
 * Returns the list of attribute names for the model class.
 *
 * Mirrors: ActiveRecord::AttributeMethods::ClassMethods#attribute_names
 *
 * Rails returns schema column order first, then any declared/virtual
 * attributes that aren't columns (attributes_test.rb "overloading properties
 * does not attribute method order"). A user `attribute :col` override keeps the
 * column's schema position rather than jumping to its declaration slot, so we
 * walk `column_names` first and append the non-column declarations in
 * declaration order.
 */
export function attributeNames(this: AttributeNamesHost): string[] {
  const declared = [...this._attributeDefinitions.keys()];
  const columnNames = this.columnNames?.() ?? [];
  if (columnNames.length === 0) return declared;
  const columnSet = new Set(columnNames);
  const orderedColumns = columnNames.filter((name) => this._attributeDefinitions.has(name));
  const virtuals = declared.filter((name) => !columnSet.has(name));
  return [...orderedColumns, ...virtuals];
}

// ---------------------------------------------------------------------------
// Instance methods mirrored from attribute_methods.rb
// ---------------------------------------------------------------------------

/** Mirrors: ActiveRecord::AttributeMethods#attribute_for_inspect */
export function attributeForInspect(this: InstanceMethodHost, attr: string): string {
  return _attrForInspect.call(this as any, attr);
}

/** Mirrors: ActiveRecord::AttributeMethods#read_attribute */
export function readAttribute(this: InstanceMethodHost, name: string): unknown {
  const aliases = (this.constructor as any)?._attributeAliases ?? {};
  const resolved = (aliases[name] as string | undefined) ?? name;
  return this._readAttribute(resolved);
}

/** Mirrors: ActiveRecord::AttributeMethods#write_attribute */
export function writeAttribute(this: InstanceMethodHost, name: string, value: unknown): void {
  const aliases = (this.constructor as any)?._attributeAliases ?? {};
  const resolved = (aliases[name] as string | undefined) ?? name;
  _writeAttribute.call(this as any, resolved, value);
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
// Sub-module method delegates — api:compare requires exported function
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
  isAttributeCameFromUser as _isAttributeCameFromUser,
} from "./attribute-methods/before-type-cast.js";
import { queryCastAttribute as _queryCastAttribute } from "./attribute-methods/query.js";
// primary-key.ts imports dangerousAttributeMethods from this file, so we cannot
// import from it here (cycle). These 5 delegates are inlined the same way
// toKey/id are inlined above (see comment near line 12).
import {
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
  _touchRow as __touchRow,
  _updateRecord as __updateRecord,
  _createRecord as __createRecord,
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
export function isAttributeCameFromUser(this: InstanceMethodHost, attrName: string): boolean {
  return _isAttributeCameFromUser.call(this as any, attrName);
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
export function isSavedChangeToAttribute(this: InstanceMethodHost, attr: string): boolean {
  return _isSavedChangeToAttribute(this as any, attr);
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
export function isWillSaveChangeToAttribute(this: InstanceMethodHost, attr: string): boolean {
  return _isWillSaveChangeToAttribute(this as any, attr);
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
export function _touchRow(
  this: InstanceMethodHost,
  attributeNames: string[],
  time?: any,
): Promise<number> {
  return __touchRow.call(this as any, attributeNames, time);
}
/** @internal */
export function _updateRecord(
  this: InstanceMethodHost,
  attributeNames?: string[],
): Promise<number> {
  return __updateRecord.call(this as any, attributeNames);
}
/** @internal */
export function _createRecord(
  this: InstanceMethodHost,
  attributeNames?: string[],
): Promise<unknown> {
  return __createRecord.call(this as any, attributeNames);
}
/** @internal */
export function attributeNamesForPartialUpdates(this: InstanceMethodHost): string[] {
  return _attributeNamesForPartialUpdates.call(this as any);
}
/** @internal */
export function attributeNamesForPartialInserts(this: InstanceMethodHost): string[] {
  return _attributeNamesForPartialInserts.call(this as any);
}
