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
