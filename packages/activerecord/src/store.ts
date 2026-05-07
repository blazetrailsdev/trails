import { ConfigurationError } from "./errors.js";
import type { Base } from "./base.js";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { buildColumnSerializer } from "./attribute-methods/serialization.js";

// Injected by base.ts to break the store→serialize→json→store circular dep.
// store() calls this when wiring IndifferentCoder for plain text/string columns.
let _serializeAttr: ((klass: typeof Base, attr: string, opts: { coder: unknown }) => void) | null =
  null;

/** @internal Called once by base.ts during module init. */
export function registerSerializeFn(
  fn: (klass: typeof Base, attr: string, opts: { coder: unknown }) => void,
): void {
  _serializeAttr = fn;
}

interface CoderLike {
  dump(v: unknown): unknown;
  load(v: unknown): unknown;
}

/**
 * Per-class registry mapping store-attribute name to its IndifferentCoder.
 * Populated by store() to wire implicit serialize semantics.
 *
 * @internal
 */
const _storeCoders = new WeakMap<typeof Base, Map<string, IndifferentCoder>>();

/** @internal */
export function setStoreCoder(klass: typeof Base, attr: string, coder: IndifferentCoder): void {
  let map = _storeCoders.get(klass);
  if (!map) {
    map = new Map();
    _storeCoders.set(klass, map);
  }
  map.set(attr, coder);
}

/** @internal */
export function getStoreCoder(klass: typeof Base, attr: string): IndifferentCoder | undefined {
  let cls: typeof Base | null = klass;
  while (cls && typeof cls === "function" && cls !== Function.prototype) {
    const coder = _storeCoders.get(cls)?.get(attr);
    if (coder) return coder;
    cls = Object.getPrototypeOf(cls) as typeof Base | null;
  }
  return undefined;
}

/**
 * Wraps a column coder to ensure the deserialized value is a
 * HashWithIndifferentAccess and the serialized form is a plain hash.
 *
 * Mirrors: ActiveRecord::Store::IndifferentCoder
 */
export class IndifferentCoder {
  readonly storeAttribute: string;
  readonly coder: CoderLike | null;

  constructor(storeAttribute: string, coder?: CoderLike | null) {
    this.storeAttribute = storeAttribute;
    this.coder = coder ?? null;
  }

  dump(obj: unknown): unknown {
    const plain = asRegularHash(obj);
    return this.coder ? this.coder.dump(plain) : JSON.stringify(plain);
  }

  load(value: unknown): HashWithIndifferentAccess<unknown> {
    // Mirror Rails: @coder.load(yaml || "") — Ruby || coerces nil and false to "".
    // JS ?? only coerces null/undefined, so match Ruby truthiness explicitly.
    // For the default JSON path, blank/null → empty HWIA; invalid JSON → empty HWIA
    // (mirrors Rails YAMLColumn treating blank input as {}).
    if (this.coder) {
      const coerced = value === null || value === undefined || value === false ? "" : value;
      return asIndifferentHash(this.coder.load(coerced));
    }
    if (value === null || value === undefined || value === "") return asIndifferentHash(null);
    if (typeof value === "string") {
      try {
        return asIndifferentHash(JSON.parse(value));
      } catch {
        return asIndifferentHash(null);
      }
    }
    return asIndifferentHash(value);
  }

  /** @internal */
  accessor(): typeof IndifferentHashAccessor {
    return IndifferentHashAccessor;
  }
}

/**
 * Tracks stored attributes per model class.
 * Maps model class -> { storeName -> accessor keys[] }
 */
const _storedAttributes = new WeakMap<typeof Base, Record<string, string[]>>();

/**
 * Tracks the set of accessor method names defined via store() on each class.
 * Mirrors Rails' @_store_accessors_module which is a Module where store
 * accessor methods live. In TS we track the accessor names instead of a
 * real module (JS has no include mechanism).
 */
const _storeAccessorsModules = new WeakMap<typeof Base, Set<string>>();

/**
 * Returns (creating if needed) the store-accessor module for a model class.
 * Mirrors: ActiveRecord::Store::ClassMethods#_store_accessors_module
 */
