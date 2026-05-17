/**
 * MySQL column — MySQL-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Column
 */

import { Column as BaseColumn } from "../column.js";
import type { ColumnJSON } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

export class Column extends BaseColumn {
  readonly unsigned: boolean;
  readonly autoIncrement: boolean;
  readonly virtual: boolean;

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

  override toJSON(): MysqlColumnJSON {
    return {
      ...super.toJSON(),
      __mysql: true,
      unsigned: this.unsigned,
      autoIncrement: this.autoIncrement,
      virtual: this.virtual,
    };
  }

  static override fromJSON(data: ColumnJSON): Column {
    const m = data as MysqlColumnJSON;
    return new Column(
      m.name,
      m.default,
      {
        sqlType: m.sqlTypeMetadata?.sqlType,
        type: m.sqlTypeMetadata?.type,
        limit: m.sqlTypeMetadata?.limit ?? null,
        precision: m.sqlTypeMetadata?.precision ?? null,
        scale: m.sqlTypeMetadata?.scale ?? null,
      },
      m.null,
      {
        collation: m.collation,
        comment: m.comment,
        defaultFunction: m.defaultFunction,
        primaryKey: m.primaryKey,
        unsigned: m.unsigned,
        autoIncrement: m.autoIncrement,
        virtual: m.virtual,
      },
    );
  }
}

export interface MysqlColumnJSON extends ColumnJSON {
  __mysql: true;
  unsigned: boolean;
  autoIncrement: boolean;
  virtual: boolean;
}
