/**
 * Primary key attribute methods.
 *
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey
 */
import { foreignKey } from "@blazetrails/activesupport";
import {
  dangerousAttributeMethods,
  isInstanceMethodAlreadyImplemented as attributeMethodsIsInstanceMethodAlreadyImplemented,
} from "../attribute-methods.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { baseClass, isBaseClass } from "../inheritance.js";
import type { Base } from "../base.js";

/** @internal */
export interface PrimaryKeyRecord {
  id: unknown;
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
  _queryAttribute(name: string): boolean;
  attributeBeforeTypeCast(name: string): unknown;
  attributeWas(name: string): unknown;
  attributeInDatabase(name: string): unknown;
}

/**
 * Return an array of primary key values for this record, or null if unsaved.
 *
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#to_key
 */
export function toKey(this: PrimaryKeyRecord): unknown[] | null {
  const pk = this.id;
  if (pk == null) return null;
  const arr = Array.isArray(pk) ? pk : [pk];
  if (arr.some((v) => v == null)) return null;
  return arr;
}

/**
 * One primary key column's `value_for_database`. Ruby indexes the attribute set
 * and reads the value off it; `valueForDatabase` is a getter property here, and
 * an unreflected column has no attribute to read it from.
 */
function columnForDatabase(record: PrimaryKeyRecord, key: string): unknown {
  const attrs = (record as any)._attributes;
  if (attrs?.getAttribute) {
    const attr = attrs.getAttribute(key);
    if (attr != null && "valueForDatabase" in attr) return attr.valueForDatabase;
  }
  return record._readAttribute(key);
}

// ---------------------------------------------------------------------------
// Instance accessor methods
// ---------------------------------------------------------------------------

/** @internal */
export interface PrimaryKeyInstance {
  constructor: unknown;
  _queryAttribute(name: string): boolean;
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, value: unknown): void;
  writeAttribute(name: string, value: unknown): void;
}

function readId(this: PrimaryKeyInstance): unknown {
  const pk = primaryKeyOf(this) as string | string[] | null;
  // Rails: `_read_attribute(@primary_key)`. A nil primary key reads through the
  // AttributeSet's Null attribute, returning nil without raising.
  return this._readAttribute(pk as string);
}