export function storeAccessorsModule(modelClass: typeof Base): Set<string> {
  if (!_storeAccessorsModules.has(modelClass)) {
    _storeAccessorsModules.set(modelClass, new Set());
  }
  return _storeAccessorsModules.get(modelClass)!;
}

/**
 * Returns the stored attributes registered directly on this class (not inherited).
 *
 * Mirrors: ActiveRecord::Store#local_stored_attributes
 */
export function localStoredAttributes(modelClass: typeof Base): Record<string, string[]> {
  return _storedAttributes.get(modelClass) ?? {};
}

/**
 * This-typed wrapper for wiring as a class method via extend(Base).
 *
 * Mirrors: ActiveRecord::Store::ClassMethods#local_stored_attributes
 */
export function localStoredAttributesMethod(this: typeof Base): Record<string, string[]> {
  return localStoredAttributes(this);
}

/**
 * Returns stored attributes for this class merged with all ancestors'.
 * Each store column's key list is the union of parent and local keys (deduped,
 * order: parent keys first). Mirrors Rails' merge block: `{ |k, a, b| a | b }`.
 *
 * Mirrors: ActiveRecord::Store::ClassMethods#stored_attributes
 */
export function storedAttributes(modelClass: typeof Base): Record<string, string[]> {
  const parent = Object.getPrototypeOf(modelClass) as typeof Base | null;
  const parentAttrs =
    parent && typeof parent === "function" && parent !== Function.prototype
      ? storedAttributes(parent)
      : {};
  const local = _storedAttributes.get(modelClass);
  if (!local) return parentAttrs;
  const merged: Record<string, string[]> = { ...parentAttrs };
  for (const [store, keys] of Object.entries(local)) {
    merged[store] = [...new Set([...(parentAttrs[store] ?? []), ...keys])];
  }
  return merged;
}

/**
 * Registers accessor keys on a store column for `klass`. Uses Set union so
 * repeated calls with overlapping keys deduplicate (mirrors Rails `|=`).
 *
 * Called directly by store(). Base.store() delegates to store(), which
 * calls this — so the WeakMap is the single source of truth for
 * localStoredAttributes / storedAttributes.
 */
export function addLocalStoredAttribute(
  klass: typeof Base,
  storeName: string,
  keys: string[],
): void {
  const existing = _storedAttributes.get(klass) ?? {};
  const prev = existing[storeName] ?? [];
  _storedAttributes.set(klass, { ...existing, [storeName]: [...new Set([...prev, ...keys])] });
}

/**
 * Reads/writes hash keys on a store attribute.
 *
 * Mirrors: ActiveRecord::Store::HashAccessor
 */
export class HashAccessor {
  static read(object: Base, attribute: string, key: string): unknown {
    const data = object.readAttribute(attribute);
    if (data === null || data === undefined) return null;
    const obj = this._readHash(data);
    return obj[key] ?? null;
  }

  static write(object: Base, attribute: string, key: string, value: unknown): void {
    const current = this.read(object, attribute, key);
    if (value !== current) {
      this.prepare(object, attribute);
      const raw = object.readAttribute(attribute);
      const obj = this._writeHash(raw);
      obj[key] = value;
      // Structured types (json/jsonb/hstore) store plain objects; text/string columns
      // store JSON-encoded strings. Use the column's type name to decide.
      const typeName = (object.constructor as any).typeForAttribute?.(attribute)?.name;
      const isStringBacked =
        !typeName ||
        typeName === "string" ||
        typeName === "text" ||
        typeName === "immutable_string";
      object.writeAttribute(attribute, isStringBacked ? JSON.stringify(obj) : obj);
    }
  }

  static prepare(object: Base, attribute: string): void {
    const val = object.readAttribute(attribute);
    if (val === null || val === undefined) {
      object.writeAttribute(attribute, "{}");
    } else if (
      typeof val === "object" &&
      !Array.isArray(val) &&
      !(val instanceof HashWithIndifferentAccess) &&
      (Object.getPrototypeOf(val) === Object.prototype || Object.getPrototypeOf(val) === null)
    ) {
      const hwia = new HashWithIndifferentAccess(val as Record<string, unknown>);
      object.writeAttribute(attribute, hwia.toHash());
    }
  }

