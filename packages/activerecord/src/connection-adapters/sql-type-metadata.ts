import { deduplicate } from "./deduplicable.js";
import { rbHash } from "@blazetrails/ruby-compat";
import type { Deduplicable } from "./deduplicable.js";
import type { TypeMetadataJSON as MySQLTypeMetadataJSON } from "./mysql/type-metadata.js";
import type { TypeMetadataJSON as PostgreSQLTypeMetadataJSON } from "./postgresql/type-metadata.js";
import { _MySQLTypeMetadata, _PostgreSQLTypeMetadata } from "./type-metadata-slots.js";

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
    this.sqlType = options.sqlType ?? null;
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

  hash(): number {
    return (
      rbHash(SqlTypeMetadata) ^
      rbHash(this.sqlType) ^
      rbHash(this.type) ^
      rbHash(this.limit) ^
      (rbHash(this.precision) >> 1) ^
      (rbHash(this.scale) >> 2)
    );
  }

  /** @noRailsEquivalent CONVERGEABLE type-metadata-serializes-without-to-json */
  toJSON(): SqlTypeMetadataJSON {
    return {
      sqlType: this.sqlType,
      type: this.type,
      limit: this.limit,
      precision: this.precision,
      scale: this.scale,
    };
  }

  /** @noRailsEquivalent CONVERGEABLE converge-adapter-schema-and-result-helper-surface-remainder */
  static fromJSON(data: SqlTypeMetadataJSON): SqlTypeMetadata {
    if (data.class === "MySQL::TypeMetadata") {
      const row = data as MySQLTypeMetadataJSON;
      return new _MySQLTypeMetadata!(row, { extra: row.extra });
    }
    if (data.class === "PostgreSQL::TypeMetadata") {
      const row = data as PostgreSQLTypeMetadataJSON;
      return new _PostgreSQLTypeMetadata!(row, { oid: row.oid, fmod: row.fmod });
    }
    return new SqlTypeMetadata({
      sqlType: data.sqlType,
      type: data.type,
      limit: data.limit,
      precision: data.precision,
      scale: data.scale,
    });
  }

  deduplicate(): this {
    return deduplicate(this);
  }

  /** @internal */
  deduplicated(): this {
    return Object.freeze(this);
  }
}

export interface SqlTypeMetadataJSON {
  class?: string;
  sqlType: string | null;
  type: string | undefined;
  limit: number | null;
  precision: number | null;
  scale: number | null;
}