function writeId(this: PrimaryKeyInstance, value: unknown): void {
  const pk = primaryKeyOf(this) as string | string[] | null;
  if (pk == null) {
    // Key-less model: Rails does NOT install the PrimaryKey `id=` override
    // without a primary key (`instance_method_already_implemented?` gates the
    // ID_ATTRIBUTE_METHODS on `primary_key`), so `id=` is the regular writer for
    // the literal `id` column. Mirror that by writing `id`: a model with an `id`
    // column (`non_primary_keys`) gets the value, and one without (`dashboards`)
    // raises MissingAttributeError like Rails. Route through the public
    // `writeAttribute` (not the bridged `_writeAttribute`, which seeds an
    // unreflected column and would swallow the dashboards raise).
    this.writeAttribute("id", value);
  } else {
    this._writeAttribute(pk as string, value);
  }
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey
 */
export class PrimaryKey {
  /** Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id (primary_key.rb:18-20). */
  get id(): unknown {
    return readId.call(this as unknown as PrimaryKeyInstance);
  }

  /**
   * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#primary_key_values_present?
   * (primary_key.rb:22-24) — `!!id`.
   */
  isPrimaryKeyValuesPresent(): boolean {
    return (this as unknown as PrimaryKeyRecord).id != null;
  }

  /** Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id= (primary_key.rb:28-30). */
  set id(value: unknown) {
    writeId.call(this as unknown as PrimaryKeyInstance, value);
  }

  /**
   * Queries the primary key column's value. If the primary key is composite,
   * all primary key column values must be queryable.
   *
   * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id? (primary_key.rb:34-36).
   * A zero-arg Ruby reader, so an accessor property here — see CLAUDE.md,
   * "Generated attribute readers are properties".
   */
  get isId(): boolean {
    const record = this as unknown as PrimaryKeyRecord;
    return record._queryAttribute(primaryKeyOf(record) as string);
  }

  /**
   * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id_before_type_cast
   * (primary_key.rb:39-41). A zero-arg Ruby reader, so an accessor property
   * here — see CLAUDE.md, "Generated attribute readers are properties".
   */
  get idBeforeTypeCast(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return record.attributeBeforeTypeCast(primaryKeyOf(record) as string);
  }

  /** Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id_was (primary_key.rb:44-46). */
  get idWas(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return record.attributeWas(primaryKeyOf(record) as string);
  }

  /** Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id_in_database (primary_key.rb:49-51). */
  get idInDatabase(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return record.attributeInDatabase(primaryKeyOf(record) as string);
  }

  /** Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id_for_database (primary_key.rb:54-56). */
  get idForDatabase(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return columnForDatabase(record, primaryKeyOf(record) as string);
  }
}

/** Ruby's `@primary_key`, seeded from the class at `init_internals` (core.rb:846). */
function primaryKeyOf(record: object): string | string[] {
  return (record as { _primaryKey: string | string[] })._primaryKey;
}

// ---------------------------------------------------------------------------
// Class methods
// ---------------------------------------------------------------------------

interface CachedSchemaSource {
  internalSchemaCache?: {
    getCachedPrimaryKeys?(table: string): string | string[] | null | undefined;
  };
}

interface PrimaryKeyHost {
  primaryKey: string | string[];
  _primaryKey?: string | string[];
  name: string;
  tableName?: string;
  _adapter?: CachedSchemaSource | null;
  connectionPool?(): {
    activeConnection?: CachedSchemaSource | null;
    poolConfig?: { schemaCache?: CachedSchemaSource["internalSchemaCache"] | null };
  };
}

/**
 * Resolve the cached schema WITHOUT leasing a connection. Reading
 * `this.connection` would route through the deprecated getter and flip the
 * pool's lease to permanent under `permanent_connection_checkout =
 * :deprecated | :disallowed` — so model construction (which reads `primary_key`)
 * would permanently hold a connection. Mirrors Rails' `get_primary_key`, which
 * consults the schema cache rather than checking out a connection.
 */
function cachedSchemaCacheFor(
  host: PrimaryKeyHost,
): CachedSchemaSource["internalSchemaCache"] | undefined {
  if (host._adapter?.internalSchemaCache) return host._adapter.internalSchemaCache;
  const pool = host.connectionPool?.();
  return pool?.activeConnection?.internalSchemaCache ?? pool?.poolConfig?.schemaCache ?? undefined;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#primary_key
 *
 * Honors an explicitly-configured primary key — read through the prototype
 * chain, so an STI subclass inherits the value its base set with `primary_key=`
 * (Rails copies base_class.primary_key into the subclass; the chain is the
 * equivalent here). When nothing is configured anywhere up the chain, mirror
 * Rails' get_primary_key: consult the schema cache so a key-less data source
 * (e.g. a view) resolves to `null` rather than the "id" convention. The lookup
 * is query-free — it reads only what `loadSchema` already warmed — so a cold
 * cache falls back to "id". The `null` it can return matches Rails'
 * dynamically-nil `primary_key` for a key-less data source (a view); this is
 * the one accessor that surfaces that case honestly. The public boundaries
 * (`Base.primaryKey`, the `primaryKey()` class method) and the model-typed
 * `PrimaryKeyHost` deliberately narrow to the non-null `string | string[]`
 * contract — never null for a persistable model — so hot paths that read
 * `primary_key` are not forced to null-guard. That narrowing is the accepted
 * deviation; this function is where the truth lives.
 * Rails' `primary_key` runs `reset_primary_key` on first read
 * (primary_key.rb:78-81) and latches the answer into `@primary_key`. trails
 * resolves through `get_primary_key` on EVERY read instead, because
 * `table_exists?` is async here: a read taken before the schema cache is warm
 * would otherwise cache the "id" convention forever.
 * @internal
 */
export function getPrimaryKeyAttr(this: PrimaryKeyHost): string | string[] | null {
  const configured = this._primaryKey;
  if (configured !== undefined) return configured;
  return getPrimaryKey.call(this, baseClass.call(this as unknown as typeof Base).name);
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#primary_key=
 *
 * `Base` already exposes the Rails-named `static set primaryKey` accessor
 * (base.ts:1157) that delegates here, so this export is redundant public
 * surface; unexporting it is RFC 0081 shape-1 work, not a seam.
 * @internal
 */
export function setPrimaryKeyAttr(this: PrimaryKeyHost, key: string | string[]): void {
  this._primaryKey = key;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#composite_primary_key?
 *
 * Rails resolves this through the same path as `primary_key` (both trigger
 * `reset_primary_key` on first access), so go through `getPrimaryKeyAttr` rather
 * than reading `_primaryKey` directly — otherwise, now that Base carries no
 * "id" field default, a chain with no configured pk would skip the schema cache
 * and the two methods could disagree.
 * @internal
 */
export function isCompositePrimaryKey(this: PrimaryKeyHost): boolean {
  return Array.isArray(getPrimaryKeyAttr.call(this));
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#primary_key,
 * primary_key=
 */
export function primaryKey(this: PrimaryKeyHost, value?: string | string[]): string | string[] {
  if (value !== undefined) {
    setPrimaryKeyAttr.call(this, value);
    return value;
  }
  // Same type-level assertion as Base.primaryKey (not a runtime guarantee):
  // getPrimaryKeyAttr is the one honest nullable accessor, but public callers
  // see the non-null contract. A view still returns null at runtime.
  return getPrimaryKeyAttr.call(this) as string | string[];
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id, id=
 */
export function id(this: PrimaryKeyInstance, value?: unknown): unknown {
  if (value !== undefined) {
    writeId.call(this, value);
    return value;
  }
  return readId.call(this);
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods::ID_ATTRIBUTE_METHODS
 * (primary_key.rb:66). The Ruby names are translated by
 * docs/ruby-ts-conventions.md, except `id=` and `id?`, which are the names
 * `define_attribute_method_pattern` builds from the `"="` and `"?"` suffix
 * patterns and so are what the guard is asked about.
 */
const ID_ATTRIBUTE_METHODS = new Set([
  "id",
  "id=",
  "id?",
  "idBeforeTypeCast",
  "idWas",
  "idInDatabase",
  "idForDatabase",
]);

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#instance_method_already_implemented?
 * (primary_key.rb:69-71) — `super || primary_key && ID_ATTRIBUTE_METHODS.include?(method_name)`.
 * `PrimaryKey` is included after `AttributeMethods`, so this override runs
 * first and `super` is the one in attribute-methods.ts.
 */
export function isInstanceMethodAlreadyImplemented(
  this: PrimaryKeyHost & { prototype: any },
  methodName: string,
): boolean {
  return (
    attributeMethodsIsInstanceMethodAlreadyImplemented.call(this as any, methodName) ||
    (primaryKey.call(this) != null && ID_ATTRIBUTE_METHODS.has(methodName))
  );
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#dangerous_attribute_method?
 * (primary_key.rb:74-76) — `super && !ID_ATTRIBUTE_METHODS.include?(method_name)`,
 * which is what keeps the `super` above from raising for the id methods Active
 * Record itself defines.
 */
export function isDangerousAttributeMethod(this: PrimaryKeyHost, name: string): boolean {
  return dangerousAttributeMethods().has(name) && !ID_ATTRIBUTE_METHODS.has(name);
}

/**
 * Rails: adapter_class.quote_column_name(primary_key)
 */
export function quotedPrimaryKey(this: PrimaryKeyHost & { connection?: DatabaseAdapter }): string {
  const primaryKey = this.primaryKey;
  const quoter = this.connection;
  const fallback = (k: string) => `"${k.replace(/"/g, '""')}"`;
  if (Array.isArray(primaryKey))
    return primaryKey.map((k) => (quoter ? quoter.quoteColumnName(k) : fallback(k))).join(", ");
  return quoter ? quoter.quoteColumnName(primaryKey) : fallback(primaryKey);
}

/** Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#reset_primary_key (primary_key.rb:92-98) */
export function resetPrimaryKey(this: PrimaryKeyHost): void {
  if (isBaseClass(this as unknown as typeof Base)) {
    setPrimaryKeyAttr.call(
      this,
      getPrimaryKey.call(this, baseClass.call(this as unknown as typeof Base).name) as
        | string
        | string[],
    );
  } else {
    setPrimaryKeyAttr.call(this, baseClass.call(this as unknown as typeof Base).primaryKey);
  }
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#get_primary_key
 * (primary_key.rb:101-108).
 *
 * The `ActiveRecord::Base != self && table_exists?` arm reads the already-warmed
 * schema cache through `cachedSchemaCacheFor` (below), which resolves it without
 * leasing a connection; a cold cache falls through to the "id" convention.
 * `ActiveRecord::Base != self` is carried by the `tableName` guard — `Base`
 * itself has none.
 */
export function getPrimaryKey(
  this: PrimaryKeyHost & { primaryKeyPrefixType?: string | null },
  baseName?: string | null,
): string | string[] | null {
  if (baseName != null && this.primaryKeyPrefixType === "table_name") {
    return foreignKey(baseName, false);
  } else if (baseName != null && this.primaryKeyPrefixType === "table_name_with_underscore") {
    return foreignKey(baseName);
  }
  try {
    const tableName = this.tableName;
    if (tableName != null) {
      const primaryKeys = cachedSchemaCacheFor(this)?.getCachedPrimaryKeys?.(tableName);
      if (primaryKeys !== undefined) return primaryKeys;
    }
  } catch {
    // No connection/schema configured — fall through to the convention.
  }
  return "id";
}

// Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods private#attribute_method?
/** @internal */
function attributeMethod(this: any, attrName: string): boolean {
  const pk = this.primaryKey;
  return Array.isArray(pk) ? pk.includes(attrName) : attrName === pk;
}
