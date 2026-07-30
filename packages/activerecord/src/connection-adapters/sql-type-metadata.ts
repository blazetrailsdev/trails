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

  /**
   * Mirrors: SqlTypeMetadata#== (sql_type_metadata.rb:19) — an `is_a?` guard
   * plus attribute-by-attribute value equality.
   *
   * Ruby aliases `eql?` to this and pairs it with `hash`
   * (sql_type_metadata.rb:27); both are in api-compare's `SKIP_GROUPS` (Ruby
   * value-protocol methods with no meaningful TS surface), and the `hash` role
   * — feeding `Deduplicable`'s identity map — is carried by `deduplicateKey`
   * below. So `equals` is the whole port.
   */
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

  deduplicateKey(): string {
    return JSON.stringify([this.sqlType, this.type, this.limit, this.precision, this.scale]);
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

  static fromJSON(data: SqlTypeMetadataJSON): SqlTypeMetadata {
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
  sqlType: string | null;
  type: string | undefined;
  limit: number | null;
  precision: number | null;
  scale: number | null;
}
