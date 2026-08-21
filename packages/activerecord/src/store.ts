import { ConfigurationError } from "./errors.js";
import type { Base } from "./base.js";
import { HashWithIndifferentAccess, withIndifferentAccess } from "@blazetrails/activesupport";
import { buildColumnSerializer } from "./attribute-methods/serialization.js";
import type { YamlColumnOptions } from "./coders/yaml-column.js";
import { getOrCreateModuleCarrier } from "./module-carrier.js";

// Injected by base.ts to break the store→serialize→json→store circular dep.
// Bound to `serialize` so store() reads as Rails' `serialize store_attribute,
// coder: IndifferentCoder.new(...)` (store.rb:108).
let serialize: ((klass: typeof Base, attr: string, opts: { coder: unknown }) => void) | null = null;

/** @internal Called once by base.ts during module init. */
export function registerSerializeFn(
  fn: (klass: typeof Base, attr: string, opts: { coder: unknown }) => void,
): void {
  serialize = fn;
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

/**
 * Trails-only seam with no Rails counterpart. Rails gets implicit store
 * serialization inside `ActiveRecord::Store::ClassMethods#store`
 * (store.rb:106-109), which builds the coder and hands it straight to
 * `serialize store_attribute, coder: IndifferentCoder.new(...)` (store.rb:108),
 * installing it as the attribute's type; trails resolves the coder separately
 * at read time, so the mapping needs its own per-class registry. Not a writer
 * for any Ruby attribute.
 *
 * @internal
 */
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
    if (this.coder) return this.coder.dump(asRegularHash(obj));
    return JSON.stringify(asRegularHash(obj));
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
 * Intermediate prototype objects inserted into the prototype chain so that
 * store accessors can be overridden on modelClass.prototype with `super`.
 * Mirrors Rails: Module.new { include … } inserted via _store_accessors_module.
 */
const _storeModuleProtos = new WeakMap<typeof Base, object>();

/**
 * Returns (creating if needed) the intermediate prototype that holds store
 * accessor descriptors for a model class. On first call the intermediate
 * object is spliced into the chain between modelClass.prototype and its
 * current parent so that user overrides on modelClass.prototype can call super.
 *
 * @internal
 */
function getOrCreateStoreModuleProto(modelClass: typeof Base): object {
  return getOrCreateModuleCarrier(modelClass, _storeModuleProtos);
}

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
export function localStoredAttributes(
  modelClass: typeof Base,
): Record<string, string[]> | undefined {
  return _storedAttributes.get(modelClass);
}

/**
 * This-typed wrapper for wiring as a class method via extend(Base).
 *
 * Mirrors: ActiveRecord::Store::ClassMethods#local_stored_attributes
 */
export function localStoredAttributesMethod(
  this: typeof Base,
): Record<string, string[]> | undefined {
  return localStoredAttributes(this);
}

/**
 * Returns stored attributes for this class merged with all ancestors'.
 * Each store column's key list is the union of parent and local keys (deduped,
 * order: parent keys first). Mirrors Rails' merge block: `{ |k, a, b| a | b }`.
 *
 * Mirrors: ActiveRecord::Store::ClassMethods#stored_attributes
 */
export function storedAttributes(this: typeof Base): Record<string, string[]> {
  const modelClass = this;
  const parent = Object.getPrototypeOf(modelClass) as typeof Base | null;
  const parentAttrs =
    typeof parent?.storedAttributes === "function" ? parent.storedAttributes() : {};
  const local = localStoredAttributes(modelClass);
  if (!local) return parentAttrs;
  const merged: Record<string, string[]> = { ...parentAttrs };
  for (const [store, keys] of Object.entries(local)) {
    merged[store] = [...new Set([...(parentAttrs[store] ?? []), ...keys])];
  }
  return merged;
}

/**
 * Reads/writes hash keys on a store attribute.
 *
 * Mirrors: ActiveRecord::Store::HashAccessor
 */
export class HashAccessor {
  static read(object: Base, attribute: string, key: string): unknown {
    this.prepare(object, attribute);
    const data = object.readAttribute(attribute);
    if (data === null || data === undefined) return null;
    const obj = this._readHash(data);
    return obj[key] ?? null;
  }

  static write(object: Base, attribute: string, key: string, value: unknown): void {
    this.prepare(object, attribute);
    if (value !== this.read(object, attribute, key)) {
      const raw = object.readAttribute(attribute);
      const obj = this._writeHash(raw);
      obj[key] = value;
      // Mirror Rails: write the plain hash back and let the column's type encode
      // it. Serialized columns (text-backed store) run Serialized#cast, which is
      // `deserialize(serialize(hash))` — the coder JSON-encodes the hash — while
      // structured types (json/jsonb/hstore) store the object directly. Writing a
      // hash (not a pre-encoded JSON string) is required for the serialize-first
      // cast to round-trip; a raw string would be flattened to {} by the coder.
      object.writeAttribute(attribute, obj);
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
 * Ensures the store attribute value is a HashWithIndifferentAccess before
 * reading or writing a key. The `prepare` override coerces non-HWIA values
 * via `asIndifferentHash`: hash-like objects (plain `{}`) are promoted to
 * HWIA preserving their keys; non-object values (strings, numbers, null)
 * become an empty HWIA. Matches Rails' behavior for structured column types
 * (json/jsonb/hstore) where the type deserializer may return a plain hash
 * or nil rather than a HWIA.
 *
 * Mirrors: ActiveRecord::Store::IndifferentHashAccessor
 */
export class IndifferentHashAccessor extends HashAccessor {
  static override prepare(object: Base, attribute: string): void {
    const val = object.readAttribute(attribute);
    if (!(val instanceof HashWithIndifferentAccess)) {
      object.writeAttribute(attribute, asIndifferentHash(val));
    }
  }
}

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

  /**
   * TS-specific override: the base HashAccessor.prepare writes `"{}"` (a JSON
   * string) for null values, which the hstore parser rejects as invalid hstore
   * format. Write `{}` (plain object) instead. Rails' StringKeyedHashAccessor
   * does not override prepare — it inherits HashAccessor.prepare which writes
   * an empty Ruby Hash; TS needs this override because the base writes a string.
   */
  static override prepare(object: Base, attribute: string): void {
    const val = object.readAttribute(attribute);
    if (val === null || val === undefined || typeof val !== "object") {
      object.writeAttribute(attribute, {});
    }
  }
}

export interface StoreOptions {
  accessors?: string[];
  prefix?: boolean | string;
  suffix?: boolean | string;
  coder?: unknown;
  yaml?: YamlColumnOptions;
}

/**
 * Defines property accessors for the listed keys on a store column.
 * Does not wire IndifferentCoder — used internally by store() and
 * as the standalone store_accessor() implementation.
 *
 * Rails defines `#{accessor_key}=` (store.rb:137) before the reader
 * (store.rb:141); a JS property carries both halves in one descriptor, so the
 * writer is the first entry inside it (see CLAUDE.md, "Generated attribute
 * readers are properties").
 *
 * Mirrors: ActiveRecord::Store::ClassMethods#store_accessor
 */
export function storeAccessor(
  modelClass: typeof Base,
  storeAttribute: string,
  options: { accessors?: string[]; prefix?: boolean | string; suffix?: boolean | string },
): void {
  const { accessors: keys = [], prefix = null, suffix = null } = options;

  const accessorPrefix =
    typeof prefix === "string" ? `${prefix}_` : prefix === true ? `${storeAttribute}_` : "";
  const accessorSuffix =
    typeof suffix === "string" ? `_${suffix}` : suffix === true ? `_${storeAttribute}` : "";

  // Install on the intermediate storeModule prototype so that user overrides
  // on modelClass.prototype can reach the store accessor via `super`.
  // Mirrors Rails: _store_accessors_module.module_eval { define_method ... }
  const storeModuleProto = getOrCreateStoreModuleProto(modelClass);
  for (const key of keys) {
    const accessorKey = `${accessorPrefix}${key}${accessorSuffix}`;
    storeAccessorsModule(modelClass).add(accessorKey);

    Object.defineProperty(storeModuleProto, accessorKey, {
      set: function (this: Base, value: unknown) {
        this.writeStoreAttribute(storeAttribute, key, value);
      },
      get: function (this: Base) {
        return this.readStoreAttribute(storeAttribute, key);
      },
      configurable: true,
    });

    const cap = accessorKey.charAt(0).toUpperCase() + accessorKey.slice(1);
    const define = (name: string, fn: (this: StoreDirtyHost) => unknown): void => {
      if (Object.prototype.hasOwnProperty.call(storeModuleProto, name)) return;
      Object.defineProperty(storeModuleProto, name, {
        value: fn,
        writable: true,
        configurable: true,
      });
    };

    define(`${accessorKey}Changed`, function (this) {
      if (!this.attributeChanged(storeAttribute)) return false;
      const [prevStore, newStore] = this.changes[storeAttribute] ?? [undefined, undefined];
      return dig(prevStore, key) !== dig(newStore, key);
    });
    define(`${accessorKey}Change`, function (this) {
      if (!this.attributeChanged(storeAttribute)) return null;
      const [prevStore, newStore] = this.changes[storeAttribute] ?? [undefined, undefined];
      return [dig(prevStore, key) ?? null, dig(newStore, key) ?? null];
    });
    define(`${accessorKey}Was`, function (this) {
      if (!this.attributeChanged(storeAttribute)) return null;
      const [prevStore] = this.changes[storeAttribute] ?? [undefined];
      return dig(prevStore, key) ?? null;
    });
    // Matches `Base`'s `savedChangeToAttribute(name)` predicate shape; the value
    // form is exposed as `savedChangeTo<X>Values()`.
    define(`savedChangeTo${cap}`, function (this) {
      if (!this.savedChangeToAttribute?.(storeAttribute)) return false;
      const [prevStore, newStore] = this.savedChanges?.[storeAttribute] ?? [undefined, undefined];
      return dig(prevStore, key) !== dig(newStore, key);
    });
    define(`savedChangeTo${cap}Values`, function (this) {
      if (!this.savedChangeToAttribute?.(storeAttribute)) return null;
      const [prevStore, newStore] = this.savedChanges?.[storeAttribute] ?? [undefined, undefined];
      return [dig(prevStore, key) ?? null, dig(newStore, key) ?? null];
    });
    define(`${accessorKey}BeforeLastSave`, function (this) {
      if (!this.savedChangeToAttribute?.(storeAttribute)) return null;
      const [prevStore] = this.savedChanges?.[storeAttribute] ?? [undefined];
      return dig(prevStore, key) ?? null;
    });
  }

  // assign new store attribute and create new hash to ensure that each class in the hierarchy
  // has its own hash of stored attributes.
  let localStored = localStoredAttributes(modelClass);
  if (!localStored) {
    localStored = {};
    _storedAttributes.set(modelClass, localStored);
  }
  localStored[storeAttribute] ??= [];
  localStored[storeAttribute] = [...new Set([...localStored[storeAttribute], ...keys])];
}

interface StoreDirtyHost {
  attributeChanged(name: string): boolean;
  savedChangeToAttribute(name: string): boolean;
  changes: Record<string, [unknown, unknown]>;
  savedChanges: Record<string, [unknown, unknown]>;
}

function dig(obj: unknown, key: string): unknown {
  if (obj == null) return undefined;
  if (obj instanceof HashWithIndifferentAccess) {
    return (obj.toHash() as Record<string, unknown>)[key];
  }
  if (typeof obj === "object") return (obj as Record<string, unknown>)[key];
  return undefined;
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
 *
 * @missingRailsArgs serialize — CONVERGEABLE: store.rb:108 passes the coder
 * inline as `coder: IndifferentCoder.new(store_attribute, coder)`. trails has to
 * hoist it into a local because the same instance is also handed to the
 * trails-only `_storeCoders` registry (see `setStoreCoder`), which exists only
 * because the read path resolves the coder separately from the attribute type.
 * Converges once that registry goes away.
 */
export function store(
  modelClass: typeof Base,
  storeAttribute: string,
  options: StoreOptions,
): void {
  // Mirror Rails three-step: build_column_serializer → IndifferentCoder → serialize
  const coder = buildColumnSerializer(storeAttribute, options.coder, Object, options.yaml);
  // Validate: if a coder was resolved, it must implement dump/load. Strings, numbers,
  // and arbitrary objects without these methods would crash silently later.
  if (
    coder != null &&
    (typeof (coder as any).dump !== "function" || typeof (coder as any).load !== "function")
  ) {
    throw new ConfigurationError(
      `store coder for '${storeAttribute}' must implement dump() and load(), ` +
        `but got ${typeof coder}.`,
    );
  }
  const indifferentCoder = new IndifferentCoder(storeAttribute, coder as CoderLike | null);
  setStoreCoder(modelClass, storeAttribute, indifferentCoder);
  // Structured column types (json/jsonb/hstore) have a type-level accessor and
  // handle their own cast/serialize. Only patch readAttribute for plain text/string
  // columns that have no type-level accessor.
  const colType = (modelClass as any).typeForAttribute?.(storeAttribute);
  if (!colType || typeof colType.accessor !== "function") {
    if (!serialize) {
      throw new ConfigurationError(
        `store() requires serialize() to be registered before use. ` +
          `Ensure base.ts (or the activerecord index) is imported before calling store().`,
      );
    }
    serialize(modelClass, storeAttribute, { coder: indifferentCoder as any });
  }

  if (options.accessors !== undefined) {
    storeAccessor(modelClass, storeAttribute, {
      accessors: options.accessors,
      prefix: options.prefix,
      suffix: options.suffix,
    });
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
export function storeAccessorFor(this: Base, storeAttribute: string): typeof HashAccessor {
  const modelClass = this.constructor as typeof Base;
  // Rails dispatches via type_for_attribute(attr).accessor — check the type first.
  const type = (modelClass as any).typeForAttribute?.(storeAttribute);
  if (type && typeof type.accessor === "function") {
    const accessor = type.accessor();
    if (accessor && typeof accessor.read === "function" && typeof accessor.write === "function") {
      return accessor as typeof HashAccessor;
    }
  }
  // Check IndifferentCoder registered by store() (covers both standalone and Base.store()) — returns IndifferentHashAccessor.
  const coder = getStoreCoder(modelClass, storeAttribute);
  if (coder) return coder.accessor();
  throw new ConfigurationError(
    `the column '${storeAttribute}' has not been configured as a store. ` +
      `Please make sure the column is declared serializable via 'ActiveRecord.store' or, ` +
      `if your database supports it, use a structured column type like hstore or json.`,
  );
}

/**
 * Reads a single key from a store attribute.
 *
 * Mirrors: ActiveRecord::Store#read_store_attribute (private)
 */
export function readStoreAttribute(this: Base, storeAttribute: string, key: string): unknown {
  const accessor = this.storeAccessorFor(storeAttribute);
  return accessor.read(this, storeAttribute, key);
}

/**
 * Writes a single key to a store attribute.
 *
 * Mirrors: ActiveRecord::Store#write_store_attribute (private)
 */
export function writeStoreAttribute(
  this: Base,
  storeAttribute: string,
  key: string,
  value: unknown,
): void {
  const accessor = this.storeAccessorFor(storeAttribute);
  accessor.write(this, storeAttribute, key, value);
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
    return withIndifferentAccess(obj as Record<string, unknown>);
  }
  return new HashWithIndifferentAccess();
}

/**
 * Returns (creating if needed) the store-accessor module for a model class.
 *
 * Mirrors: ActiveRecord::Store::ClassMethods#_store_accessors_module
 *
 * @internal
 */
export const _storeAccessorsModule = storeAccessorsModule;
