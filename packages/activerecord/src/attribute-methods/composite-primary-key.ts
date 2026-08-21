/**
 * The composite arm of the primary key attribute methods: each reader asks
 * whether the model's primary key is composite, maps over its parts when it is,
 * and otherwise falls through to the scalar body in `PrimaryKey`.
 *
 * Mirrors: ActiveRecord::AttributeMethods::CompositePrimaryKey
 */
import { PrimaryKey, type PrimaryKeyInstance, type PrimaryKeyRecord } from "./primary-key.js";

/**
 * Ruby reads `self.class.composite_primary_key?` on each of these bodies;
 * trails ported that predicate as the class-level accessor
 * `Base.compositePrimaryKey`, read inline below exactly where Ruby calls it.
 *
 * Ruby's `@primary_key`, the ivar seeded from the class at `init_internals` —
 * read off the class the record was built from, in the order it declares.
 */
function primaryKeyOf(record: object): string[] {
  return (record.constructor as any).primaryKey as string[];
}

/**
 * One primary key column's `value_for_database` — Ruby's
 * `@attributes[col].value_for_database`. `valueForDatabase` is a getter
 * property here, and an unreflected column has no attribute to read it from.
 */
function columnForDatabase(record: PrimaryKeyRecord, key: string): unknown {
  const attrs = (record as any)._attributes;
  if (attrs?.getAttribute) {
    const attr = attrs.getAttribute(key);
    if (attr != null && "valueForDatabase" in attr) return attr.valueForDatabase;
  }
  return record._readAttribute(key);
}

/**
 * Ruby `Object#inspect`-style rendering for the `id=` TypeError message,
 * mirroring composite_primary_key.rb:27's `#{value.inspect}`.
 */
function inspectValue(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::CompositePrimaryKey
 *
 * Rails `include`s this module into a model the moment `primary_key=` is given
 * an Array (primary_key.rb:132), so it sits above `PrimaryKey` in the ancestry
 * and its `super` calls reach the scalar bodies. trails mixes it into `Base`
 * once, after `PrimaryKey` — the `composite_primary_key?` guard each body opens
 * with is what makes that the same behaviour for a scalar-keyed model.
 */
export class CompositePrimaryKey extends PrimaryKey {
  /** Mirrors: CompositePrimaryKey#id (composite_primary_key.rb:8-14). */
  override get id(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey)
      return primaryKeyOf(record).map((pk) => record._readAttribute(pk));
    return super.id;
  }

  /** Mirrors: CompositePrimaryKey#id= (composite_primary_key.rb:18-25). */
  override set id(value: unknown) {
    const record = this as unknown as PrimaryKeyInstance;
    if (!(record.constructor as any).compositePrimaryKey) {
      super.id = value;
      return;
    }
    // Rails: `raise TypeError unless value.is_a?(Enumerable)` then
    // `@primary_key.zip(value)`. Mirror Ruby's Enumerable with the codebase's
    // Array-or-Set analogue (see sanitization.ts `isEnumerable`) — deliberately
    // not arbitrary iterables, so a String is a scalar that raises like Ruby.
    const primaryKey = primaryKeyOf(record);
    if (!Array.isArray(value) && !(value instanceof Set)) {
      // eslint-disable-next-line blazetrails/rails-error-parity -- composite_primary_key.rb:27 raises the native TypeError
      throw new TypeError(
        `Expected value matching [${primaryKey.map((col) => JSON.stringify(col)).join(", ")}], got ${inspectValue(value)}.`,
      );
    }
    // Rails' `@primary_key.zip(value)` pads short values with nil, so
    // `id = [1]` writes nil to the trailing key part rather than leaving it
    // untouched. Coerce past-the-end elements to null (not undefined) to match.
    const values = Array.isArray(value) ? value : [...value];
    primaryKey.forEach((attr, i) =>
      record._writeAttribute(attr, i < values.length ? values[i] : null),
    );
  }

  /**
   * Mirrors: CompositePrimaryKey#primary_key_values_present?
   * (composite_primary_key.rb:16-22) — `id.all?`.
   */
  override isPrimaryKeyValuesPresent(): boolean {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey)
      return (record.id as unknown[]).every((v) => v != null);
    return super.isPrimaryKeyValuesPresent();
  }

  /** Mirrors: CompositePrimaryKey#id? (composite_primary_key.rb:36-42). */
  override get isId(): boolean {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey)
      return primaryKeyOf(record).every((col) => record._queryAttribute(col));
    return super.isId;
  }

  /** Mirrors: CompositePrimaryKey#id_before_type_cast (composite_primary_key.rb:46-52). */
  override get idBeforeTypeCast(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey) {
      return primaryKeyOf(record).map((col) => record.attributeBeforeTypeCast(col));
    }
    return super.idBeforeTypeCast;
  }

  /** Mirrors: CompositePrimaryKey#id_was (composite_primary_key.rb:56-62). */
  override get idWas(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey) {
      return primaryKeyOf(record).map((col) => record.attributeWas(col));
    }
    return super.idWas;
  }

  /** Mirrors: CompositePrimaryKey#id_in_database (composite_primary_key.rb:66-72). */
  override get idInDatabase(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey) {
      return primaryKeyOf(record).map((col) => record.attributeInDatabase(col));
    }
    return super.idInDatabase;
  }

  /** Mirrors: CompositePrimaryKey#id_for_database (composite_primary_key.rb:74-80). */
  override get idForDatabase(): unknown {
    const record = this as unknown as PrimaryKeyRecord;
    if ((record.constructor as any).compositePrimaryKey) {
      return primaryKeyOf(record).map((col) => columnForDatabase(record, col));
    }
    return super.idForDatabase;
  }
}
