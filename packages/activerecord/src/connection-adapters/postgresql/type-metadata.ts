import { rbHash } from "@blazetrails/ruby-compat";
import { SqlTypeMetadata, type SqlTypeMetadataJSON } from "../sql-type-metadata.js";
import { _setPostgreSQLTypeMetadata } from "../type-metadata-slots.js";

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

  override hash(): number {
    return rbHash(TypeMetadata) ^ rbHash(super.hash()) ^ rbHash(this.oid) ^ rbHash(this.fmod);
  }
}

_setPostgreSQLTypeMetadata(TypeMetadata);