  protected static _readHash(data: unknown): Readonly<Record<string, unknown>> {
    if (data instanceof HashWithIndifferentAccess) return data.toHash();
    if (data === null || data === undefined) return {};
    if (typeof data === "string") return JSON.parse(data);
    if (typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
    return {};
  }

  protected static _writeHash(data: unknown): Record<string, unknown> {
    if (data instanceof HashWithIndifferentAccess) return data.toHash();
    if (data === null || data === undefined) return {};
    if (typeof data === "string") {
      const parsed = JSON.parse(data);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...parsed };
      }
      return {};
    }
    if (typeof data === "object" && !Array.isArray(data)) {
      return { ...(data as Record<string, unknown>) };
    }
    return {};
  }
}

/**
 * In Rails, IndifferentHashAccessor ensures the store value is a
 * HashWithIndifferentAccess. In TypeScript, JS objects already use
 * string keys natively, so no additional behavior is needed beyond
 * HashAccessor. Kept as a distinct class for Rails API parity.
 *
 * Mirrors: ActiveRecord::Store::IndifferentHashAccessor
 */
export class IndifferentHashAccessor extends HashAccessor {}

/**
 * Mirrors: ActiveRecord::Store::StringKeyedHashAccessor.
 * Rails uses this for Hstore columns — keys are coerced to strings on
 * both read and write, matching PG's text-only hstore key model. JS
 * object keys are already strings natively, so this ends up being a
 * thin wrapper; kept distinct for Rails API parity.
 */
export class StringKeyedHashAccessor extends HashAccessor {
  static override read(object: Base, attribute: string, key: unknown): unknown {
    return super.read(object, attribute, String(key));
  }

  static override write(object: Base, attribute: string, key: unknown, value: unknown): void {
    super.write(object, attribute, String(key), value);
  }
}

export interface StoreOptions {
  accessors?: string[];
  prefix?: boolean | string;
  suffix?: boolean | string;
  coder?: unknown;
  yaml?: Record<string, unknown>;
}

/**
 * Defines property accessors for the listed keys on a store column.
 * Does not wire IndifferentCoder — used internally by store() and
 * as the standalone store_accessor() implementation.
 *
 * Mirrors: ActiveRecord::Store::ClassMethods#store_accessor
 */
export function storeAccessor(
  modelClass: typeof Base,
  attribute: string,
  options: { accessors?: string[]; prefix?: boolean | string; suffix?: boolean | string },
): void {
  const { accessors = [], prefix, suffix } = options;

  addLocalStoredAttribute(modelClass, attribute, accessors);

  for (const accessor of accessors) {
    let accessorName = accessor;
    if (prefix) {
      const pre = prefix === true ? attribute : String(prefix);
      accessorName = `${pre}_${accessorName}`;
    }
    if (suffix) {
      const suf = suffix === true ? attribute : String(suffix);
      accessorName = `${accessorName}_${suf}`;
    }

    // Capture `modelClass` at definition time so subclass instances still resolve
    // the correct accessor even when `record.constructor` differs from the declaring class.
    // Mirrors Rails: _store_accessors_module.module_eval { define_method ... }
    storeAccessorsModule(modelClass).add(accessorName);

    const declaringClass = modelClass;
    Object.defineProperty(modelClass.prototype, accessorName, {
      get: function (this: Base) {
        return readStoreAttribute(this, attribute, accessor, declaringClass);
      },
      set: function (this: Base, value: unknown) {
        writeStoreAttribute(this, attribute, accessor, value, declaringClass);
      },
      configurable: true,
    });
  }
}

/**
 * Store — JSON-backed attribute accessors.
 *
 * Mirrors: ActiveRecord::Store::ClassMethods#store
 *
 * Wires IndifferentCoder so the column deserializes to HashWithIndifferentAccess,
 * then delegates accessor definition to storeAccessor().
 *
 * Usage:
 *   store(User, 'settings', { accessors: ['theme', 'language'] })
 *   store(User, 'settings', { accessors: ['theme'], prefix: true })
 *   store(User, 'settings', { accessors: ['theme'], coder: JSON })
 */
