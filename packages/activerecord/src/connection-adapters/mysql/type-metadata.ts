/**
 * MySQL type metadata — extended SQL type metadata with MySQL-specific info.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::TypeMetadata
 *
 * Wraps the base SqlTypeMetadata with an `extra` field that captures
 * MySQL-specific column extras like "auto_increment", "on update CURRENT_TIMESTAMP",
 * "VIRTUAL GENERATED", etc.
 */

export class TypeMetadata {
  readonly sqlType: string;
  readonly type: string;
  readonly limit: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
  readonly extra: string;

  constructor(
    typeMetadata: {
      sqlType: string;
      type?: string;
      limit?: number | null;
      precision?: number | null;
      scale?: number | null;
    },
    options: { extra?: string } = {},
  ) {
    this.sqlType = typeMetadata.sqlType;
    this.type = typeMetadata.type ?? typeMetadata.sqlType;
    this.limit = typeMetadata.limit ?? null;
    this.precision = typeMetadata.precision ?? null;
    this.scale = typeMetadata.scale ?? null;
    this.extra = options.extra ?? "";
  }

  equals(other: TypeMetadata): boolean {
    return (
      this.sqlType === other.sqlType &&
      this.type === other.type &&
      this.limit === other.limit &&
      this.precision === other.precision &&
      this.scale === other.scale &&
      this.extra === other.extra
    );
  }

  hashKey(): string {
    return JSON.stringify([
      this.sqlType,
      this.type,
      this.limit,
      this.precision,
      this.scale,
      this.extra,
    ]);
  }
}
