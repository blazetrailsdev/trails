/**
 * SQL type metadata — describes the SQL type of a column.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SqlTypeMetadata
 */

import type { Deduplicable } from "./deduplicable.js";

export class SqlTypeMetadata implements Deduplicable {
  readonly sqlType: string;
  readonly type: string;
  readonly limit: number | null;
  readonly precision: number | null;
  readonly scale: number | null;

  constructor(
    options: {
      sqlType?: string;
      type?: string;
      limit?: number | null;
      precision?: number | null;
      scale?: number | null;
    } = {},
  ) {
    this.sqlType = options.sqlType ?? options.type ?? "";
    this.type = options.type ?? options.sqlType ?? "";
    this.limit = options.limit ?? null;
    this.precision = options.precision ?? null;
    this.scale = options.scale ?? null;
  }

  deduplicateKey(): string {
    return JSON.stringify([this.sqlType, this.type, this.limit, this.precision, this.scale]);
  }

  toString(): string {
    return this.sqlType;
  }
}
