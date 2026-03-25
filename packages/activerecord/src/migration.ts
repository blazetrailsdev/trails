import type { DatabaseAdapter } from "./adapter.js";
import {
  TableDefinition,
  type ColumnType,
  type ColumnOptions,
} from "./connection-adapters/abstract/schema-definitions.js";
import { detectAdapterName } from "./adapter-name.js";

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
  protected get _adapterName(): "sqlite" | "postgres" | "mysql" {
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
          `${this.constructor.name}#down is not implemented. This migration is irreversible.`,
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
        {
          const idxOpts: { column: string | string[]; name?: string } = {
            column: op.args[1] as string | string[],
          };
          const origOpts = op.args[2] as { name?: string } | undefined;
          if (origOpts?.name) idxOpts.name = origOpts.name;
          await this.removeIndex(op.args[0] as string, idxOpts);
        }
        break;
      case "removeIndex":
        throw new Error("Cannot reverse removeIndex without column info");
      case "renameColumn":
        await this.renameColumn(op.args[0] as string, op.args[2] as string, op.args[1] as string);
        break;
      case "renameTable":
        await this.renameTable(op.args[1] as string, op.args[0] as string);
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
      | { id?: boolean; force?: boolean; ifNotExists?: boolean }
      | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "createTable", args: [name, optionsOrFn, fn] });
      return;
    }
    let options: { id?: boolean; force?: boolean; ifNotExists?: boolean } = {};
    let definer: ((t: TableDefinition) => void) | undefined;

    if (typeof optionsOrFn === "function") {
      definer = optionsOrFn;
    } else if (optionsOrFn) {
      options = optionsOrFn;
      definer = fn;
    }

    if (name.length > 64) {
      throw new Error(`Table name '${name}' is too long; the limit is 64 characters`);
    }

    if (options.force && options.ifNotExists) {
      throw new Error("Options `:force` and `:if_not_exists` cannot be used simultaneously.");
    }

    if (options.force) {
      if (await this.tableExists(name)) {
        await this.dropTable(name);
      }
    }

    if (options.ifNotExists && (await this.tableExists(name))) {
      return;
    }

    const td = new TableDefinition(name, { ...options, adapterName: this._adapterName });
    if (definer) definer(td);

    await this.adapter.executeMutation(td.toSql());

    // Create indexes
    for (const idx of td.indexes) {
      const indexName = idx.name ?? `index_${name}_on_${idx.columns.join("_and_")}`;
      const unique = idx.unique ? "UNIQUE " : "";
      const cols = idx.columns.map((c) => `"${c}"`).join(", ");
      await this.adapter.executeMutation(
        `CREATE ${unique}INDEX "${indexName}" ON "${name}" (${cols})`,
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
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addColumn", args: [tableName, columnName, type, options] });
      return;
    }
    if (options.ifNotExists && (await this.columnExists(tableName, columnName))) {
      return;
    }
    const sqlType = this._sqlType(type, options);
    const nullable = options.null === false ? " NOT NULL" : "";
    const defaultClause = this._defaultClause(options.default);

    await this.adapter.executeMutation(
      `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${sqlType}${nullable}${defaultClause}`,
    );
  }

  /**
   * Remove a column from a table.
   *
   * Mirrors: ActiveRecord::Migration#remove_column
   */
  async removeColumn(
    tableName: string,
    columnName: string,
    options: { ifExists?: boolean } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeColumn", args: [tableName, columnName, options] });
      return;
    }
    if (options.ifExists && !(await this.columnExists(tableName, columnName))) {
      return;
    }
    await this.adapter.executeMutation(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`);
  }

  /**
   * Rename a column.
   *
   * Mirrors: ActiveRecord::Migration#rename_column
   */
  async renameColumn(tableName: string, oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "renameColumn", args: [tableName, oldName, newName] });
      return;
    }
    await this.adapter.executeMutation(
      `ALTER TABLE "${tableName}" RENAME COLUMN "${oldName}" TO "${newName}"`,
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
    options: { unique?: boolean; name?: string } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addIndex", args: [tableName, columns, options] });
      return;
    }
    const cols = Array.isArray(columns) ? columns : [columns];
    const indexName = options.name ?? `index_${tableName}_on_${cols.join("_and_")}`;
    const unique = options.unique ? "UNIQUE " : "";

    await this.adapter.executeMutation(
      `CREATE ${unique}INDEX "${indexName}" ON "${tableName}" (${cols.map((c) => `"${c}"`).join(", ")})`,
    );
  }

  /**
   * Remove an index.
   *
   * Mirrors: ActiveRecord::Migration#remove_index
   */
  async removeIndex(
    tableName: string,
    options: { column?: string | string[]; name?: string } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "removeIndex", args: [tableName, options] });
      return;
    }
    let indexName: string;
    if (options.name) {
      indexName = options.name;
    } else if (options.column) {
      const cols = Array.isArray(options.column) ? options.column : [options.column];
      indexName = `index_${tableName}_on_${cols.join("_and_")}`;
    } else {
      throw new Error("Must specify either name or column for remove_index");
    }

    const adp = detectAdapterName(this.adapter);
    if (adp === "mysql") {
      await this.adapter.executeMutation(`DROP INDEX \`${indexName}\` ON \`${tableName}\``);
    } else {
      await this.adapter.executeMutation(`DROP INDEX IF EXISTS "${indexName}"`);
    }
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
    options: ColumnOptions = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({
        method: "changeColumn",
        args: [tableName, columnName, type, options],
      });
      return;
    }
    const sqlType = this._sqlType(type, options);
    const nullable = options.null === false ? " NOT NULL" : "";
    const defaultClause = this._defaultClause(options.default);

    if (this._adapterName === "mysql") {
      await this.adapter.executeMutation(
        `ALTER TABLE "${tableName}" MODIFY COLUMN "${columnName}" ${sqlType}${nullable}${defaultClause}`,
      );
    } else {
      await this.adapter.executeMutation(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE ${sqlType}${nullable}${defaultClause}`,
      );
    }
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
    await this.adapter.executeMutation(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
  }

  /**
   * Check if a table exists.
   *
   * Mirrors: ActiveRecord::Migration#table_exists?
   */
  async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
    );
    return rows.length > 0;
  }

  /**
   * Check if a column exists on a table.
   *
   * Mirrors: ActiveRecord::Migration#column_exists?
   */
  async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const rows = await this.adapter.execute(`PRAGMA table_info("${tableName}")`);
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
    options: { from?: unknown; to: unknown } | unknown,
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({
        method: "changeColumnDefault",
        args: [tableName, columnName, options],
      });
      return;
    }
    const defaultVal =
      typeof options === "object" && options !== null && "to" in (options as any)
        ? (options as any).to
        : options;
    const clause = this._defaultClause(defaultVal);
    await this.adapter.executeMutation(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET${clause || " DEFAULT NULL"}`,
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
    _defaultValue?: unknown,
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({
        method: "changeColumnNull",
        args: [tableName, columnName, allowNull, _defaultValue],
      });
      return;
    }
    const constraint = allowNull ? "DROP NOT NULL" : "SET NOT NULL";
    await this.adapter.executeMutation(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" ${constraint}`,
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
    options: ColumnOptions & {
      polymorphic?: boolean;
      foreignKey?: boolean;
      type?: ColumnType;
      index?: boolean;
    } = {},
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
    options: { polymorphic?: boolean } = {},
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
    options: { column?: string; primaryKey?: string; name?: string } = {},
  ): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "addForeignKey", args: [fromTable, toTable, options] });
      return;
    }
    const column = options.column ?? `${toTable.replace(/s$/, "")}_id`;
    const pk = options.primaryKey ?? "id";
    const name = options.name ?? `fk_${fromTable}_${column}`;
    await this.adapter.executeMutation(
      `ALTER TABLE "${fromTable}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}") REFERENCES "${toTable}" ("${pk}")`,
    );
  }

  /**
   * Remove a foreign key constraint.
   *
   * Mirrors: ActiveRecord::Migration#remove_foreign_key
   */
  async removeForeignKey(
    fromTable: string,
    toTableOrOptions?: string | { column?: string; name?: string },
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
    await this.adapter.executeMutation(`ALTER TABLE "${fromTable}" DROP CONSTRAINT "${name}"`);
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
    fn?: (t: TableDefinition) => void,
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
    options?: { tableName?: string },
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
    fn?: (t: ChangeTableProxy) => void | Promise<void>,
  ): Promise<void> {
    const proxy = new ChangeTableProxy(tableName, this);
    if (fn) await fn(proxy);
  }

  /**
   * Rename an index.
   *
   * Mirrors: ActiveRecord::Migration#rename_index
   */
  async renameIndex(_tableName: string, oldName: string, newName: string): Promise<void> {
    if (this._recording) {
      this._recordedOps.push({ method: "renameIndex", args: [_tableName, oldName, newName] });
      return;
    }
    await this.adapter.executeMutation(`ALTER INDEX "${oldName}" RENAME TO "${newName}"`);
  }

  /**
   * Generate an index name from table and options.
   *
   * Mirrors: ActiveRecord::Migration#index_name
   */
  indexName(tableName: string, options: { column?: string | string[] }): string {
    const cols = Array.isArray(options.column) ? options.column : [options.column ?? ""];
    return `index_${tableName}_on_${cols.join("_and_")}`;
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
  async addColumns(
    tableName: string,
    ...columns: Array<{ name: string; type: ColumnType; options?: ColumnOptions }>
  ): Promise<void> {
    for (const col of columns) {
      await this.addColumn(tableName, col.name, col.type, col.options ?? {});
    }
  }

  /**
   * Get column information for a table.
   *
   * Mirrors: ActiveRecord::Migration#columns
   */
  async columns(
    tableName: string,
  ): Promise<Array<{ name: string; type: string; null: boolean; default: unknown }>> {
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
  async indexes(
    tableName: string,
  ): Promise<Array<{ name: string; columns: string[]; unique: boolean }>> {
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
  async foreignKeys(
    tableName: string,
  ): Promise<Array<{ from: string; to: string; column: string; primaryKey: string }>> {
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
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
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
      `SELECT name FROM sqlite_master WHERE type='view' ORDER BY name`,
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
  async reversible(
    fn?: (dir: {
      up: (f: () => Promise<void>) => void;
      down: (f: () => Promise<void>) => void;
    }) => void,
  ): Promise<void> {
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
      `SELECT name FROM sqlite_master WHERE type='view' AND name='${viewName}'`,
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
    _options?: { unique?: boolean; name?: string },
  ): Promise<boolean> {
    const indexList = await this.adapter.execute(`PRAGMA index_list("${tableName}")`);
    const targetCols = Array.isArray(columnName) ? columnName : [columnName];
    for (const idx of indexList as any[]) {
      if (_options?.name && idx.name !== _options.name) continue;
      if (_options?.unique !== undefined && (idx.unique === 1) !== _options.unique) continue;
      const colInfo = await this.adapter.execute(`PRAGMA index_info("${idx.name}")`);
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
    if (typeof defaultValue === "boolean") return ` DEFAULT ${defaultValue ? "TRUE" : "FALSE"}`;
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
  constructor(
    private _tableName: string,
    private _migration: Migration,
  ) {}

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
  async index(
    columns: string | string[],
    options?: { unique?: boolean; name?: string },
  ): Promise<void> {
    await (this._migration as any).addIndex(this._tableName, columns, options);
  }
  async removeIndex(options: { column?: string | string[]; name?: string }): Promise<void> {
    await (this._migration as any).removeIndex(this._tableName, options);
  }
  async references(
    name: string,
    options?: ColumnOptions & { polymorphic?: boolean; foreignKey?: boolean },
  ): Promise<void> {
    await (this._migration as any).addReference(this._tableName, name, options);
  }
  async timestamps(options?: ColumnOptions): Promise<void> {
    await (this._migration as any).addTimestamps(this._tableName, options);
  }
}

/**
 * MigrationContext — wraps an adapter with schema-aware migration methods
 * and synchronous schema inspection, for use in tests and programmatic migrations.
 *
 * Mirrors: ActiveRecord::MigrationContext
 */
export class MigrationContext {
  private _tables = new Set<string>();
  private _columns = new Map<string, Set<string>>();
  private _columnMeta = new Map<
    string,
    Map<
      string,
      {
        type: string;
        primaryKey?: boolean;
        null?: boolean;
        default?: unknown;
        limit?: number;
        precision?: number;
        scale?: number;
      }
    >
  >();
  private _indexes = new Map<string, { columns: string[]; unique: boolean; name?: string }[]>();
  tableNamePrefix = "";
  tableNameSuffix = "";

  constructor(private adapter: DatabaseAdapter) {}

  private get _adapterName(): "sqlite" | "postgres" | "mysql" {
    return detectAdapterName(this.adapter);
  }

  async createTable(
    name: string,
    options?: { primaryKey?: string | false; force?: boolean; ifNotExists?: boolean; id?: boolean },
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    if (name.length > 64) {
      throw new Error(`Table name '${name}' is too long; the limit is 64 characters`);
    }
    if (options?.force && options?.ifNotExists) {
      throw new Error("Options `:force` and `:if_not_exists` cannot be used simultaneously.");
    }
    if (options?.force) {
      await this.dropTable(name).catch(() => {});
    }
    if (options?.ifNotExists && this.tableExists(name)) {
      return;
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

    // Store column metadata
    const meta = new Map<
      string,
      {
        type: string;
        primaryKey?: boolean;
        null?: boolean;
        default?: unknown;
        limit?: number;
        precision?: number;
        scale?: number;
      }
    >();
    if (options?.id !== false) {
      meta.set("id", { type: "integer", primaryKey: true });
    }
    for (const col of td.columns) {
      if (col.name === "id" && meta.has("id")) continue;
      meta.set(col.name, {
        type: col.type,
        primaryKey: col.options.primaryKey,
        null: col.options.null,
        default: col.options.default,
        limit: col.options.limit,
        precision: col.options.precision,
        scale: col.options.scale,
      });
    }
    this._columnMeta.set(name, meta);

    // Create indexes from table definition
    for (const idx of td.indexes) {
      const indexName = idx.name ?? `index_${name}_on_${idx.columns.join("_and_")}`;
      const unique = idx.unique ? "UNIQUE " : "";
      const colsList = idx.columns.map((c) => `"${c}"`).join(", ");
      await this.adapter.executeMutation(
        `CREATE ${unique}INDEX "${indexName}" ON "${name}" (${colsList})`,
      );
      if (!this._indexes.has(name)) this._indexes.set(name, []);
      this._indexes.get(name)!.push({ ...idx, name: indexName });
    }
  }

  async dropTable(name: string): Promise<void> {
    await this.adapter.executeMutation(`DROP TABLE IF EXISTS "${name}"`);
    this._tables.delete(name);
    this._columns.delete(name);
    this._columnMeta.delete(name);
    this._indexes.delete(name);
  }

  private _mapType(type: string): string {
    const an = this._adapterName;
    switch (type.toLowerCase()) {
      case "string":
        return `VARCHAR(255)`;
      case "text":
        return "TEXT";
      case "integer":
        return "INTEGER";
      case "float":
        return an === "postgres" ? "DOUBLE PRECISION" : "REAL";
      case "decimal":
        return "DECIMAL(10, 0)";
      case "boolean":
        return "BOOLEAN";
      case "date":
        return "DATE";
      case "datetime":
      case "timestamp":
        return an === "postgres" ? "TIMESTAMP" : "DATETIME";
      case "binary":
        return an === "postgres" ? "BYTEA" : "BLOB";
      case "primary_key":
        if (an === "postgres") return "SERIAL PRIMARY KEY";
        if (an === "mysql") return "INT AUTO_INCREMENT PRIMARY KEY";
        return "INTEGER PRIMARY KEY AUTOINCREMENT";
      default:
        return type.toUpperCase();
    }
  }

  async addColumn(
    table: string,
    column: string,
    type: string,
    _options?: ColumnOptions & { ifNotExists?: boolean },
  ): Promise<void> {
    const ifNotExists = _options?.ifNotExists ?? false;
    if (this._columns.has(table) && this._columns.get(table)!.has(column)) {
      if (!ifNotExists) {
        throw new Error(`Column "${column}" already exists in table "${table}"`);
      }
      return;
    }
    await this.adapter.executeMutation(
      `ALTER TABLE "${table}" ADD COLUMN "${column}" ${this._mapType(type)}`,
    );
    if (!this._columns.has(table)) this._columns.set(table, new Set());
    this._columns.get(table)!.add(column);
    if (!this._columnMeta.has(table)) this._columnMeta.set(table, new Map());
    this._columnMeta.get(table)!.set(column, {
      type,
      null: _options?.null,
      default: _options?.default,
      limit: _options?.limit,
      precision: _options?.precision,
      scale: _options?.scale,
    });
  }

  async removeColumn(
    table: string,
    columnOrColumns: string,
    optionsOrColumn?: string | { ifExists?: boolean },
    ...rest: string[]
  ): Promise<void> {
    // Support variadic: removeColumn("t", "a", "b", "c")
    if (typeof optionsOrColumn === "string") {
      if (rest.length > 0 && typeof rest[rest.length - 1] === "object") {
        throw new Error("Cannot mix variadic column names with options object in removeColumn");
      }
      const allCols = [columnOrColumns, optionsOrColumn, ...rest];
      for (const col of allCols) {
        await this.adapter.executeMutation(`ALTER TABLE "${table}" DROP COLUMN "${col}"`);
        this._columns.get(table)?.delete(col);
        this._columnMeta.get(table)?.delete(col);
      }
      return;
    }
    if (optionsOrColumn?.ifExists && !this.columnExists(table, columnOrColumns)) {
      return;
    }
    await this.adapter.executeMutation(`ALTER TABLE "${table}" DROP COLUMN "${columnOrColumns}"`);
    this._columns.get(table)?.delete(columnOrColumns);
    this._columnMeta.get(table)?.delete(columnOrColumns);
  }

  async renameColumn(table: string, from: string, to: string): Promise<void> {
    await this.adapter.executeMutation(`ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`);
    const cols = this._columns.get(table);
    if (cols) {
      cols.delete(from);
      cols.add(to);
    }
    const meta = this._columnMeta.get(table);
    if (meta && meta.has(from)) {
      const entry = meta.get(from)!;
      meta.delete(from);
      meta.set(to, entry);
    }
  }

  async changeColumn(
    table: string,
    column: string,
    type: string,
    _options?: ColumnOptions,
  ): Promise<void> {
    if (this._adapterName === "mysql") {
      await this.adapter.executeMutation(
        `ALTER TABLE "${table}" MODIFY COLUMN "${column}" ${this._mapType(type)}`,
      );
    } else {
      await this.adapter.executeMutation(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE ${this._mapType(type)}`,
      );
    }
    const meta = this._columnMeta.get(table);
    if (meta && meta.has(column)) {
      const entry = meta.get(column)!;
      meta.set(column, {
        ...entry,
        type,
        null: _options?.null ?? entry.null,
        default: _options?.default ?? entry.default,
        limit: _options?.limit ?? entry.limit,
        precision: _options?.precision ?? entry.precision,
        scale: _options?.scale ?? entry.scale,
      });
    }
  }

  async addIndex(
    table: string,
    columns: string | string[],
    options?: { unique?: boolean; name?: string },
  ): Promise<void> {
    const cols = Array.isArray(columns) ? columns : [columns];
    const unique = options?.unique ?? false;
    const indexName = options?.name ?? `index_${table}_on_${cols.join("_and_")}`;
    const uniqueStr = unique ? "UNIQUE " : "";
    const colsStr = cols.map((c) => `"${c}"`).join(", ");
    await this.adapter.executeMutation(
      `CREATE ${uniqueStr}INDEX "${indexName}" ON "${table}" (${colsStr})`,
    );
    if (!this._indexes.has(table)) this._indexes.set(table, []);
    this._indexes.get(table)!.push({ columns: cols, unique, name: indexName });
  }

  async removeIndex(
    table: string,
    options: { column?: string | string[]; name?: string },
  ): Promise<void> {
    let indexName = options.name;
    if (!indexName && options.column) {
      const cols = Array.isArray(options.column) ? options.column : [options.column];
      indexName = `index_${table}_on_${cols.join("_and_")}`;
    }
    if (indexName) {
      const adp = detectAdapterName(this.adapter);
      if (adp === "mysql") {
        await this.adapter.executeMutation(`DROP INDEX \`${indexName}\` ON \`${table}\``);
      } else {
        await this.adapter.executeMutation(`DROP INDEX "${indexName}"`);
      }
      const tableIndexes = this._indexes.get(table);
      if (tableIndexes) {
        this._indexes.set(
          table,
          tableIndexes.filter((i) => i.name !== indexName),
        );
      }
    }
  }

  async renameTable(from: string, to: string): Promise<void> {
    const fullFrom = `${this.tableNamePrefix}${from}${this.tableNameSuffix}`;
    const fullTo = `${this.tableNamePrefix}${to}${this.tableNameSuffix}`;
    await this.adapter.executeMutation(`ALTER TABLE "${fullFrom}" RENAME TO "${fullTo}"`);
    this._tables.delete(fullFrom);
    this._tables.add(fullTo);
    const cols = this._columns.get(fullFrom);
    if (cols) {
      this._columns.delete(fullFrom);
      this._columns.set(fullTo, cols);
    }
    const meta = this._columnMeta.get(fullFrom);
    if (meta) {
      this._columnMeta.delete(fullFrom);
      this._columnMeta.set(fullTo, meta);
    }
    const indexes = this._indexes.get(fullFrom);
    if (indexes) {
      this._indexes.delete(fullFrom);
      this._indexes.set(fullTo, indexes);
    }
  }

  async reversible(
    fn: (dir: {
      up: (cb: () => void | Promise<void>) => void;
      down: (cb: () => void | Promise<void>) => void;
    }) => void,
  ): Promise<void> {
    let upFn: (() => void | Promise<void>) | null = null;
    fn({
      up: (cb) => {
        upFn = cb;
      },
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
    return this._indexes.get(table)?.some((i) => i.columns.includes(column)) ?? false;
  }

  tables(): string[] {
    return Array.from(this._tables).sort();
  }

  columns(tableName: string): Array<{
    name: string;
    type: string;
    primaryKey?: boolean;
    null?: boolean;
    default?: unknown;
    limit?: number;
    precision?: number;
    scale?: number;
  }> {
    const meta = this._columnMeta.get(tableName);
    if (meta) {
      return Array.from(meta.entries()).map(([name, info]) => ({ name, ...info }));
    }
    const cols = this._columns.get(tableName);
    if (!cols) return [];
    return Array.from(cols).map((name) => ({ name, type: "string" }));
  }

  indexes(tableName: string): Array<{ columns: string[]; unique: boolean; name?: string }> {
    const idxs = this._indexes.get(tableName);
    if (!idxs) return [];
    return idxs.map((i) => ({ ...i, columns: [...i.columns] }));
  }
}

// === Migrator (Rails defines this in migration.rb) ===

export interface MigrationProxy {
  version: string;
  name: string;
  filename?: string;
  migration: () => MigrationLike;
}

export interface MigrationLike {
  up(adapter: DatabaseAdapter): Promise<void>;
  down(adapter: DatabaseAdapter): Promise<void>;
}

export class Migrator {
  private _adapter: DatabaseAdapter;
  private _migrations: MigrationProxy[];
  private _schemaTableName = "schema_migrations";
  verbose = true;
  private _output: string[] = [];

  constructor(adapter: DatabaseAdapter, migrations: MigrationProxy[]) {
    this._adapter = adapter;
    this._validateMigrations(migrations);
    const normalized = migrations.map((m) => ({
      ...m,
      version: String(BigInt(m.version)),
    }));
    this._migrations = this._sortMigrations(normalized);
  }

  get migrations(): MigrationProxy[] {
    return [...this._migrations];
  }

  get output(): readonly string[] {
    return [...this._output];
  }

  /**
   * Run all pending migrations up, or migrate to a specific version.
   *
   * Mirrors: ActiveRecord::Migrator#migrate
   */
  async migrate(targetVersion?: number | string | null): Promise<void> {
    await this._ensureSchemaTable();

    if (targetVersion !== undefined && targetVersion !== null) {
      this._validateTargetVersion(targetVersion);
      const target = BigInt(targetVersion);
      const current = BigInt(await this.currentVersion());
      if (target > current) {
        await this._migrateUp(targetVersion);
      } else if (target < current) {
        await this._migrateDown(targetVersion);
      }
    } else {
      await this._migrateUp(null);
    }
  }

  /**
   * Run all pending migrations up to the target version (or all if no target).
   *
   * Mirrors: ActiveRecord::Migrator.up
   */
  async up(targetVersion?: number | string | null): Promise<void> {
    await this._ensureSchemaTable();
    await this._migrateUp(targetVersion ?? null);
  }

  /**
   * Revert all applied migrations down to the target version.
   *
   * Mirrors: ActiveRecord::Migrator.down
   */
  async down(targetVersion?: number | string | null): Promise<void> {
    await this._ensureSchemaTable();
    await this._migrateDown(targetVersion ?? 0);
  }

  /**
   * Rollback N migrations.
   *
   * Mirrors: ActiveRecord::Migrator#rollback
   */
  async rollback(steps: number = 1): Promise<void> {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`Invalid steps: ${steps}. Must be a non-negative integer.`);
    }
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    const appliedMigrations = this._migrations.filter((m) => applied.has(m.version)).reverse();
    const toRollback = appliedMigrations.slice(0, steps);

    for (const proxy of toRollback) {
      await this._runMigration(proxy, "down");
    }
  }

  /**
   * Move forward N migrations.
   *
   * Mirrors: ActiveRecord::Migrator#forward
   */
  async forward(steps: number = 1): Promise<void> {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`Invalid steps: ${steps}. Must be a non-negative integer.`);
    }
    await this._ensureSchemaTable();
    const pending = await this.pendingMigrations();
    const toRun = pending.slice(0, steps);

    for (const proxy of toRun) {
      await this._runMigration(proxy, "up");
    }
  }

  /**
   * Get the current schema version.
   *
   * Mirrors: ActiveRecord::Migrator.current_version
   */
  async currentVersion(): Promise<number> {
    await this._ensureSchemaTable();
    const versions = await this.getAllVersions();
    if (versions.length === 0) return 0;
    let max = BigInt(0);
    for (const v of versions) {
      const bv = BigInt(v);
      if (bv > max) max = bv;
    }
    return Number(max);
  }

  /**
   * Get all applied migration versions.
   *
   * Mirrors: ActiveRecord::Migrator.get_all_versions
   */
  async getAllVersions(): Promise<string[]> {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    return [...applied].sort((a, b) => {
      const ba = BigInt(a);
      const bb = BigInt(b);
      if (ba < bb) return -1;
      if (ba > bb) return 1;
      return 0;
    });
  }

  /**
   * Get pending (unapplied) migrations.
   *
   * Mirrors: ActiveRecord::Migrator#pending_migrations
   */
  async pendingMigrations(): Promise<MigrationProxy[]> {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    return this._migrations.filter((m) => !applied.has(m.version));
  }

  /**
   * Get status of all migrations.
   *
   * Mirrors: ActiveRecord::Migrator#migrations_status
   */
  async migrationsStatus(): Promise<
    Array<{ status: "up" | "down"; version: string; name: string }>
  > {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();

    return this._migrations.map((m) => ({
      status: applied.has(m.version) ? ("up" as const) : ("down" as const),
      version: m.version,
      name: m.name,
    }));
  }

  /**
   * Find migrations from directory paths.
   * In our TS implementation, migrations are registered programmatically
   * rather than discovered from the filesystem.
   *
   * Mirrors: ActiveRecord::MigrationContext#migrations
   */
  static fromPaths(
    adapter: DatabaseAdapter,
    migrations: MigrationProxy[],
    _paths?: string[],
  ): Migrator {
    return new Migrator(adapter, migrations);
  }

  private _sortMigrations(migrations: MigrationProxy[]): MigrationProxy[] {
    return [...migrations].sort((a, b) => {
      const va = BigInt(a.version);
      const vb = BigInt(b.version);
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    });
  }

  private _validateMigrations(migrations: MigrationProxy[]): void {
    const versions = new Set<string>();
    const names = new Set<string>();

    for (const m of migrations) {
      if (!m.version || !/^\d+$/.test(m.version)) {
        throw new Error(
          `Invalid migration version: ${m.version}. Version must be a numeric string.`,
        );
      }
      const normalized = String(BigInt(m.version));
      if (versions.has(normalized)) {
        throw new Error(`Duplicate migration version: ${m.version}`);
      }
      if (names.has(m.name)) {
        throw new Error(`Duplicate migration name: ${m.name}`);
      }
      versions.add(normalized);
      names.add(m.name);
    }
  }

  private _schemaTableEnsured = false;

  private async _ensureSchemaTable(): Promise<void> {
    if (this._schemaTableEnsured) return;
    await this._adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS "${this._schemaTableName}" ("version" VARCHAR(255) NOT NULL PRIMARY KEY)`,
    );
    this._schemaTableEnsured = true;
  }

  private async _appliedVersions(): Promise<Set<string>> {
    const rows = await this._adapter.execute(`SELECT "version" FROM "${this._schemaTableName}"`);
    return new Set(
      rows.map((r) => {
        const v = String(r.version).trim();
        try {
          return String(BigInt(v));
        } catch {
          return v;
        }
      }),
    );
  }

  private _validateTargetVersion(v: number | string): void {
    if (typeof v === "string") {
      if (!/^\d+$/.test(v)) {
        throw new Error(`Invalid target version: ${v}. Must be a non-negative numeric value.`);
      }
    } else {
      if (!Number.isInteger(v) || v < 0) {
        throw new Error(`Invalid target version: ${v}. Must be a non-negative integer.`);
      }
    }
  }

  private async _migrateUp(targetVersion: number | string | null): Promise<void> {
    if (targetVersion !== null) this._validateTargetVersion(targetVersion);
    const target = targetVersion !== null ? BigInt(targetVersion) : null;
    const applied = await this._appliedVersions();

    for (const proxy of this._migrations) {
      if (applied.has(proxy.version)) continue;
      if (target !== null && BigInt(proxy.version) > target) break;
      await this._runMigration(proxy, "up");
    }
  }

  private async _migrateDown(targetVersion: number | string): Promise<void> {
    this._validateTargetVersion(targetVersion);
    const target = BigInt(targetVersion);
    const applied = await this._appliedVersions();
    const toRevert = this._migrations
      .filter((m) => applied.has(m.version) && BigInt(m.version) > target)
      .reverse();

    for (const proxy of toRevert) {
      await this._runMigration(proxy, "down");
    }
  }

  private async _runMigration(proxy: MigrationProxy, direction: "up" | "down"): Promise<void> {
    if (this.verbose) {
      const action = direction === "up" ? "migrating" : "reverting";
      this._output.push(`== ${proxy.version} ${proxy.name}: ${action} ==`);
    }

    const migration = proxy.migration();
    if (direction === "up") {
      await migration.up(this._adapter);
      await this._adapter.executeMutation(
        `INSERT INTO "${this._schemaTableName}" ("version") VALUES (?)`,
        [proxy.version],
      );
    } else {
      await migration.down(this._adapter);
      await this._adapter.executeMutation(
        `DELETE FROM "${this._schemaTableName}" WHERE "version" = ?`,
        [proxy.version],
      );
    }

    if (this.verbose) {
      const action = direction === "up" ? "migrated" : "reverted";
      this._output.push(`== ${proxy.version} ${proxy.name}: ${action} ==`);
    }
  }
}
