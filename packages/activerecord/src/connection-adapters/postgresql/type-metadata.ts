/**
 * PostgreSQL type metadata — extended SQL type metadata with PostgreSQL-specific info.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::TypeMetadata
 */

export class TypeMetadata {
  readonly sqlType: string;
  readonly type: string;
  readonly oid: number | null;
  readonly fmod: number | null;
  readonly limit: number | null;
  readonly precision: number | null;
  readonly scale: number | null;

  constructor(options: {
    sqlType: string;
    type?: string;
    oid?: number | null;
    fmod?: number | null;
    limit?: number | null;
    precision?: number | null;
    scale?: number | null;
  }) {
    this.sqlType = options.sqlType;
    this.type = options.type ?? options.sqlType;
    this.oid = options.oid ?? null;
    this.fmod = options.fmod ?? null;
    this.limit = options.limit ?? null;
    this.precision = options.precision ?? null;
    this.scale = options.scale ?? null;
  }

  equals(other: TypeMetadata): boolean {
    return (
      this.sqlType === other.sqlType &&
      this.type === other.type &&
      this.oid === other.oid &&
      this.fmod === other.fmod &&
      this.limit === other.limit &&
      this.precision === other.precision &&
      this.scale === other.scale
    );
  }

  hashKey(): string {
    return JSON.stringify([
      this.sqlType,
      this.type,
      this.oid,
      this.fmod,
      this.limit,
      this.precision,
      this.scale,
    ]);
  }
}
