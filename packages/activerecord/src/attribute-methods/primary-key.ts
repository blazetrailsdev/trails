/**
 * Primary key attribute methods.
 *
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey
 */
import { quoteIdentifier } from "../connection-adapters/abstract/quoting.js";
import { detectAdapterName } from "../adapter-name.js";
import { underscore } from "@blazetrails/activesupport";
import { dangerousAttributeMethods } from "../attribute-methods.js";

interface PrimaryKeyRecord {
  id: unknown;
  readAttribute(name: string): unknown;
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
      const v = this.readAttribute(col);
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
  if (Array.isArray(pk)) return pk.map((k: string) => record.readAttribute(k));
  return record.readAttribute(pk);
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
          : this.readAttribute(k);
      });
    }
    const attr = attrs.getAttribute(pk);
    if (attr != null && "valueForDatabase" in attr) return attr.valueForDatabase;
  }
  if (Array.isArray(pk)) return pk.map((k: string) => this.readAttribute(k));
  return this.readAttribute(pk);
}

// ---------------------------------------------------------------------------
// Class methods
// ---------------------------------------------------------------------------

interface PrimaryKeyHost {
  primaryKey: string | string[];
  _primaryKey?: string | string[];
  name: string;
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
export function quotedPrimaryKey(this: PrimaryKeyHost & { adapter?: any }): string {
  const pk = this.primaryKey;
  const adapter = this.adapter ? detectAdapterName(this.adapter) : undefined;
  if (Array.isArray(pk)) return pk.map((k) => quoteIdentifier(k, adapter)).join(", ");
  return quoteIdentifier(pk, adapter);
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
