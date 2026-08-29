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

export function toKey(this: PrimaryKeyRecord): unknown[] | null {
  const pk = this.id;
  if (pk == null) return null;
  const arr = Array.isArray(pk) ? pk : [pk];
  if (arr.some((v) => v == null)) return null;
  return arr;
}

function columnForDatabase(record: PrimaryKeyRecord, key: string): unknown {
  const attrs = (record as any)._attributes;
  if (attrs?.getAttribute) {
    const attr = attrs.getAttribute(key);
    if (attr != null && "valueForDatabase" in attr) return attr.valueForDatabase;
  }
  return record._readAttribute(key);
}

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
  return this._readAttribute(pk as string);
}

function writeId(this: PrimaryKeyInstance, value: unknown): void {
  const pk = primaryKeyOf(this) as string | string[] | null;
  if (pk == null) {
    this.writeAttribute("id", value);
  } else {
    this._writeAttribute(pk as string, value);
  }
}

export class PrimaryKey {
  get id(): unknown {
    return readId.call(this as unknown as PrimaryKeyInstance);
  }

  isPrimaryKeyValuesPresent(): boolean {
    return (this as unknown as PrimaryKeyRecord).id != null;
  }

  set id(value: unknown) {
    writeId.call(this as unknown as PrimaryKeyInstance, value);
  }

  get isId(): boolean {
    const record = this as unknown as PrimaryKeyRecord;
    return record._queryAttribute(primaryKeyOf(record) as string);
  }

  get idBeforeTypeCast(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return record.attributeBeforeTypeCast(primaryKeyOf(record) as string);
  }

  get idWas(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return record.attributeWas(primaryKeyOf(record) as string);
  }

  get idInDatabase(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return record.attributeInDatabase(primaryKeyOf(record) as string);
  }

  get idForDatabase(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return columnForDatabase(record, primaryKeyOf(record) as string);
  }
}

function primaryKeyOf(record: object): string | string[] {
  return (record as { _primaryKey: string | string[] })._primaryKey;
}

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
 * @noRailsEquivalent CONVERGEABLE PrimaryKey::ClassMethods#primary_key (attribute_methods/primary_key.rb:80-81) as a this-typed function; Ruby's memoizes, ours re-resolves because table_exists? is async.
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
 * @noRailsEquivalent CONVERGEABLE PrimaryKey::ClassMethods#primary_key= (attribute_methods/primary_key.rb:130) as a this-typed function behind the Rails-named Base accessor.
 */
export function setPrimaryKeyAttr(this: PrimaryKeyHost, key: string | string[]): void {
  this._primaryKey = key;
}

export function isCompositePrimaryKey(this: PrimaryKeyHost): boolean {
  return Array.isArray(getPrimaryKeyAttr.call(this));
}

export function primaryKey(this: PrimaryKeyHost, value?: string | string[]): string | string[] {
  if (value !== undefined) {
    setPrimaryKeyAttr.call(this, value);
    return value;
  }
  return getPrimaryKeyAttr.call(this) as string | string[];
}

export function id(this: PrimaryKeyInstance, value?: unknown): unknown {
  if (value !== undefined) {
    writeId.call(this, value);
    return value;
  }
  return readId.call(this);
}

const ID_ATTRIBUTE_METHODS = new Set([
  "id",
  "id=",
  "id?",
  "idBeforeTypeCast",
  "idWas",
  "idInDatabase",
  "idForDatabase",
]);

export function isInstanceMethodAlreadyImplemented(
  this: PrimaryKeyHost & { prototype: any },
  methodName: string,
): boolean {
  return (
    attributeMethodsIsInstanceMethodAlreadyImplemented.call(this as any, methodName) ||
    (primaryKey.call(this) != null && ID_ATTRIBUTE_METHODS.has(methodName))
  );
}

export function isDangerousAttributeMethod(this: PrimaryKeyHost, methodName: string): boolean {
  return dangerousAttributeMethods().has(methodName) && !ID_ATTRIBUTE_METHODS.has(methodName);
}

export function quotedPrimaryKey(this: PrimaryKeyHost & { connection?: DatabaseAdapter }): string {
  const primaryKey = this.primaryKey;
  const quoter = this.connection;
  const fallback = (k: string) => `"${k.replace(/"/g, '""')}"`;
  if (Array.isArray(primaryKey))
    return primaryKey.map((k) => (quoter ? quoter.quoteColumnName(k) : fallback(k))).join(", ");
  return quoter ? quoter.quoteColumnName(primaryKey) : fallback(primaryKey);
}

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
 *
 * @missingRailsCall table_exists? — CONVERGEABLE: `tableExists` is async in
 *   trails, and its synchronous cache-only view (`cachedTableExists`) leases a
 *   connection to reach the cache — which `getPrimaryKey` must not do, because
 *   `getPrimaryKeyAttr` / `primaryKey` are read from synchronous paths
 *   (model construction). The guard is subsumed by the read below: a table
 *   absent from the schema cache has no cached primary keys either, so
 *   `getCachedPrimaryKeys` returns `undefined` and both arms fall through to
 *   the same "id" convention. Converges once RFC 0073 settles the lease shape
 *   and a synchronous `tableExists` cache read is expressible.
 * @missingRailsCall primary_keys — CONVERGEABLE: `schemaCache.primaryKeys`
 *   (primary_key.rb:104) is async in trails; `getCachedPrimaryKeys` is its
 *   lease-free, cache-only view, called here for the same reason — this body
 *   runs on synchronous paths. Same RFC 0073 dependency.
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
  } catch {}
  return "id";
}

/** @internal */
function attributeMethod(this: any, attrName: string): boolean {
  const pk = this.primaryKey;
  return Array.isArray(pk) ? pk.includes(attrName) : attrName === pk;
}
