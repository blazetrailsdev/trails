import type { DatabaseAdapter } from "./adapter.js";

/** Detect adapter type from an adapter instance. */
function detectAdapterName(adapter: DatabaseAdapter | null | undefined): "sqlite" | "postgres" | "mysql" | "memory" {
  const name = adapter?.constructor?.name ?? "";
  if (name.includes("Postgres") || name === "SchemaAdapter") {
    if (process.env.PG_TEST_URL) return "postgres";
    if (process.env.MYSQL_TEST_URL) return "mysql";
    return "memory";
  }
  if (name.includes("Mysql") || name.includes("Maria")) return "mysql";
  if (name.includes("Memory")) return "memory";
  return "sqlite";
}

/**
 * Column type mapping.
 */
export type ColumnType =
  | "string"
  | "text"
  | "integer"
  | "float"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "timestamp"
  | "binary"
  | "primary_key";

interface ColumnDefinition {
  name: string;
  type: ColumnType;
  options: ColumnOptions;
}

export interface ColumnOptions {
  null?: boolean;
  default?: unknown;
  limit?: number;
  precision?: number;
  scale?: number;
  index?: boolean;
  unique?: boolean;
  primaryKey?: boolean;
}

interface IndexDefinition {
  columns: string[];
  unique: boolean;
  name?: string;
}

/**
 * TableDefinition — used inside create_table blocks.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::TableDefinition
 */
export class TableDefinition {
  readonly tableName: string;
  readonly columns: ColumnDefinition[] = [];
  readonly indexes: IndexDefinition[] = [];
  private _id: boolean;
  private _adapterName: "sqlite" | "postgres" | "mysql" | "memory";

  constructor(tableName: string, options: { id?: boolean; adapterName?: "sqlite" | "postgres" | "mysql" | "memory" } = {}) {
    this.tableName = tableName;
    this._adapterName = options.adapterName ?? "sqlite";
    this._id = options.id !== false;

    if (this._id) {
      this.columns.push({
        name: "id",
        type: "primary_key",
        options: { primaryKey: true },
      });
    }
  }

  string(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "string", options });
    return this;
  }

  text(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "text", options });
    return this;
  }

  integer(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "integer", options });
    return this;
  }

  float(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "float", options });
    return this;
  }

  decimal(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "decimal", options });
    return this;
  }

  boolean(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "boolean", options });
    return this;
  }

  date(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "date", options });
    return this;
  }

  datetime(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "datetime", options });
    return this;
  }

  timestamp(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "timestamp", options });
    return this;
  }

  binary(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "binary", options });
    return this;
  }

  timestamps(): this {
    this.datetime("created_at", { null: false });
    this.datetime("updated_at", { null: false });
    return this;
  }

  references(
    name: string,
    options: ColumnOptions & {
      polymorphic?: boolean;
      foreignKey?: boolean;
    } = {}
  ): this {
    this.integer(`${name}_id`, options);
    if (options.polymorphic) {
      this.string(`${name}_type`, options);
    }
    if (options.index !== false) {
      this.index([`${name}_id`]);
    }
    return this;
  }

  index(
    columns: string[],
    options: { unique?: boolean; name?: string } = {}
  ): this {
    this.indexes.push({
      columns,
      unique: options.unique ?? false,
      name: options.name,
    });
    return this;
  }

  /**
   * Generate CREATE TABLE SQL.
   */
  toSql(): string {
    const columnDefs = this.columns.map((col) => {
      const parts = [`"${col.name}"`];

      switch (col.type) {
        case "primary_key":
          if (this._adapterName === "postgres") {
            parts.push("SERIAL PRIMARY KEY");
          } else if (this._adapterName === "mysql") {
            parts.push("INT AUTO_INCREMENT PRIMARY KEY");
          } else {
            parts.push("INTEGER PRIMARY KEY AUTOINCREMENT");
          }
          break;
        case "string":
          parts.push(`VARCHAR(${col.options.limit ?? 255})`);
          break;
        case "text":
          parts.push("TEXT");
          break;
        case "integer":
          parts.push("INTEGER");
          break;
        case "float":
          parts.push(this._adapterName === "postgres" ? "DOUBLE PRECISION" : "REAL");
          break;
        case "decimal":
          parts.push(
            `DECIMAL(${col.options.precision ?? 10}, ${col.options.scale ?? 0})`
          );
          break;
        case "boolean":
          parts.push(this._adapterName === "postgres" ? "BOOLEAN" : "BOOLEAN");
          break;
        case "date":
          parts.push("DATE");
          break;
        case "datetime":
        case "timestamp":
          parts.push(this._adapterName === "postgres" ? "TIMESTAMP" : "DATETIME");
          break;
        case "binary":
          parts.push(this._adapterName === "postgres" ? "BYTEA" : "BLOB");
          break;
      }

      if (col.options.null === false && col.type !== "primary_key") {
        parts.push("NOT NULL");
      }

      if (col.options.default !== undefined) {
        const def = col.options.default;
        if (def === null) {
          parts.push("DEFAULT NULL");
        } else if (typeof def === "boolean") {
          parts.push(`DEFAULT ${def ? "TRUE" : "FALSE"}`);
        } else if (typeof def === "number") {
          parts.push(`DEFAULT ${def}`);
        } else {
          parts.push(`DEFAULT '${String(def).replace(/'/g, "''")}'`);
        }
      }

      return parts.join(" ");
    });

    return `CREATE TABLE "${this.tableName}" (${columnDefs.join(", ")})`;
  }
}

