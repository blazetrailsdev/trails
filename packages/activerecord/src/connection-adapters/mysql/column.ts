/**
 * MySQL column — MySQL-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Column
 */

import { Column as BaseColumn } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

export class Column extends BaseColumn {
  readonly unsigned: boolean;
  readonly autoIncrement: boolean;
  readonly virtual: boolean;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: { sqlType?: string | null; type?: string } = {},
    null_: boolean = true,
    options: {
      collation?: string | null;
      defaultFunction?: string | null;
      primaryKey?: boolean;
      unsigned?: boolean;
      autoIncrement?: boolean;
      virtual?: boolean;
    } = {},
  ) {
    const meta = new SqlTypeMetadata({
      sqlType: sqlTypeMetadata.sqlType ?? undefined,
      type: sqlTypeMetadata.type,
    });
    super(name, defaultValue, meta, null_, {
      collation: options.collation,
      defaultFunction: options.defaultFunction,
      primaryKey: options.primaryKey,
    });
    this.unsigned = options.unsigned ?? false;
    this.autoIncrement = options.autoIncrement ?? false;
    this.virtual = options.virtual ?? false;
  }

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

  isVirtual(): boolean {
    return this.virtual;
  }
}
