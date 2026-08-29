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
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function getPrimaryKeyAttr(this: PrimaryKeyHost): string | string[] | null {
  const configured = this._primaryKey;
  if (configured !== undefined) return configured;
  return getPrimaryKey.call(this, baseClass.call(this as unknown as typeof Base).name);
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
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

export function isDangerousAttributeMethod(this: PrimaryKeyHost, name: string): boolean {
  return dangerousAttributeMethods().has(name) && !ID_ATTRIBUTE_METHODS.has(name);
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
 * @missingRailsCall table_exists? — CONVERGEABLE
 * @missingRailsCall primary_keys — CONVERGEABLE
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
