import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { foreignKey, include, kernelArray } from "@blazetrails/activesupport";
import { rtest } from "@blazetrails/ruby-compat";
import {
  dangerousAttributeMethods,
  isInstanceMethodAlreadyImplemented as attributeMethodsIsInstanceMethodAlreadyImplemented,
} from "../attribute-methods.js";
import { baseClass, isBaseClass } from "../inheritance.js";
import type { Base } from "../base.js";
import { ActiveRecord, AttributeMethods } from "../namespaces.js";

/** @internal */
export interface PrimaryKeyRecord {
  _attributes?: { getAttribute?(name: string): object | null };
  id: unknown;
  _primaryKey: string | string[];
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
  _queryAttribute(name: string): boolean;
  attributeBeforeTypeCast(name: string): unknown;
  attributeWas(name: string): unknown;
  attributeInDatabase(name: string): unknown;
}

export function toKey(this: PrimaryKeyRecord): unknown[] | null {
  const key = this.id;
  return rtest(key) ? kernelArray(key) : null;
}

function columnForDatabase(record: PrimaryKeyRecord, key: string): unknown {
  const attrs = record._attributes;
  if (attrs?.getAttribute) {
    const attr = attrs.getAttribute(key);
    if (attr != null && "valueForDatabase" in attr) return attr.valueForDatabase;
  }
  return record._readAttribute(key);
}

/** @internal */
export interface PrimaryKeyInstance {
  constructor: unknown;
  _primaryKey: string | string[] | null;
  _queryAttribute(name: string): boolean;
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, value: unknown): void;
  writeAttribute(name: string, value: unknown): void;
}

function readId(this: PrimaryKeyInstance): unknown {
  const pk = this._primaryKey;
  return this._readAttribute(pk as string);
}

function writeId(this: PrimaryKeyInstance, value: unknown): void {
  const pk = this._primaryKey;
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
    return record._queryAttribute(record._primaryKey as string);
  }

  /** @missingRailsName primaryKey — PERMANENT */
  get idBeforeTypeCast(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return record.attributeBeforeTypeCast(record._primaryKey as string);
  }

  /** @missingRailsName primaryKey — PERMANENT */
  get idWas(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return record.attributeWas(record._primaryKey as string);
  }

  /** @missingRailsName primaryKey — PERMANENT */
  get idInDatabase(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return record.attributeInDatabase(record._primaryKey as string);
  }

  get idForDatabase(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    return columnForDatabase(record, record._primaryKey as string);
  }
}

interface CachedSchemaSource {
  getCachedPrimaryKeys?(table: string | null | undefined): string | string[] | null | undefined;
}

interface PrimaryKeyHost {
  primaryKey: string | string[];
  _primaryKey?: string | string[] | null;
  _compositePrimaryKey: boolean;
  _attributesBuilder?: unknown;
  name: string;
  tableName?: string | null;
  connectionPool?(): { schemaCache?: CachedSchemaSource | null };
}

function cachedSchemaCacheFor(host: PrimaryKeyHost): CachedSchemaSource | undefined {
  return host.connectionPool?.().schemaCache ?? undefined;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE activerecord-converge-schema-load-and-primary-key-convergeable-receipts
 */
export function getPrimaryKeyAttr(this: PrimaryKeyHost & typeof Base): string | string[] | null {
  if (Object.hasOwn(this, "_primaryKey")) {
    return this._primaryKey as string | string[] | null;
  }
  if (isPrimaryKeyReflected(this)) {
    resetPrimaryKey.call(this);
    return this._primaryKey as string | string[] | null;
  }
  if (isBaseClass(this)) {
    return getPrimaryKey.call(this, baseClass.call(this).name);
  }
  return baseClass.call(this).primaryKey;
}

function isPrimaryKeyReflected(host: PrimaryKeyHost & typeof Base): boolean {
  const base = baseClass.call(host);
  if (base.primaryKeyPrefixType != null) return true;
  try {
    const tableName = base.tableName;
    return (
      tableName != null &&
      cachedSchemaCacheFor(base)?.getCachedPrimaryKeys?.(tableName) !== undefined
    );
  } catch {
    return false;
  }
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE activerecord-converge-schema-load-and-primary-key-convergeable-receipts
 */
export function setPrimaryKeyAttr(this: PrimaryKeyHost, value: string | string[] | null): void {
  if (Array.isArray(value)) {
    include(this, AttributeMethods.CompositePrimaryKey);
    this._primaryKey = Object.freeze(value.map((v) => String(v))) as string[];
  } else if (value != null) {
    this._primaryKey = String(value);
  } else {
    this._primaryKey = null;
  }

  this._compositePrimaryKey = Array.isArray(value);
  this._attributesBuilder = undefined;
}

/**
 * @inventedArm isPrimaryKeyReflected — PERMANENT
 * @inventedArm isArray — PERMANENT
 */
export function isCompositePrimaryKey(this: PrimaryKeyHost & typeof Base): boolean {
  if (!Object.hasOwn(this, "_primaryKey")) {
    if (!isPrimaryKeyReflected(this)) return Array.isArray(getPrimaryKeyAttr.call(this));
    resetPrimaryKey.call(this);
  }
  return this._compositePrimaryKey;
}

export function primaryKey(
  this: PrimaryKeyHost & typeof Base,
  value?: string | string[],
): string | string[] {
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
  this: PrimaryKeyHost &
    typeof Base &
    ThisParameterType<typeof attributeMethodsIsInstanceMethodAlreadyImplemented>,
  methodName: string,
): boolean {
  return (
    attributeMethodsIsInstanceMethodAlreadyImplemented.call(this, methodName) ||
    (primaryKey.call(this) != null && ID_ATTRIBUTE_METHODS.has(methodName))
  );
}

export function isDangerousAttributeMethod(this: PrimaryKeyHost, methodName: string): boolean {
  return dangerousAttributeMethods().has(methodName) && !ID_ATTRIBUTE_METHODS.has(methodName);
}

export function quotedPrimaryKey(
  this: PrimaryKeyHost & { adapterClass(): typeof AbstractAdapter },
): string {
  return this.adapterClass().quoteColumnName(this.primaryKey);
}

export function resetPrimaryKey(this: PrimaryKeyHost & typeof Base): void {
  if (isBaseClass(this)) {
    setPrimaryKeyAttr.call(
      this,
      getPrimaryKey.call(this, baseClass.call(this).name) as string | string[],
    );
  } else {
    setPrimaryKeyAttr.call(this, baseClass.call(this).primaryKey);
  }
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#get_primary_key
 * (primary_key.rb:101-108).
 *
 * The `ActiveRecord::Base != self && table_exists?` arm reads the already-warmed
 * schema cache through `cachedSchemaCacheFor` (below), which resolves it without
 * leasing a connection; a cold cache falls through to the "id" convention.
 * The cache peek answering `undefined` is the `table_exists?` test, and the
 * second read is `schema_cache.primary_keys(table_name)`.
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
  } else if (
    ActiveRecord.Base !== this &&
    cachedSchemaCacheFor(this)?.getCachedPrimaryKeys?.(this.tableName) !== undefined
  ) {
    return cachedSchemaCacheFor(this)?.getCachedPrimaryKeys?.(this.tableName) as
      | string
      | string[]
      | null;
  } else {
    return "id";
  }
}

/** @internal */
function attributeMethod(
  this: { primaryKey: string | string[] | null },
  attrName: string,
): boolean {
  const pk = this.primaryKey;
  return Array.isArray(pk) ? pk.includes(attrName) : attrName === pk;
}

AttributeMethods.PrimaryKey = PrimaryKey;
