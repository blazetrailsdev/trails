/**
 * Primary key attribute methods.
 *
 * Mirrors: ActiveRecord::AttributeMethods::PrimaryKey
 */

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
