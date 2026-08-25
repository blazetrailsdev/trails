/**
 * PostgreSQL type metadata — extended SQL type metadata with PostgreSQL-specific info.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::TypeMetadata
 */

import {
  SqlTypeMetadata,
  TYPE_METADATA_CLASSES,
  type SqlTypeMetadataJSON,
} from "../sql-type-metadata.js";

/** The `class`-tagged payload `toJSON` writes, so `oid` / `fmod` survive the
 *  schema-cache round trip the way Ruby's YAML tag carries them. */
export interface TypeMetadataJSON extends SqlTypeMetadataJSON {
  oid: number | null;
  fmod: number | null;
}

/**
 * Rails' `DelegateClass(SqlTypeMetadata)` forwards every base reader to the
 * wrapped metadata; TypeScript's equivalent of that forwarding is inheritance,
 * so the wrapped object's state lives on `super` rather than in an
 * `__getobj__`.
 */
export class TypeMetadata extends SqlTypeMetadata {
  readonly oid: number | null;
  readonly fmod: number | null;

  constructor(
    typeMetadata: {
      sqlType?: string | null;
      type?: string;
      limit?: number | null;
      precision?: number | null;
      scale?: number | null;
    },
    options: { oid?: number | null; fmod?: number | null } = {},
  ) {
    // Rails' PG TypeMetadata delegates `type` to the wrapped SqlTypeMetadata,
    // which is nil for an unmapped sql_type — no sqlType fallback. Keep it
    // nil-faithful so Column#type is null for e.g. composites.
    super(typeMetadata);
    this.oid = options.oid ?? null;
    this.fmod = options.fmod ?? null;
  }

  override equals(other: unknown): boolean {
    return (
      other instanceof TypeMetadata &&
      super.equals(other) &&
      this.oid === other.oid &&
      this.fmod === other.fmod
    );
  }

  override toJSON(): TypeMetadataJSON {
    return { ...super.toJSON(), class: "PostgreSQL::TypeMetadata", oid: this.oid, fmod: this.fmod };
  }
}

TYPE_METADATA_CLASSES["PostgreSQL::TypeMetadata"] = {
  fromJSON(data: SqlTypeMetadataJSON): TypeMetadata {
    const row = data as TypeMetadataJSON;
    return new TypeMetadata(row, { oid: row.oid, fmod: row.fmod });
  },
};
