import { ConfigurationError } from "./errors.js";
import type { Base } from "./base.js";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";

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
 * Rails clones the parent hash and merges local keys in, so subclass entries
 * shadow parent entries only for the keys the subclass adds.
 *
 * Mirrors: ActiveRecord::Store::ClassMethods#stored_attributes
 */
export function storedAttributes(modelClass: typeof Base): Record<string, string[]> {
  const parent = Object.getPrototypeOf(modelClass) as typeof Base | null;
  const parentAttrs = parent && typeof parent === "function" ? storedAttributes(parent) : {};
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
 * Sets the local stored attributes for a model class directly. Used internally
 * during store/store_accessor setup.
 *
 * Mirrors: ActiveRecord::Store#local_stored_attributes= (the attr_accessor setter)
 */
export function setLocalStoredAttributes(
  modelClass: typeof Base,
  attrs: Record<string, string[]>,
): void {
  _storedAttributes.set(modelClass, attrs);
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
      const isStringColumn = typeof raw === "string" || raw === null || raw === undefined;
      object.writeAttribute(attribute, isStringColumn ? JSON.stringify(obj) : obj);
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
    if (data === null || data === undefined) return {};
    if (typeof data === "string") return JSON.parse(data);
    if (typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
    return {};
  }

  protected static _writeHash(data: unknown): Record<string, unknown> {
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

/**
 * Store — JSON-backed attribute accessors.
 *
 * Mirrors: ActiveRecord::Store
 *
 * Stores a hash in a single database column (as JSON), but exposes
 * individual keys as virtual attribute accessors.
 *
 * Usage:
 *   store(User, 'settings', { accessors: ['theme', 'language'] })
 *   store(User, 'settings', { accessors: ['theme'], prefix: true })
 *   store(User, 'settings', { accessors: ['theme'], prefix: 'config' })
 *   store(User, 'settings', { accessors: ['theme'], suffix: true })
 *   store(User, 'settings', { accessors: ['theme'], suffix: 'setting' })
 *
 * The column should use the "json" type or a serialized text column.
 */
export function store(
  modelClass: typeof Base,
  attribute: string,
  options: {
    accessors: string[];
    prefix?: boolean | string;
    suffix?: boolean | string;
  },
): void {
  const { accessors, prefix, suffix } = options;

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
    // Mirrors Rails: accessor closures delegate through read/write_store_attribute.
    // Register the accessor name on the _store_accessors_module.
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
 * Standalone store_accessor for adding accessors to an existing store column.
 *
 * Mirrors: ActiveRecord::Store.store_accessor
 */
export const storeAccessor = store;

/**
 * Returns the HashAccessor class for a given store attribute column.
 * Raises ConfigurationError if the column is not a declared store.
 *
 * Mirrors: ActiveRecord::Store#store_accessor_for (private)
 *
 * @internal
 */
export function storeAccessorFor(
  modelClass: typeof Base,
  storeAttribute: string,
): typeof HashAccessor {
  const attrs = storedAttributes(modelClass);
  if (!attrs || !Object.prototype.hasOwnProperty.call(attrs, storeAttribute)) {
    throw new ConfigurationError(
      `the column '${storeAttribute}' has not been configured as a store. ` +
        `Please make sure the column is declared via store() or use a structured column type.`,
    );
  }
  // Prefer the accessor class configured on the attribute type (e.g. hstore →
  // StringKeyedHashAccessor). Guard: only use the result if it has read/write
  // methods (some types implement accessor() but return null).
  // Mirrors Rails: type_for_attribute(attr).accessor.
  const type = (modelClass as any).typeForAttribute?.(storeAttribute);
  if (type && typeof (type as any).accessor === "function") {
    const accessor = (type as any).accessor();
    if (accessor && typeof accessor.read === "function" && typeof accessor.write === "function") {
      return accessor as typeof HashAccessor;
    }
  }
  return IndifferentHashAccessor;
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
function asRegularHash(
  obj: Record<string, unknown> | HashWithIndifferentAccess<unknown>,
): Record<string, unknown> {
  // HashWithIndifferentAccess stores entries internally, so object spread
  // does not produce the stored key/value pairs — use toHash() to get a plain copy.
  if (obj instanceof HashWithIndifferentAccess) return obj.toHash();
  return { ...obj };
}

/**
 * Serializes a store value by converting to a plain hash before encoding.
 *
 * Mirrors: ActiveRecord::Store::IndifferentCoder#dump
 *
 * @internal
 */
export function dump(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  const plain =
    obj instanceof HashWithIndifferentAccess
      ? obj.toHash()
      : typeof obj === "object" && !Array.isArray(obj)
        ? { ...(obj as Record<string, unknown>) }
        : obj;
  return JSON.stringify(plain);
}

/**
 * Deserializes a store value and wraps in HashWithIndifferentAccess.
 *
 * Mirrors: ActiveRecord::Store::IndifferentCoder#load
 *
 * @internal
 */
export function load(value: unknown): unknown {
  if (value === null || value === undefined) return asIndifferentHash(null);
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return asIndifferentHash(parsed);
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
