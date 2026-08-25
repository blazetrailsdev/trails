/**
 * SQL type metadata — describes the SQL type of a column.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SqlTypeMetadata
 */

import { deduplicate } from "./deduplicable.js";
import type { Deduplicable } from "./deduplicable.js";

export class SqlTypeMetadata implements Deduplicable {
  readonly sqlType: string | null;
  readonly type: string | undefined;
  readonly limit: number | null;
  readonly precision: number | null;
  readonly scale: number | null;

  constructor(
    options: {
      sqlType?: string | null;
      type?: string;
      limit?: number | null;
      precision?: number | null;
      scale?: number | null;
    } = {},
  ) {
    // Rails: `@sql_type = sql_type` (sql_type_metadata.rb:12) — nil stays nil.
    // `fetch_type_metadata(nil)` (test/support/fake_adapter.rb:23) is a real
    // producer, so neither the type name nor "" may stand in for it.
    this.sqlType = options.sqlType ?? null;
    // Rails' SqlTypeMetadata#type is just `@type` — nil for an unmapped
    // sql_type (Value#type is nil). Keep it nil-faithful rather than falling
    // back to the sql_type name, so `Column#type` mirrors Rails' `delegate
    // :type, allow_nil: true`.
    this.type = options.type ?? undefined;
    this.limit = options.limit ?? null;
    this.precision = options.precision ?? null;
    this.scale = options.scale ?? null;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof SqlTypeMetadata &&
      this.sqlType === other.sqlType &&
      this.type === other.type &&
      this.limit === other.limit &&
      this.precision === other.precision &&
      this.scale === other.scale
    );
  }

  // Keyed off the serialized form, so a subclass' own state (PG's oid/fmod,
  // MySQL's extra) is part of the key without an override — Rails gets the
  // same from Deduplicable's `hash`/`eql?` reaching through `__getobj__`
  // (postgresql/type_metadata.rb:24-31, mysql/type_metadata.rb:23-30).
  deduplicateKey(): string {
    return JSON.stringify(this.toJSON());
  }

  toJSON(): SqlTypeMetadataJSON {
    return {
      sqlType: this.sqlType,
      type: this.type,
      limit: this.limit,
      precision: this.precision,
      scale: this.scale,
    };
  }

  /**
   * Psych's restore step for the `sql_type_metadata` payload
   * `Column#encodeWith` writes: allocate the class the document names, then
   * fill it. Rails gets the class from YAML's `!ruby/object:` tag — an adapter
   * `TypeMetadata` is a `DelegateClass(SqlTypeMetadata)` tagged with its own
   * class, so `PostgreSQL::TypeMetadata` round-trips with its own ivars
   * (postgresql/type_metadata.rb:7, mysql/type_metadata.rb:6). JSON carries no
   * tag, so {@link TYPE_METADATA_CLASSES} dispatches on the `class` key, the
   * same way `rehydrateColumn` (schema-cache.ts) dispatches the Column tag.
   */
  static fromJSON(data: SqlTypeMetadataJSON): SqlTypeMetadata {
    const klass = TYPE_METADATA_CLASSES[data.class ?? ""];
    if (klass) return klass.fromJSON(data);
    return new SqlTypeMetadata({
      sqlType: data.sqlType,
      type: data.type,
      limit: data.limit,
      precision: data.precision,
      scale: data.scale,
    });
  }

  toString(): string {
    return this.sqlType ?? "";
  }

  deduplicate(): this {
    return deduplicate(this);
  }

  /** @internal */
  deduplicated(): this {
    return this;
  }
}

export interface SqlTypeMetadataJSON {
  /** JSON's stand-in for YAML's `!ruby/object:` tag. Absent on a base
   *  `SqlTypeMetadata`, whose class is the fallback. */
  class?: string;
  sqlType: string | null;
  type: string | undefined;
  limit: number | null;
  precision: number | null;
  scale: number | null;
}

/**
 * The `SqlTypeMetadata` subclasses a dump can name, keyed by the `class` tag
 * their `toJSON` writes. Each subclass module registers itself here, so this
 * module takes no import on them and the `extends` edge stays acyclic.
 *
 * @noRailsEquivalent PERMANENT: YAML tags an object with its class and Psych
 * looks it up; a JSON document carries no tag, so the tag is a key and its
 * resolution a table. Mirrors `COLUMN_CLASSES` in schema-cache.ts.
 */
export const TYPE_METADATA_CLASSES: Record<
  string,
  { fromJSON(data: SqlTypeMetadataJSON): SqlTypeMetadata }
> = {};