export function store(modelClass: typeof Base, attribute: string, options: StoreOptions): void {
  // Mirror Rails three-step: build_column_serializer → IndifferentCoder → serialize
  const baseCoder = buildColumnSerializer(attribute, options.coder, Object, options.yaml);
  // Validate: if a coder was resolved, it must implement dump/load. Strings, numbers,
  // and arbitrary objects without these methods would crash silently later.
  if (
    baseCoder != null &&
    (typeof (baseCoder as any).dump !== "function" || typeof (baseCoder as any).load !== "function")
  ) {
    throw new ConfigurationError(
      `store coder for '${attribute}' must implement dump() and load(), ` +
        `but got ${typeof baseCoder}.`,
    );
  }
  const indifferentCoder = new IndifferentCoder(attribute, baseCoder as CoderLike | null);
  setStoreCoder(modelClass, attribute, indifferentCoder);
  // Structured column types (json/jsonb/hstore) have a type-level accessor and
  // handle their own cast/serialize. Only patch readAttribute for plain text/string
  // columns that have no type-level accessor.
  const colType = (modelClass as any).typeForAttribute?.(attribute);
  if (!colType || typeof (colType as any).accessor !== "function") {
    if (!_serializeAttr) {
      throw new ConfigurationError(
        `store() requires serialize() to be registered before use. ` +
          `Ensure base.ts (or the activerecord index) is imported before calling store().`,
      );
    }
    _serializeAttr(modelClass, attribute, { coder: indifferentCoder as any });
  }

  if (options.accessors !== undefined) {
    storeAccessor(modelClass, attribute, {
      accessors: options.accessors,
      prefix: options.prefix,
      suffix: options.suffix,
    });
  } else {
    // Still register the column in storedAttributes even with no accessors.
    addLocalStoredAttribute(modelClass, attribute, []);
  }
}

/**
 * Returns the HashAccessor class for a given store attribute column.
 * Raises ConfigurationError if the column is not a declared store and the
 * attribute type has no accessor.
 *
 * Mirrors: ActiveRecord::Store#store_accessor_for (private)
 *
 * @internal
 */
export function storeAccessorFor(
  modelClass: typeof Base,
  storeAttribute: string,
): typeof HashAccessor {
  // Rails dispatches via type_for_attribute(attr).accessor — check the type first.
  const type = (modelClass as any).typeForAttribute?.(storeAttribute);
  if (type && typeof (type as any).accessor === "function") {
    const accessor = (type as any).accessor();
    if (accessor && typeof accessor.read === "function" && typeof accessor.write === "function") {
      return accessor as typeof HashAccessor;
    }
  }
  // Check IndifferentCoder registered by store() (covers both standalone and Base.store()) — returns IndifferentHashAccessor.
  const coder = getStoreCoder(modelClass, storeAttribute);
  if (coder) return coder.accessor();
  // Last resort: confirm the column was declared via store() and use IndifferentHashAccessor.
  if (!_hasStoredAttribute(modelClass, storeAttribute)) {
    throw new ConfigurationError(
      `the column '${storeAttribute}' has not been configured as a store. ` +
        `Please make sure the column is declared via store() or use a structured column type.`,
    );
  }
  return IndifferentHashAccessor;
}

// Direct ancestry walk — short-circuits on first hit without building the full
// merged map that storedAttributes() produces. Stops at Function.prototype
// consistent with other prototype-chain walks in this codebase.
function _hasStoredAttribute(klass: typeof Base, name: string): boolean {
  let cls: typeof Base | null = klass;
  while (cls && typeof cls === "function" && cls !== Function.prototype) {
    const local = _storedAttributes.get(cls);
    if (local && Object.prototype.hasOwnProperty.call(local, name)) return true;
    cls = Object.getPrototypeOf(cls) as typeof Base | null;
  }
  return false;
}

