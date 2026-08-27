import {
  SqlTypeMetadata,
  TYPE_METADATA_CLASSES,
  type SqlTypeMetadataJSON,
} from "../sql-type-metadata.js";

export interface TypeMetadataJSON extends SqlTypeMetadataJSON {
  oid: number | null;
  fmod: number | null;
}

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