interface RecordedOperation {
  method: string;
  args: unknown[];
}

/**
 * Migration — base class for database migrations.
 *
 * Mirrors: ActiveRecord::Migration
 */
export abstract class Migration {
  protected adapter!: DatabaseAdapter;
  private _recording = false;
  private _recordedOps: RecordedOperation[] = [];
  private _name?: string;
  private _version?: string;

  /** Determine adapter type from the adapter class name. */
  protected get _adapterName(): "sqlite" | "postgres" | "mysql" | "memory" {
    return detectAdapterName(this.adapter);
  }

  /**
   * Mirrors: ActiveRecord::Migration#initialize
   */
  constructor(name?: string, version?: string) {
    this._name = name;
    this._version = version;
  }

  /**
   * Run the migration in the given direction (class method).
   *
   * Mirrors: ActiveRecord::Migration.migrate
   */
  static async migrate(direction: "up" | "down"): Promise<void> {
    // Subclasses should override; this is a no-op base
  }

  /**
   * Override to define the forward migration.
   */
  async up(): Promise<void> {
    // Default: run change() in forward direction
    await this._runChange("up");
  }

  /**
   * Override to define the rollback migration.
   * Default: run change() in reverse direction.
   */
  async down(): Promise<void> {
    await this._runChange("down");
  }

  /**
   * Override for reversible migrations.
   * Called by both up() and down() with a direction parameter.
   */
  async change(): Promise<void> {
    // Subclasses override
  }

  private async _runChange(direction: "up" | "down"): Promise<void> {
    if (direction === "up") {
      await this.change();
    } else {
      // Record operations from change(), then replay in reverse
      this._recording = true;
      this._recordedOps = [];
      await this.change();
      this._recording = false;

      // If no operations were recorded, migration is irreversible
      if (this._recordedOps.length === 0) {
        throw new Error(
          `${this.constructor.name}#down is not implemented. This migration is irreversible.`
        );
      }

      // Replay in reverse
      for (const op of this._recordedOps.reverse()) {
        await this._reverseOperation(op);
      }
    }
  }

  private async _reverseOperation(op: RecordedOperation): Promise<void> {
    switch (op.method) {
      case "createTable":
        await this.dropTable(op.args[0] as string);
        break;
      case "dropTable":
        throw new Error("Cannot reverse dropTable without table definition");
      case "addColumn":
        await this.removeColumn(op.args[0] as string, op.args[1] as string);
        break;
      case "removeColumn":
        throw new Error("Cannot reverse removeColumn without type info");
      case "addIndex":
        await this.removeIndex(op.args[0] as string, {
          column: op.args[1] as string | string[],
        });
        break;
      case "removeIndex":
        throw new Error("Cannot reverse removeIndex without column info");
      case "renameColumn":
        await this.renameColumn(
          op.args[0] as string,
          op.args[2] as string,
          op.args[1] as string
        );
        break;
      case "renameTable":
        await this.renameTable(
          op.args[1] as string,
          op.args[0] as string
        );
        break;
      case "changeColumn":
        throw new Error("Cannot reverse changeColumn without previous type info");
      default:
        throw new Error(`Cannot reverse operation: ${op.method}`);
    }
  }

