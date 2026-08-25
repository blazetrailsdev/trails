/**
 * MySQL column — MySQL-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Column
 */

import { Column as BaseColumn } from "../column.js";
import type { ColumnCoder } from "../column.js";
import { TypeMetadata } from "./type-metadata.js";

export class Column extends BaseColumn {
  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: TypeMetadata | null = null,
    null_: boolean = true,
    options: {
      collation?: string | null;
      comment?: string | null;
      defaultFunction?: string | null;
    } = {},
  ) {
    super(name, defaultValue, sqlTypeMetadata, null_, {
      collation: options.collation,
      comment: options.comment,
      defaultFunction: options.defaultFunction,
    });
  }

  /** Raw MySQL `Extra` string (e.g. "VIRTUAL GENERATED", "STORED GENERATED",
   *  "auto_increment"); the schema dumper reads it to distinguish stored from
   *  virtual generated columns.
   *
   *  Mirrors: `delegate :extra, to: :sql_type_metadata, allow_nil: true`
   *  (mysql/column.rb:7). */
  get extra(): string | null {
    return (this.sqlTypeMetadata as TypeMetadata | null)?.extra ?? null;
  }

  /**
   * Mirrors: MySQL::Column#unsigned? (`mysql/column.rb:9-11`). End-anchored,
   * and without an `/i` flag as in Rails — SHOW FULL FIELDS reports the `Type`
   * column lowercased.
   */
  isUnsigned(): boolean {
    return /\bunsigned(?: zerofill)?$/.test(this.sqlType ?? "");
  }

  isCaseSensitive(): boolean {
    return this.collation != null && !this.collation.endsWith("_ci");
  }

  /** Mirrors: MySQL::Column#auto_increment? (`mysql/column.rb:17-19`) */
  isAutoIncrement(): boolean {
    return this.extra === "auto_increment";
  }

  /** Mirrors: `alias_method :auto_incremented_by_db?, :auto_increment?` (`mysql/column.rb:20`) */
  isAutoIncrementedByDb(): boolean {
    return this.isAutoIncrement();
  }

  /** Mirrors: MySQL::Column#virtual? (`mysql/column.rb:22-24`) */
  isVirtual(): boolean {
    return /\b(?:VIRTUAL|STORED|PERSISTENT)\b/.test(this.extra ?? "");
  }

  /**
   * Rails' MySQL::Column defines NEITHER coder half (mysql/column.rb has no
   * `encode_with` / `init_with`): every predicate it adds derives from
   * `sql_type` / `collation` / `sql_type_metadata.extra`, all of which the base
   * coder already persists. The one thing left is the `class` tag, which Ruby
   * gets from the YAML object tag and JSON has to spell out.
   *
   * @see Column#encodeWith
   */
  override encodeWith(coder: ColumnCoder): void {
    super.encodeWith(coder);
    coder["class"] = "MySQL::Column";
  }
}
