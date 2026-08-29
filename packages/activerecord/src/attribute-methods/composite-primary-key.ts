import { PrimaryKey, type PrimaryKeyInstance, type PrimaryKeyRecord } from "./primary-key.js";

function primaryKeyOf(record: object): string[] {
  return (record as { _primaryKey: string[] })._primaryKey;
}

function columnForDatabase(record: PrimaryKeyRecord, key: string): unknown {
  const attrs = (record as any)._attributes;
  if (attrs?.getAttribute) {
    const attr = attrs.getAttribute(key);
    if (attr != null && "valueForDatabase" in attr) return attr.valueForDatabase;
  }
  return record._readAttribute(key);
}

function inspectValue(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

export class CompositePrimaryKey extends PrimaryKey {
  override get id(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey)
      return primaryKeyOf(record).map((pk) => record._readAttribute(pk));
    return super.id;
  }

  override isPrimaryKeyValuesPresent(): boolean {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey)
      return (record.id as unknown[]).every((v) => v != null);
    return super.isPrimaryKeyValuesPresent();
  }

  override set id(value: unknown) {
    const record = this as unknown as PrimaryKeyInstance;
    if (!(record.constructor as any).compositePrimaryKey) {
      super.id = value;
      return;
    }
    const primaryKey = primaryKeyOf(record);
    if (!Array.isArray(value) && !(value instanceof Set)) {
      // eslint-disable-next-line blazetrails/rails-error-parity -- composite_primary_key.rb:27 raises the native TypeError
      throw new TypeError(
        `Expected value matching [${primaryKey.map((col) => JSON.stringify(col)).join(", ")}], got ${inspectValue(value)}.`,
      );
    }
    const values = Array.isArray(value) ? value : [...value];
    primaryKey.forEach((attr, i) =>
      record._writeAttribute(attr, i < values.length ? values[i] : null),
    );
  }

  override get isId(): boolean {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey)
      return primaryKeyOf(record).every((col) => record._queryAttribute(col));
    return super.isId;
  }

  override get idBeforeTypeCast(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey) {
      return primaryKeyOf(record).map((col) => record.attributeBeforeTypeCast(col));
    }
    return super.idBeforeTypeCast;
  }

  override get idWas(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey) {
      return primaryKeyOf(record).map((col) => record.attributeWas(col));
    }
    return super.idWas;
  }

  override get idInDatabase(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey) {
      return primaryKeyOf(record).map((col) => record.attributeInDatabase(col));
    }
    return super.idInDatabase;
  }

  override get idForDatabase(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey) {
      return primaryKeyOf(record).map((col) => columnForDatabase(record, col));
    }
    return super.idForDatabase;
  }
}
