/**
 * MySQL column — MySQL-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Column
 */

export class Column {
  readonly name: string;
  readonly sqlType: string | null;
  readonly null: boolean;
  readonly default: unknown;
  readonly defaultFunction: string | null;
  readonly collation: string | null;
  readonly primaryKey: boolean;
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
    this.name = name;
    this.default = defaultValue;
    this.sqlType = sqlTypeMetadata.sqlType ?? null;
    this.null = null_;
    this.collation = options.collation ?? null;
    this.defaultFunction = options.defaultFunction ?? null;
    this.primaryKey = options.primaryKey ?? false;
    this.unsigned = options.unsigned ?? false;
    this.autoIncrement = options.autoIncrement ?? false;
    this.virtual = options.virtual ?? false;
  }

  get hasDefault(): boolean {
    return this.default != null || this.defaultFunction != null;
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
