/**
 * MySQL type metadata — extended SQL type metadata with MySQL-specific info.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::TypeMetadata
 *
 * Wraps the base SqlTypeMetadata with an `extra` field that captures
 * MySQL-specific column extras like "auto_increment", "on update CURRENT_TIMESTAMP",
 * "VIRTUAL GENERATED", etc.
 */

import {
  SqlTypeMetadata,
  TYPE_METADATA_CLASSES,
  type SqlTypeMetadataJSON,
} from "../sql-type-metadata.js";

/** The `class`-tagged payload `toJSON` writes, so `extra` survives the
 *  schema-cache round trip the way Ruby's YAML tag carries it. */
export interface TypeMetadataJSON extends SqlTypeMetadataJSON {
  extra: string | null;
}

/**
 * Rails' `DelegateClass(SqlTypeMetadata)` forwards every base reader to the
 * wrapped metadata; TypeScript's equivalent of that forwarding is inheritance,
 * so the wrapped object's state lives on `super` rather than in an
 * `__getobj__`.
 */
export class TypeMetadata extends SqlTypeMetadata {
  readonly extra: string | null;

  constructor(
    typeMetadata: {
      sqlType?: string | null;
      type?: string;
      limit?: number | null;
      precision?: number | null;
      scale?: number | null;
    },
    options: { extra?: string | null } = {},
  ) {
    // Rails' MySQL TypeMetadata delegates `type` to the wrapped
    // SqlTypeMetadata, which is nil for an unmapped sql_type — no sqlType
    // fallback. Keep it nil-faithful.
    super(typeMetadata);
    // `def initialize(type_metadata, extra: nil)` (mysql/type_metadata.rb:13-16) —
    // `nil` where none was given, not a `""` stand-in.
    this.extra = options.extra ?? null;
  }

  override equals(other: unknown): boolean {
    return other instanceof TypeMetadata && super.equals(other) && this.extra === other.extra;
  }

  override toJSON(): TypeMetadataJSON {
    return { ...super.toJSON(), class: "MySQL::TypeMetadata", extra: this.extra };
  }
}

TYPE_METADATA_CLASSES["MySQL::TypeMetadata"] = {
  fromJSON(data: SqlTypeMetadataJSON): TypeMetadata {
    const row = data as TypeMetadataJSON;
    return new TypeMetadata(row, { extra: row.extra });
  },
};