/**
 * Reads a single key from a store attribute.
 *
 * Mirrors: ActiveRecord::Store#read_store_attribute (private)
 */
export function readStoreAttribute(
  record: Base,
  storeAttribute: string,
  key: string,
  declaringClass?: typeof Base,
): unknown {
  // Use the declaring class (where store() was called) so subclass instances
  // resolve the correct accessor even when record.constructor differs from the parent.
  const modelClass = declaringClass ?? (record.constructor as typeof Base);
  const accessor = storeAccessorFor(modelClass, storeAttribute);
  return accessor.read(record, storeAttribute, key);
}

/**
 * Writes a single key to a store attribute.
 *
 * Mirrors: ActiveRecord::Store#write_store_attribute (private)
 */
export function writeStoreAttribute(
  record: Base,
  storeAttribute: string,
  key: string,
  value: unknown,
  declaringClass?: typeof Base,
): void {
  const modelClass = declaringClass ?? (record.constructor as typeof Base);
  const accessor = storeAccessorFor(modelClass, storeAttribute);
  accessor.write(record, storeAttribute, key, value);
}

/**
 * This-typed wrapper for wiring readStoreAttribute as instance method via include(Base).
 *
 * Mirrors: ActiveRecord::Store#read_store_attribute (private)
 *
 * @internal
 */
export function readStoreAttributeMethod(this: Base, storeAttribute: string, key: string): unknown {
  return readStoreAttribute(this, storeAttribute, key);
}

/**
 * This-typed wrapper for wiring writeStoreAttribute as instance method via include(Base).
 *
 * Mirrors: ActiveRecord::Store#write_store_attribute (private)
 *
 * @internal
 */
export function writeStoreAttributeMethod(
  this: Base,
  storeAttribute: string,
  key: string,
  value: unknown,
): void {
  writeStoreAttribute(this, storeAttribute, key, value);
}

/**
 * This-typed wrapper for wiring storeAccessorFor as instance method via include(Base).
 *
 * Mirrors: ActiveRecord::Store#store_accessor_for (private)
 *
 * @internal
 */
export function storeAccessorForMethod(this: Base, storeAttribute: string): typeof HashAccessor {
  return storeAccessorFor(this.constructor as typeof Base, storeAttribute);
}

/**
 * Converts a HashWithIndifferentAccess to a plain object.
 *
 * Mirrors: ActiveRecord::Store::IndifferentCoder#as_regular_hash (private)
 *
 * @internal
 */
function asRegularHash(obj: unknown): Record<string, unknown> {
  // Mirror Rails as_regular_hash: obj.to_hash if it responds, else {}.
  // null/undefined → {}; HWIA → toHash(); plain objects (Object/null proto) → spread;
  // class instances, Arrays, primitives → {} (respond_to?(:to_hash) is false for those).
  if (obj == null) return {};
  if (obj instanceof HashWithIndifferentAccess) return obj.toHash();
  if (typeof obj !== "object" || Array.isArray(obj)) return {};
  const proto = Object.getPrototypeOf(obj);
  return proto === Object.prototype || proto === null
    ? { ...(obj as Record<string, unknown>) }
    : {};
}

/**
 * Converts any value to a HashWithIndifferentAccess. Returns an empty HWIA
 * for nil/non-hash values, mirroring Rails' IndifferentCoder.as_indifferent_hash.
 *
 * Mirrors: ActiveRecord::Store::IndifferentCoder.as_indifferent_hash
 *
 * @internal
 */
export function asIndifferentHash(obj: unknown): HashWithIndifferentAccess<unknown> {
  if (obj instanceof HashWithIndifferentAccess) return obj;
  if (obj !== null && obj !== undefined && typeof obj === "object" && !Array.isArray(obj)) {
    return new HashWithIndifferentAccess(obj as Record<string, unknown>);
  }
  return new HashWithIndifferentAccess({});
}

/**
 * Returns (creating if needed) the store-accessor module for a model class.
 *
 * Mirrors: ActiveRecord::Store::ClassMethods#_store_accessors_module
 *
 * @internal
 */
export const _storeAccessorsModule = storeAccessorsModule;
