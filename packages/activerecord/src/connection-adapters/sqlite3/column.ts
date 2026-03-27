/**
 * SQLite3 column — SQLite-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::Column
 */

export class Column {
  readonly name: string;
  readonly sqlType: string | null;
  readonly null: boolean;
  readonly default: unknown;
  readonly defaultFunction: string | null;
  readonly collation: string | null;
  readonly primaryKey: boolean;
  readonly autoIncrement: boolean;
  readonly rowid: boolean;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: { sqlType?: string | null; type?: string } = {},
    null_: boolean = true,
    options: {
      collation?: string | null;
      defaultFunction?: string | null;
      primaryKey?: boolean;
      autoIncrement?: boolean;
      rowid?: boolean;
    } = {},
  ) {
    this.name = name;
    this.default = defaultValue;
    this.sqlType = sqlTypeMetadata.sqlType ?? null;
    this.null = null_;
    this.collation = options.collation ?? null;
    this.defaultFunction = options.defaultFunction ?? null;
    this.primaryKey = options.primaryKey ?? false;
    this.autoIncrement = options.autoIncrement ?? false;
    this.rowid = options.rowid ?? false;
  }

  get hasDefault(): boolean {
    return this.default !== null || this.defaultFunction !== null;
  }
}
