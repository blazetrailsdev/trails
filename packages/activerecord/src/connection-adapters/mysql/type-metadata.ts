import {
  SqlTypeMetadata,
  TYPE_METADATA_CLASSES,
  type SqlTypeMetadataJSON,
} from "../sql-type-metadata.js";

export interface TypeMetadataJSON extends SqlTypeMetadataJSON {
  extra: string | null;
}

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
    super(typeMetadata);
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
