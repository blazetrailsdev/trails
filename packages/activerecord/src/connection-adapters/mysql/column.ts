/**
 * MySQL column — MySQL-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Column
 */

import { Column as BaseColumn } from "../column.js";
import type { ColumnCoder } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

export class Column extends BaseColumn {
  unsigned: boolean;
  autoIncrement: boolean;
  virtual: boolean;
  /** Raw MySQL `Extra` string (e.g. "VIRTUAL GENERATED", "STORED GENERATED",
   *  "auto_increment"). Mirrors Rails' `MySQL::Column#extra` (delegated from
   *  sql_type_metadata); the schema dumper reads it to distinguish stored from
   *  virtual generated columns. */
  extra: string;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: {
      sqlType?: string | null;
      type?: string;
      limit?: number | null;
      precision?: number | null;
      scale?: number | null;
    } = {},
    null_: boolean = true,
    options: {
      collation?: string | null;
      comment?: string | null;
      defaultFunction?: string | null;
      primaryKey?: boolean;
      unsigned?: boolean;
      autoIncrement?: boolean;
      virtual?: boolean;
      extra?: string;
    } = {},
  ) {
    const meta = new SqlTypeMetadata({
      sqlType: sqlTypeMetadata.sqlType ?? undefined,
      type: sqlTypeMetadata.type,
      limit: sqlTypeMetadata.limit ?? null,
      precision: sqlTypeMetadata.precision ?? null,
      scale: sqlTypeMetadata.scale ?? null,
    });
    super(name, defaultValue, meta, null_, {
      collation: options.collation,
      comment: options.comment,
      defaultFunction: options.defaultFunction,
      primaryKey: options.primaryKey,
    });
    this.unsigned = options.unsigned ?? false;
    this.autoIncrement = options.autoIncrement ?? false;
    this.virtual = options.virtual ?? false;
    this.extra = options.extra ?? "";
  }

  /**
   * @missingRailsCall match? — PERMANENT: Per-entry verified (RFC 0032
   *   wide-entry verification): Rails mysql/column.rb:9-11 runs the unsigned
   *   regex against sql_type on every call; trails mysql/column.ts:12 stores
   *   `unsigned` as a readonly boolean computed when the adapter builds columns
   *   from SHOW FULL FIELDS.
   */
  isUnsigned(): boolean {
    return this.unsigned;
  }

  isCaseSensitive(): boolean {
    return this.collation != null && !this.collation.endsWith("_ci");
  }

  isAutoIncrement(): boolean {
    return this.autoIncrement;
  }

  isAutoIncrementedByDb(): boolean {
    return this.autoIncrement;
  }

  /**
   * @missingRailsCall match? — PERMANENT: Per-entry verified (RFC 0032
   *   wide-entry verification): Rails mysql/column.rb:22-24 runs the
   *   VIRTUAL/STORED/PERSISTENT regex against extra on every call; trails
   *   mysql/column.ts:14 stores `virtual` as a readonly boolean computed at
   *   column construction.
   */
  isVirtual(): boolean {
    return this.virtual;
  }

  /** @see Column#encodeWith — this subclass' half of the JSON class tag. */
  override initWith(coder: ColumnCoder): void {
    super.initWith(coder);
    this.unsigned = (coder["unsigned"] as boolean) ?? false;
    this.autoIncrement = (coder["auto_increment"] as boolean) ?? false;
    this.virtual = (coder["virtual"] as boolean) ?? false;
    this.extra = (coder["extra"] as string) ?? "";
  }

  override encodeWith(coder: ColumnCoder): void {
    super.encodeWith(coder);
    coder["class"] = "MySQL::Column";
    coder["unsigned"] = this.unsigned;
    coder["auto_increment"] = this.autoIncrement;
    coder["virtual"] = this.virtual;
    coder["extra"] = this.extra;
  }
}
