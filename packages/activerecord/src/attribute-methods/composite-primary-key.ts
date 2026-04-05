/**
 * Composite primary key attribute methods.
 *
 * Mirrors: ActiveRecord::AttributeMethods::CompositePrimaryKey
 */

interface CompositePKRecord {
  id: unknown;
  readAttribute(name: string): unknown;
  constructor: Function & { primaryKey: string | string[]; compositePrimaryKey: boolean };
}

/**
 * Check if all composite primary key values are present.
 *
 * Mirrors: ActiveRecord::AttributeMethods::CompositePrimaryKey#primary_key_values_present?
 */
export function isPrimaryKeyValuesPresent(record: CompositePKRecord): boolean {
  const ctor = record.constructor as any;
  if (!ctor.compositePrimaryKey) return record.id != null;
  const pk = ctor.primaryKey as string[];
  return pk.every((col: string) => {
    const v = record.readAttribute(col);
    return v !== null && v !== undefined;
  });
}

export function id(this: CompositePKRecord): unknown {
  const ctor = this.constructor as any;
  if (ctor.compositePrimaryKey) {
    return (ctor.primaryKey as string[]).map((col: string) => this.readAttribute(col));
  }
  return this.readAttribute(ctor.primaryKey);
}

export function isId(this: CompositePKRecord): boolean {
  const ctor = this.constructor as any;
  if (ctor.compositePrimaryKey) {
    return (ctor.primaryKey as string[]).every((col: string) => {
      const v = this.readAttribute(col);
      return v !== null && v !== undefined && v !== "" && v !== false;
    });
  }
  const v = this.readAttribute(ctor.primaryKey);
  return v !== null && v !== undefined && v !== "" && v !== false;
}

export function idBeforeTypeCast(this: CompositePKRecord): unknown {
  const ctor = this.constructor as any;
  const fn = (this as any).readAttributeBeforeTypeCast;
  const reader =
    typeof fn === "function"
      ? (col: string) => fn.call(this, col)
      : (col: string) => this.readAttribute(col);
  if (ctor.compositePrimaryKey) {
    return (ctor.primaryKey as string[]).map(reader);
  }
  return reader(ctor.primaryKey);
}

export function idWas(this: CompositePKRecord): unknown {
  const ctor = this.constructor as any;
  const fn = (this as any).attributeWas;
  const reader =
    typeof fn === "function"
      ? (col: string) => fn.call(this, col)
      : (col: string) => this.readAttribute(col);
  if (ctor.compositePrimaryKey) {
    return (ctor.primaryKey as string[]).map(reader);
  }
  return reader(ctor.primaryKey);
}

export function idInDatabase(this: CompositePKRecord): unknown {
  const ctor = this.constructor as any;
  const fn = (this as any).attributeInDatabase;
  const reader =
    typeof fn === "function"
      ? (col: string) => fn.call(this, col)
      : (col: string) => this.readAttribute(col);
  if (ctor.compositePrimaryKey) {
    return (ctor.primaryKey as string[]).map(reader);
  }
  return reader(ctor.primaryKey);
}

export function idForDatabase(this: CompositePKRecord): unknown {
  const ctor = this.constructor as any;
  const attrs = (this as any)._attributes;
  const readForDb = (col: string): unknown => {
    if (attrs?.getAttribute) {
      const attr = attrs.getAttribute(col);
      if (attr != null && "valueForDatabase" in attr) return attr.valueForDatabase;
    }
    return this.readAttribute(col);
  };
  if (ctor.compositePrimaryKey) {
    return (ctor.primaryKey as string[]).map(readForDb);
  }
  return readForDb(ctor.primaryKey);
}
