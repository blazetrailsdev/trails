/**
 * Primary key attribute methods.
 *
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey
 */
import { underscore } from "@blazetrails/activesupport";
import { dangerousAttributeMethods } from "../attribute-methods.js";
import type { DatabaseAdapter } from "../adapter.js";

interface PrimaryKeyRecord {
  id: unknown;
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
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
 * Check whether all primary key values are present.
 *
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#primary_key_values_present?
 */
export function isPrimaryKeyValuesPresent(this: PrimaryKeyRecord): boolean {
  const pk = (this.constructor as any).primaryKey;
  if (Array.isArray(pk)) {
    return pk.every((col: string) => {
      const v = this._readAttribute(col);
      return v !== null && v !== undefined;
    });
  }
  return this.id != null;
}

function readPkWith(record: PrimaryKeyRecord, method: string): unknown {
  const pk = (record.constructor as any).primaryKey;
  const fn = (record as any)[method];
  if (typeof fn === "function") {
    if (Array.isArray(pk)) return pk.map((k: string) => fn.call(record, k));
    return fn.call(record, pk);
  }
  if (Array.isArray(pk)) return pk.map((k: string) => record._readAttribute(k));
  return record._readAttribute(pk);
}

export function idBeforeTypeCast(this: PrimaryKeyRecord): unknown {
  return readPkWith(this, "readAttributeBeforeTypeCast");
}

export function idWas(this: PrimaryKeyRecord): unknown {
  return readPkWith(this, "attributeWas");
}

export function idInDatabase(this: PrimaryKeyRecord): unknown {
  return readPkWith(this, "attributeInDatabase");
}

export function idForDatabase(this: PrimaryKeyRecord): unknown {
  const pk = (this.constructor as any).primaryKey;
  const attrs = (this as any)._attributes;
  if (attrs?.getAttribute) {
    if (Array.isArray(pk)) {
      return pk.map((k: string) => {
        const attr = attrs.getAttribute(k);
        // valueForDatabase is a getter property, not a method
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

// ---------------------------------------------------------------------------
// Instance accessor methods
// ---------------------------------------------------------------------------

interface PrimaryKeyInstance {
  constructor: unknown;
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, value: unknown): void;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id
 * @internal
 */
export function getId(this: PrimaryKeyInstance): unknown {
  const ctor = this.constructor as any;
  const pk = ctor.primaryKey as string | string[];
  if (Array.isArray(pk)) return pk.map((col) => this._readAttribute(col));
  return this._readAttribute(pk);
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey#id=
 * @internal
 */
export function setId(this: PrimaryKeyInstance, value: unknown): void {
  const ctor = this.constructor as any;
  const pk = ctor.primaryKey as string | string[];
  if (Array.isArray(pk)) {
    if (!Array.isArray(value)) {
      throw new TypeError(
        `Expected an array for composite primary key [${pk.join(", ")}], got ${value === null ? "null" : typeof value}`,
      );
    }
    pk.forEach((col, i) => this._writeAttribute(col, (value as unknown[])[i]));
  } else {
    this._writeAttribute(pk, value);
  }
}

// ---------------------------------------------------------------------------
// Class methods
// ---------------------------------------------------------------------------

interface PrimaryKeyHost {
  primaryKey: string | string[];
  _primaryKey?: string | string[];
  name: string;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#primary_key
 * @internal
 */
export function getPrimaryKeyAttr(this: PrimaryKeyHost): string | string[] {
  return this._primaryKey ?? "id";
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#primary_key=
 * @internal
 */
export function setPrimaryKeyAttr(this: PrimaryKeyHost, key: string | string[]): void {
  this._primaryKey = key;
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods#composite_primary_key?
 * @internal
 */
export function isCompositePrimaryKey(this: PrimaryKeyHost): boolean {
  return Array.isArray(this._primaryKey ?? "id");
}

export function isInstanceMethodAlreadyImplemented(
  this: PrimaryKeyHost & { prototype: any },
  methodName: string,
): boolean {
  return methodName in this.prototype;
}

export function isDangerousAttributeMethod(_this: PrimaryKeyHost, name: string): boolean {
  return dangerousAttributeMethods().has(name);
}

/**
 * Rails: adapter_class.quote_column_name(primary_key)
 */
export function quotedPrimaryKey(this: PrimaryKeyHost & { adapter?: DatabaseAdapter }): string {
  const pk = this.primaryKey;
  const quoter = this.adapter;
  const fallback = (k: string) => `"${k.replace(/"/g, '""')}"`;
  if (Array.isArray(pk))
    return pk.map((k) => (quoter ? quoter.quoteColumnName(k) : fallback(k))).join(", ");
  return quoter ? quoter.quoteColumnName(pk as string) : fallback(pk as string);
}

export function resetPrimaryKey(this: PrimaryKeyHost): void {
  const parent = Object.getPrototypeOf(this);
  const parentPk =
    parent && typeof parent === "function"
      ? (parent as Partial<PrimaryKeyHost>).primaryKey
      : undefined;
  this._primaryKey = parentPk ?? "id";
}

/**
 * Rails: foreign_key(false) → "admin_userid", foreign_key → "admin_user_id".
 * Falls back to "id" when no prefix type is configured.
 */
export function getPrimaryKey(
  this: PrimaryKeyHost & { tableExists?(): Promise<boolean> },
  baseName?: string,
): string {
  if (baseName) {
    const prefixType = (this as any).primaryKeyPrefixType;
    if (prefixType === "table_name") {
      // foreign_key(false): underscore + "id" with no separator
      return underscore(baseName) + "id";
    }
    if (prefixType === "table_name_with_underscore") {
      // foreign_key: underscore + "_id"
      return underscore(baseName) + "_id";
    }
  }
  return "id";
}

// Mirrors: ActiveRecord::AttributeMethods::PrimaryKey::ClassMethods private#attribute_method?
/** @internal */
function attributeMethod(this: any, attrName: string): boolean {
  const pk = this.primaryKey;
  return Array.isArray(pk) ? pk.includes(attrName) : attrName === pk;
}
