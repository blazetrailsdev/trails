import { SqlTypeMetadata, type SqlTypeMetadataJSON } from "../sql-type-metadata.js";
import { _setMySQLTypeMetadata } from "../type-metadata-slots.js";

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

  /** @noRailsEquivalent CONVERGEABLE type-metadata-serializes-without-to-json */
  override toJSON(): TypeMetadataJSON {
    return { ...super.toJSON(), class: "MySQL::TypeMetadata", extra: this.extra };
  }
}

_setMySQLTypeMetadata(TypeMetadata);