  /**
   * Create a table.
   *
   * Mirrors: ActiveRecord::Migration#create_table
   */
  async createTable(
    name: string,
    optionsOrFn?:
      | { id?: boolean }
      | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "createTable", args: [name, optionsOrFn, fn] });
      return;
    }
    let options: { id?: boolean } = {};
    let definer: ((t: TableDefinition) => void) | undefined;

    if (typeof optionsOrFn === "function") {
      definer = optionsOrFn;
    } else if (optionsOrFn) {
      options = optionsOrFn;
      definer = fn;
    }

    const td = new TableDefinition(name, { ...options, adapterName: this._adapterName });
    if (definer) definer(td);

    await this.adapter.executeMutation(td.toSql());

    // Create indexes
    for (const idx of td.indexes) {
      const indexName =
        idx.name ?? `index_${name}_on_${idx.columns.join("_")}`;
      const unique = idx.unique ? "UNIQUE " : "";
      const cols = idx.columns.map((c) => `"${c}"`).join(", ");
      await this.adapter.executeMutation(
        `CREATE ${unique}INDEX "${indexName}" ON "${name}" (${cols})`
      );
    }
  }

  /**
   * Drop a table.
   *
   * Mirrors: ActiveRecord::Migration#drop_table
   */
  async dropTable(name?: string, _options?: { ifExists?: boolean }): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "dropTable", args: [name] });
      return;
    }
    await this.adapter.executeMutation(`DROP TABLE IF EXISTS "${name}"`);
  }

  /**
   * Add a column to a table.
   *
   * Mirrors: ActiveRecord::Migration#add_column
   */
  async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {}
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addColumn", args: [tableName, columnName, type, options] });
      return;
    }
    const sqlType = this._sqlType(type, options);
    const nullable =
      options.null === false ? " NOT NULL" : "";
    const defaultClause = this._defaultClause(options.default);

    await this.adapter.executeMutation(
      `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${sqlType}${nullable}${defaultClause}`
    );
  }

  /**
   * Remove a column from a table.
   *
   * Mirrors: ActiveRecord::Migration#remove_column
   */
  async removeColumn(tableName: string, columnName: string): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeColumn", args: [tableName, columnName] });
      return;
    }
    await this.adapter.executeMutation(
      `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`
    );
  }

  /**
   * Rename a column.
   *
   * Mirrors: ActiveRecord::Migration#rename_column
   */
  async renameColumn(
    tableName: string,
    oldName: string,
    newName: string
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "renameColumn", args: [tableName, oldName, newName] });
      return;
    }
    await this.adapter.executeMutation(
      `ALTER TABLE "${tableName}" RENAME COLUMN "${oldName}" TO "${newName}"`
    );
  }

  /**
   * Add an index.
   *
   * Mirrors: ActiveRecord::Migration#add_index
   */
  async addIndex(
    tableName: string,
    columns: string | string[],
    options: { unique?: boolean; name?: string } = {}
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addIndex", args: [tableName, columns, options] });
      return;
    }
    const cols = Array.isArray(columns) ? columns : [columns];
    const indexName =
      options.name ?? `index_${tableName}_on_${cols.join("_")}`;
    const unique = options.unique ? "UNIQUE " : "";

    await this.adapter.executeMutation(
      `CREATE ${unique}INDEX "${indexName}" ON "${tableName}" (${cols.map((c) => `"${c}"`).join(", ")})`
    );
  }

  /**
   * Remove an index.
   *
   * Mirrors: ActiveRecord::Migration#remove_index
   */
  async removeIndex(
    tableName: string,
    options: { column?: string | string[]; name?: string } = {}
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeIndex", args: [tableName, options] });
      return;
    }
    let indexName: string;
    if (options.name) {
      indexName = options.name;
    } else if (options.column) {
      const cols = Array.isArray(options.column)
        ? options.column
        : [options.column];
      indexName = `index_${tableName}_on_${cols.join("_")}`;
    } else {
      throw new Error("Must specify either name or column for remove_index");
    }

    await this.adapter.executeMutation(`DROP INDEX IF EXISTS "${indexName}"`);
  }

  /**
   * Change a column's type or options.
   *
   * Mirrors: ActiveRecord::Migration#change_column
   */
  async changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {}
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "changeColumn", args: [tableName, columnName, type, options] });
      return;
    }
    const sqlType = this._sqlType(type, options);
    const nullable = options.null === false ? " NOT NULL" : "";
    const defaultClause = this._defaultClause(options.default);

    await this.adapter.executeMutation(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE ${sqlType}${nullable}${defaultClause}`
    );
  }

  /**
   * Rename a table.
   *
   * Mirrors: ActiveRecord::Migration#rename_table
   */
  async renameTable(oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "renameTable", args: [oldName, newName] });
      return;
    }
    await this.adapter.executeMutation(
      `ALTER TABLE "${oldName}" RENAME TO "${newName}"`
    );
  }

  /**
   * Check if a table exists.
   *
   * Mirrors: ActiveRecord::Migration#table_exists?
   */
  async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
    );
    return rows.length > 0;
  }

  /**
   * Check if a column exists on a table.
   *
   * Mirrors: ActiveRecord::Migration#column_exists?
   */
  async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const rows = await this.adapter.execute(
      `PRAGMA table_info("${tableName}")`
    );
    return rows.some((row: any) => row.name === columnName);
  }

  /**
   * Change the default value of a column.
   *
   * Mirrors: ActiveRecord::Migration#change_column_default
   */
  async changeColumnDefault(
    tableName: string,
    columnName: string,
    options: { from?: unknown; to: unknown } | unknown
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "changeColumnDefault", args: [tableName, columnName, options] });
      return;
    }
    const defaultVal = typeof options === "object" && options !== null && "to" in (options as any)
      ? (options as any).to
      : options;
    const clause = this._defaultClause(defaultVal);
    await this.adapter.executeMutation(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET${clause || " DEFAULT NULL"}`
    );
  }

  /**
   * Change whether a column allows NULL.
   *
   * Mirrors: ActiveRecord::Migration#change_column_null
   */
  async changeColumnNull(
    tableName: string,
    columnName: string,
    allowNull: boolean,
    _defaultValue?: unknown
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "changeColumnNull", args: [tableName, columnName, allowNull, _defaultValue] });
      return;
    }
    const constraint = allowNull ? "DROP NOT NULL" : "SET NOT NULL";
    await this.adapter.executeMutation(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" ${constraint}`
    );
  }

  /**
   * Add a reference (foreign key column + index).
   *
   * Mirrors: ActiveRecord::Migration#add_reference
   */
  async addReference(
    tableName: string,
    refName: string,
    options: ColumnOptions & { polymorphic?: boolean; foreignKey?: boolean; type?: ColumnType; index?: boolean } = {}
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addReference", args: [tableName, refName, options] });
      return;
    }
    const colType = options.type ?? "integer";
    await this.addColumn(tableName, `${refName}_id`, colType, options);
    if (options.polymorphic) {
      await this.addColumn(tableName, `${refName}_type`, "string", options);
    }
    if (options.index !== false) {
      const cols = options.polymorphic ? [`${refName}_id`, `${refName}_type`] : [`${refName}_id`];
      await this.addIndex(tableName, cols);
    }
  }

  /**
   * Remove a reference (foreign key column + index).
   *
   * Mirrors: ActiveRecord::Migration#remove_reference
   */
  async removeReference(
    tableName: string,
    refName: string,
    options: { polymorphic?: boolean } = {}
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeReference", args: [tableName, refName, options] });
      return;
    }
    if (options.polymorphic) {
      await this.removeColumn(tableName, `${refName}_type`);
    }
    await this.removeColumn(tableName, `${refName}_id`);
  }

  /**
   * Add a foreign key constraint.
   *
   * Mirrors: ActiveRecord::Migration#add_foreign_key
   */
  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: { column?: string; primaryKey?: string; name?: string } = {}
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addForeignKey", args: [fromTable, toTable, options] });
      return;
    }
    const column = options.column ?? `${toTable.replace(/s$/, "")}_id`;
    const pk = options.primaryKey ?? "id";
    const name = options.name ?? `fk_${fromTable}_${column}`;
    await this.adapter.executeMutation(
      `ALTER TABLE "${fromTable}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}") REFERENCES "${toTable}" ("${pk}")`
    );
  }

  /**
   * Remove a foreign key constraint.
   *
   * Mirrors: ActiveRecord::Migration#remove_foreign_key
   */
  async removeForeignKey(
    fromTable: string,
    toTableOrOptions?: string | { column?: string; name?: string }
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeForeignKey", args: [fromTable, toTableOrOptions] });
      return;
    }
    let name: string;
    if (typeof toTableOrOptions === "string") {
      const column = `${toTableOrOptions.replace(/s$/, "")}_id`;
      name = `fk_${fromTable}_${column}`;
    } else if (toTableOrOptions?.name) {
      name = toTableOrOptions.name;
    } else if (toTableOrOptions?.column) {
      name = `fk_${fromTable}_${toTableOrOptions.column}`;
    } else {
      throw new Error("removeForeignKey requires a target table or options");
    }
    await this.adapter.executeMutation(
      `ALTER TABLE "${fromTable}" DROP CONSTRAINT "${name}"`
    );
  }

  /**
   * Add timestamp columns (created_at, updated_at).
   *
   * Mirrors: ActiveRecord::Migration#add_timestamps
   */
  async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addTimestamps", args: [tableName, options] });
      return;
    }
    const nullable = options.null !== undefined ? options.null : false;
    await this.addColumn(tableName, "created_at", "datetime", { null: nullable });
    await this.addColumn(tableName, "updated_at", "datetime", { null: nullable });
  }

  /**
   * Remove timestamp columns.
   *
   * Mirrors: ActiveRecord::Migration#remove_timestamps
   */
  async removeTimestamps(tableName: string): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeTimestamps", args: [tableName] });
      return;
    }
    await this.removeColumn(tableName, "created_at");
    await this.removeColumn(tableName, "updated_at");
  }

  /**
   * Create a join table.
   *
   * Mirrors: ActiveRecord::Migration#create_join_table
   */
  async createJoinTable(
    table1: string,
    table2: string,
    options?: { tableName?: string } | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void
  ): Promise<void> {
    let opts: { tableName?: string } = {};
    let definer: ((t: TableDefinition) => void) | undefined;
    if (typeof options === "function") {
      definer = options;
    } else if (options) {
      opts = options;
      definer = fn;
    }
    const tableName = opts.tableName ?? [table1, table2].sort().join("_");
    await this.createTable(tableName, { id: false }, (t) => {
      t.integer(`${table1.replace(/s$/, "")}_id`);
      t.integer(`${table2.replace(/s$/, "")}_id`);
      if (definer) definer(t);
    });
  }

  /**
   * Drop a join table.
   *
   * Mirrors: ActiveRecord::Migration#drop_join_table
   */
  async dropJoinTable(
    table1: string,
    table2: string,
    options?: { tableName?: string }
  ): Promise<void> {
    const tableName = options?.tableName ?? [table1, table2].sort().join("_");
    await this.dropTable(tableName);
  }

  /**
   * Modify an existing table.
   *
   * Mirrors: ActiveRecord::Migration#change_table
   */
  async changeTable(
    tableName: string,
    fn?: (t: ChangeTableProxy) => void | Promise<void>
  ): Promise<void> {
    const proxy = new ChangeTableProxy(tableName, this);
    if (fn) await fn(proxy);
  }

  /**
   * Rename an index.
   *
   * Mirrors: ActiveRecord::Migration#rename_index
   */
  async renameIndex(
    _tableName: string,
    oldName: string,
    newName: string
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "renameIndex", args: [_tableName, oldName, newName] });
      return;
    }
    await this.adapter.executeMutation(
      `ALTER INDEX "${oldName}" RENAME TO "${newName}"`
    );
  }

  /**
   * Generate an index name from table and options.
   *
   * Mirrors: ActiveRecord::Migration#index_name
   */
  indexName(tableName: string, options: { column?: string | string[] }): string {
    const cols = Array.isArray(options.column) ? options.column : [options.column ?? ""];
    return `index_${tableName}_on_${cols.join("_")}`;
  }

  /**
   * Remove multiple columns from a table.
   *
   * Mirrors: ActiveRecord::Migration#remove_columns
   */
  async removeColumns(tableName: string, ...columns: string[]): Promise<void> {
    for (const col of columns) {
      await this.removeColumn(tableName, col);
    }
  }

  /**
   * Add multiple columns to a table.
   *
   * Mirrors: ActiveRecord::Migration#add_columns (via change_table)
   */
  async addColumns(tableName: string, ...columns: Array<{ name: string; type: ColumnType; options?: ColumnOptions }>): Promise<void> {
    for (const col of columns) {
      await this.addColumn(tableName, col.name, col.type, col.options ?? {});
    }
  }

  /**
   * Get column information for a table.
   *
   * Mirrors: ActiveRecord::Migration#columns
   */
  async columns(tableName: string): Promise<Array<{ name: string; type: string; null: boolean; default: unknown }>> {
    const rows = await this.adapter.execute(`PRAGMA table_info("${tableName}")`);
    return rows.map((row: any) => ({
      name: row.name,
      type: row.type,
      null: row.notnull === 0,
      default: row.dflt_value,
    }));
  }

  /**
   * Get indexes for a table.
   *
   * Mirrors: ActiveRecord::Migration#indexes
   */
  async indexes(tableName: string): Promise<Array<{ name: string; columns: string[]; unique: boolean }>> {
    const rows = await this.adapter.execute(`PRAGMA index_list("${tableName}")`);
    const result: Array<{ name: string; columns: string[]; unique: boolean }> = [];
    for (const row of rows as any[]) {
      const cols = await this.adapter.execute(`PRAGMA index_info("${row.name}")`);
      result.push({
        name: row.name,
        columns: (cols as any[]).map((c: any) => c.name),
        unique: row.unique === 1,
      });
    }
    return result;
  }

  /**
   * Get the primary key column for a table.
   *
   * Mirrors: ActiveRecord::Migration#primary_key
   */
  async primaryKey(tableName: string): Promise<string | null> {
    const rows = await this.adapter.execute(`PRAGMA table_info("${tableName}")`);
    const pk = (rows as any[]).find((r: any) => r.pk > 0);
    return pk ? pk.name : null;
  }

  /**
   * Get foreign keys for a table.
   *
   * Mirrors: ActiveRecord::Migration#foreign_keys
   */
  async foreignKeys(tableName: string): Promise<Array<{ from: string; to: string; column: string; primaryKey: string }>> {
    const rows = await this.adapter.execute(`PRAGMA foreign_key_list("${tableName}")`);
    return (rows as any[]).map((row: any) => ({
      from: tableName,
      to: row.table,
      column: row.from,
      primaryKey: row.to,
    }));
  }

  /**
   * List all tables.
   *
   * Mirrors: ActiveRecord::Migration#tables
   */
  async tables(): Promise<string[]> {
    const rows = await this.adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    return (rows as any[]).map((r: any) => r.name);
  }

  /**
   * List all views.
   *
   * Mirrors: ActiveRecord::Migration#views
   */
  async views(): Promise<string[]> {
    const rows = await this.adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='view' ORDER BY name`
    );
    return (rows as any[]).map((r: any) => r.name);
  }

  /**
   * Get the migration name.
   *
   * Mirrors: ActiveRecord::Migration#name
   */
  get name(): string {
    return this.constructor.name;
  }

  /**
   * Revert a migration or a block of operations.
   *
   * Mirrors: ActiveRecord::Migration#revert
   */
  async revert(migrationOrFn?: Migration | (() => Promise<void>)): Promise<void> {
    if (migrationOrFn === undefined) return;
    if (migrationOrFn instanceof Migration) {
      (migrationOrFn as any).adapter = this.adapter;
      await migrationOrFn.down();
    } else {
      // Record operations and reverse them
      this._recording = true;
      this._recordedOps = [];
      await migrationOrFn();
      this._recording = false;
      for (const op of this._recordedOps.reverse()) {
        await this._reverseOperation(op);
      }
      this._recordedOps = [];
    }
  }

  /**
   * Define reversible operations.
   *
   * Mirrors: ActiveRecord::Migration#reversible
   */
  async reversible(fn?: (dir: { up: (f: () => Promise<void>) => void; down: (f: () => Promise<void>) => void }) => void): Promise<void> {
    if (!fn) return;
    const upFns: Array<() => Promise<void>> = [];
    const downFns: Array<() => Promise<void>> = [];
    fn({
      up: (f) => upFns.push(f),
      down: (f) => downFns.push(f),
    });
    // In a forward migration, run up fns. In reverse, run down fns.
    // We always run the up direction here; down is handled by _runChange
    for (const f of upFns) await f();
  }

  /**
   * Run code only in the up direction.
   *
   * Mirrors: ActiveRecord::Migration#up_only
   */
  async upOnly(fn?: () => Promise<void>): Promise<void> {
    if (!this._recording && fn) {
      await fn();
    }
  }

  /**
   * Run the migration in a given direction.
   *
   * Mirrors: ActiveRecord::Migration#migrate
   */
  async migrate(direction: "up" | "down"): Promise<void> {
    if (direction === "up") {
      await this.up();
    } else {
      await this.down();
    }
  }

  /**
   * Check if the migration is currently reverting (recording operations
   * for later reversal).
   *
   * Mirrors: ActiveRecord::Migration#reverting?
   */
  isReverting(): boolean {
    return this._recording;
  }

  /**
   * Check if a view exists.
   *
   * Mirrors: ActiveRecord::Migration#view_exists?
   */
  async isViewExists(viewName: string): Promise<boolean> {
    const rows = await this.adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='view' AND name='${viewName}'`
    );
    return rows.length > 0;
  }

  /**
   * Check if an index exists on a table.
   *
   * Mirrors: ActiveRecord::Migration#index_exists?
   */
  async isIndexExists(
    tableName: string,
    columnName: string | string[],
    _options?: { unique?: boolean; name?: string }
  ): Promise<boolean> {
    const indexList = await this.adapter.execute(
      `PRAGMA index_list("${tableName}")`
    );
    const targetCols = Array.isArray(columnName) ? columnName : [columnName];
    for (const idx of indexList as any[]) {
      if (_options?.name && idx.name !== _options.name) continue;
      if (_options?.unique !== undefined && (idx.unique === 1) !== _options.unique) continue;
      const colInfo = await this.adapter.execute(
        `PRAGMA index_info("${idx.name}")`
      );
      const indexCols = (colInfo as any[]).map((c: any) => c.name);
      if (
        targetCols.length === indexCols.length &&
        targetCols.every((c, i) => c === indexCols[i])
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Retrieve a migration by version. Placeholder — returns null.
   *
   * Mirrors: ActiveRecord::Migration.get
   */
  static get(_version: string): Migration | null {
    return null;
  }

  /**
   * Execute the migration on a given adapter.
   */
  async run(adapter?: DatabaseAdapter, direction: "up" | "down" = "up"): Promise<void> {
    if (adapter) this.adapter = adapter;
    if (direction === "up") {
      await this.up();
    } else {
      await this.down();
    }
  }

  /**
   * Get the migration version from the class name or a static property.
   */
  get version(): string {
    return (this.constructor as any).version ?? this.constructor.name;
  }

  private _sqlType(type: ColumnType, options: ColumnOptions): string {
    switch (type) {
      case "string":
        return `VARCHAR(${options.limit ?? 255})`;
      case "text":
        return "TEXT";
      case "integer":
        return "INTEGER";
      case "float":
        return this._adapterName === "postgres" ? "DOUBLE PRECISION" : "REAL";
      case "decimal":
        return `DECIMAL(${options.precision ?? 10}, ${options.scale ?? 0})`;
      case "boolean":
        return "BOOLEAN";
      case "date":
        return "DATE";
      case "datetime":
      case "timestamp":
        return this._adapterName === "postgres" ? "TIMESTAMP" : "DATETIME";
      case "binary":
        return this._adapterName === "postgres" ? "BYTEA" : "BLOB";
      case "primary_key":
        if (this._adapterName === "postgres") return "SERIAL PRIMARY KEY";
        if (this._adapterName === "mysql") return "INT AUTO_INCREMENT PRIMARY KEY";
        return "INTEGER PRIMARY KEY AUTOINCREMENT";
    }
  }

  private _defaultClause(defaultValue: unknown): string {
    if (defaultValue === undefined) return "";
    if (defaultValue === null) return " DEFAULT NULL";
    if (typeof defaultValue === "boolean")
      return ` DEFAULT ${defaultValue ? "TRUE" : "FALSE"}`;
    if (typeof defaultValue === "number") return ` DEFAULT ${defaultValue}`;
    return ` DEFAULT '${String(defaultValue).replace(/'/g, "''")}'`;
  }
}

/**
 * ChangeTableProxy — used inside changeTable blocks.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Table
 */
class ChangeTableProxy {
  constructor(private _tableName: string, private _migration: Migration) {}

  async string(name: string, options: ColumnOptions = {}): Promise<void> {
    await (this._migration as any).addColumn(this._tableName, name, "string", options);
  }
  async text(name: string, options: ColumnOptions = {}): Promise<void> {
    await (this._migration as any).addColumn(this._tableName, name, "text", options);
  }
  async integer(name: string, options: ColumnOptions = {}): Promise<void> {
    await (this._migration as any).addColumn(this._tableName, name, "integer", options);
  }
  async float(name: string, options: ColumnOptions = {}): Promise<void> {
    await (this._migration as any).addColumn(this._tableName, name, "float", options);
  }
  async decimal(name: string, options: ColumnOptions = {}): Promise<void> {
    await (this._migration as any).addColumn(this._tableName, name, "decimal", options);
  }
  async boolean(name: string, options: ColumnOptions = {}): Promise<void> {
    await (this._migration as any).addColumn(this._tableName, name, "boolean", options);
  }
  async date(name: string, options: ColumnOptions = {}): Promise<void> {
    await (this._migration as any).addColumn(this._tableName, name, "date", options);
  }
  async datetime(name: string, options: ColumnOptions = {}): Promise<void> {
    await (this._migration as any).addColumn(this._tableName, name, "datetime", options);
  }
  async remove(name: string): Promise<void> {
    await (this._migration as any).removeColumn(this._tableName, name);
  }
  async rename(oldName: string, newName: string): Promise<void> {
    await (this._migration as any).renameColumn(this._tableName, oldName, newName);
  }
  async index(columns: string | string[], options?: { unique?: boolean; name?: string }): Promise<void> {
    await (this._migration as any).addIndex(this._tableName, columns, options);
  }
  async removeIndex(options: { column?: string | string[]; name?: string }): Promise<void> {
    await (this._migration as any).removeIndex(this._tableName, options);
  }
  async references(name: string, options?: ColumnOptions & { polymorphic?: boolean; foreignKey?: boolean }): Promise<void> {
    await (this._migration as any).addReference(this._tableName, name, options);
  }
  async timestamps(options?: ColumnOptions): Promise<void> {
    await (this._migration as any).addTimestamps(this._tableName, options);
  }
}

/**
 * Schema — for defining schema in a single block.
 *
 * Mirrors: ActiveRecord::Schema.define
 */
export class Schema {
  static async define(
    adapter: DatabaseAdapter,
    fn: (schema: Schema) => Promise<void>
  ): Promise<void> {
    const schema = new Schema(adapter);
    await fn(schema);
  }

  private adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  private get _adapterName(): "sqlite" | "postgres" | "mysql" | "memory" {
    return detectAdapterName(this.adapter);
  }

  async createTable(
    name: string,
    fn?: (t: TableDefinition) => void
  ): Promise<void> {
    const td = new TableDefinition(name, { adapterName: this._adapterName });
    if (fn) fn(td);
    await this.adapter.executeMutation(td.toSql());
  }
}

/**
 * MigrationContext — wraps an adapter with schema-aware migration methods
 * and synchronous schema inspection. Designed for use with MemoryAdapter
 * in tests and for defining migrations programmatically.
 *
 * Mirrors: ActiveRecord::MigrationContext
 */
export class MigrationContext {
  private _tables = new Set<string>();
  private _columns = new Map<string, Set<string>>();
  private _indexes = new Map<string, { columns: string[]; unique: boolean; name?: string }[]>();

  constructor(private adapter: DatabaseAdapter) {}

  private get _adapterName(): "sqlite" | "postgres" | "mysql" | "memory" {
    return detectAdapterName(this.adapter);
  }

  async createTable(
    name: string,
    options?: { primaryKey?: string | false; force?: boolean; id?: boolean },
    fn?: (t: TableDefinition) => void
  ): Promise<void> {
    if (options?.force) {
      await this.dropTable(name).catch(() => {});
    }
    const td = new TableDefinition(name, { id: options?.id, adapterName: this._adapterName });
    if (fn) fn(td);
    await this.adapter.executeMutation(td.toSql());
    this._tables.add(name);
    const cols = new Set<string>();
    for (const col of td.columns) {
      cols.add(col.name);
    }
    this._columns.set(name, cols);
  }

  async dropTable(name: string): Promise<void> {
    await this.adapter.executeMutation(`DROP TABLE IF EXISTS "${name}"`);
    this._tables.delete(name);
    this._columns.delete(name);
    this._indexes.delete(name);
  }

  private _mapType(type: string): string {
    const an = this._adapterName;
    switch (type.toLowerCase()) {
      case "string": return `VARCHAR(255)`;
      case "text": return "TEXT";
      case "integer": return "INTEGER";
      case "float": return an === "postgres" ? "DOUBLE PRECISION" : "REAL";
      case "decimal": return "DECIMAL(10, 0)";
      case "boolean": return "BOOLEAN";
      case "date": return "DATE";
      case "datetime": case "timestamp": return an === "postgres" ? "TIMESTAMP" : "DATETIME";
      case "binary": return an === "postgres" ? "BYTEA" : "BLOB";
      case "primary_key":
        if (an === "postgres") return "SERIAL PRIMARY KEY";
        if (an === "mysql") return "INT AUTO_INCREMENT PRIMARY KEY";
        return "INTEGER PRIMARY KEY AUTOINCREMENT";
      default: return type.toUpperCase();
    }
  }

  async addColumn(
    table: string,
    column: string,
    type: string,
    _options?: ColumnOptions
  ): Promise<void> {
    await this.adapter.executeMutation(
      `ALTER TABLE "${table}" ADD COLUMN "${column}" ${this._mapType(type)}`
    );
    if (!this._columns.has(table)) this._columns.set(table, new Set());
    this._columns.get(table)!.add(column);
  }

  async removeColumn(table: string, ...columns: string[]): Promise<void> {
    for (const column of columns) {
      await this.adapter.executeMutation(
        `ALTER TABLE "${table}" DROP COLUMN "${column}"`
      );
      this._columns.get(table)?.delete(column);
    }
  }

  async renameColumn(table: string, from: string, to: string): Promise<void> {
    await this.adapter.executeMutation(
      `ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`
    );
    const cols = this._columns.get(table);
    if (cols) {
      cols.delete(from);
      cols.add(to);
    }
  }

  async changeColumn(
    table: string,
    column: string,
    type: string,
    _options?: ColumnOptions
  ): Promise<void> {
    await this.adapter.executeMutation(
      `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE ${this._mapType(type)}`
    );
  }

  async addIndex(
    table: string,
    columns: string | string[],
    options?: { unique?: boolean; name?: string }
  ): Promise<void> {
    const cols = Array.isArray(columns) ? columns : [columns];
    const unique = options?.unique ?? false;
    const indexName =
      options?.name ?? `index_${table}_on_${cols.join("_and_")}`;
    const uniqueStr = unique ? "UNIQUE " : "";
    const colsStr = cols.map((c) => `"${c}"`).join(", ");
    await this.adapter.executeMutation(
      `CREATE ${uniqueStr}INDEX "${indexName}" ON "${table}" (${colsStr})`
    );
    if (!this._indexes.has(table)) this._indexes.set(table, []);
    this._indexes.get(table)!.push({ columns: cols, unique, name: indexName });
  }

  async removeIndex(
    table: string,
    options: { column?: string | string[]; name?: string }
  ): Promise<void> {
    let indexName = options.name;
    if (!indexName && options.column) {
      const cols = Array.isArray(options.column) ? options.column : [options.column];
      indexName = `index_${table}_on_${cols.join("_and_")}`;
    }
    if (indexName) {
      await this.adapter.executeMutation(`DROP INDEX "${indexName}"`);
      const tableIndexes = this._indexes.get(table);
      if (tableIndexes) {
        this._indexes.set(
          table,
          tableIndexes.filter((i) => i.name !== indexName)
        );
      }
    }
  }

  async renameTable(from: string, to: string): Promise<void> {
    await this.adapter.executeMutation(
      `ALTER TABLE "${from}" RENAME TO "${to}"`
    );
    this._tables.delete(from);
    this._tables.add(to);
    const cols = this._columns.get(from);
    if (cols) {
      this._columns.delete(from);
      this._columns.set(to, cols);
    }
    const indexes = this._indexes.get(from);
    if (indexes) {
      this._indexes.delete(from);
      this._indexes.set(to, indexes);
    }
  }

  async reversible(
    fn: (dir: {
      up: (cb: () => void | Promise<void>) => void;
      down: (cb: () => void | Promise<void>) => void;
    }) => void
  ): Promise<void> {
    let upFn: (() => void | Promise<void>) | null = null;
    fn({
      up: (cb) => { upFn = cb; },
      down: () => {},
    });
    if (upFn) await (upFn as any)();
  }

  async revert(fn: () => Promise<void>): Promise<void> {
    // For testing purposes, just run the function in reverse conceptually.
    // A full revert implementation would record and reverse operations.
    await fn();
  }

  tableExists(name: string): boolean {
    return this._tables.has(name);
  }

  columnExists(table: string, column: string): boolean {
    return this._columns.get(table)?.has(column) ?? false;
  }

  indexExists(table: string, column: string): boolean {
    return (
      this._indexes.get(table)?.some((i) => i.columns.includes(column)) ?? false
    );
  }
}
