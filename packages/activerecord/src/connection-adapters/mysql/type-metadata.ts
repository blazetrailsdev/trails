import { SqlTypeMetadata } from "../sql-type-metadata.js";

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
}
